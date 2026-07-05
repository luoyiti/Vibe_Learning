"""serve — local read-only web UI for browsing the knowledge store.

The display layer (CONTEXT.md layer ④). Everything it shows comes from the
derived catalog via `query.query()` / read-only SQL — never from parsing
`notes/**/meta.json` at request time. It writes nothing, ever: GET/HEAD only,
and edits must go back through `ks ingest` (the single writer).

Endpoints
---------
  GET /                 the single-file SPA (src/ks/webui/index.html)
  GET /api/units        query-parameter passthrough to query.query();
                        response is the same bare JSON array `ks query` emits
  GET /api/facets       tag/domain/concept/status counts + date range, for
                        the filter sidebar
  GET /files/<path>     static files (artifacts, transcripts, assets), jailed
                        to paths strictly under notes/

Never reads `graph/` (decoupling red line: the UI is fully functional as a
list/search view without a graph).
"""

from __future__ import annotations

import json
import mimetypes
import urllib.parse
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from importlib import resources
from pathlib import Path

from . import index, query as query_mod
from .config import catalog_db, notes_dir
from .unit import KSError

_TEXT_TYPES = ("text/",)
_EXTRA_MIME = {".md": "text/markdown", ".ipynb": "application/json"}

_webui_cache: bytes | None = None


def _webui_bytes() -> bytes:
    global _webui_cache
    if _webui_cache is None:
        _webui_cache = (
            resources.files("ks").joinpath("webui", "index.html").read_bytes()
        )
    return _webui_cache


# ---------------------------------------------------------------------------
# Facets (read-only aggregates for the filter sidebar)
# ---------------------------------------------------------------------------


def facets(root: Path) -> dict:
    """Counts per tag/domain/concept/status plus the created_at range."""
    if not catalog_db(root).exists():
        raise KSError(
            f"no catalog at {catalog_db(root)}. Build it first with `ks reindex`."
        )
    conn = index.connect(root, create=False)
    try:
        def group(sql: str) -> list[dict]:
            return [
                {"name": r[0], "count": r[1]} for r in conn.execute(sql)
            ]

        total = conn.execute("SELECT COUNT(*) FROM units").fetchone()[0]
        lo, hi = conn.execute(
            "SELECT MIN(created_at), MAX(created_at) FROM units"
        ).fetchone()
        return {
            "total": total,
            "tags": group(
                "SELECT tag, COUNT(*) c FROM tags GROUP BY tag ORDER BY c DESC, tag"
            ),
            "domains": group(
                "SELECT domain, COUNT(*) c FROM units WHERE domain IS NOT NULL "
                "GROUP BY domain ORDER BY c DESC, domain"
            ),
            "concepts": group(
                "SELECT concept, COUNT(*) c FROM concepts "
                "GROUP BY concept ORDER BY c DESC, concept"
            ),
            "statuses": group(
                "SELECT status, COUNT(*) c FROM units "
                "GROUP BY status ORDER BY c DESC, status"
            ),
            "date_range": None if lo is None else {"min": lo, "max": hi},
            "fts": index.fts_enabled(),
        }
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Request handler
# ---------------------------------------------------------------------------


class _Handler(BaseHTTPRequestHandler):
    ks_root: Path  # set by make_server on a per-server subclass

    # -- plumbing -----------------------------------------------------------

    def log_message(self, format: str, *args) -> None:  # noqa: A002
        pass  # keep the terminal quiet; errors surface as HTTP statuses

    def _respond(
        self, status: int, content_type: str, body: bytes, extra: dict | None = None
    ) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _json(self, status: int, payload: object) -> None:
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self._respond(status, "application/json; charset=utf-8", body)

    def _error(self, status: int, message: str, **fields) -> None:
        self._json(status, {"error": message, **fields})

    def _method_not_allowed(self) -> None:
        self._respond(
            405,
            "application/json; charset=utf-8",
            b'{"error": "read-only server: GET and HEAD only"}',
            {"Allow": "GET, HEAD"},
        )

    do_POST = do_PUT = do_DELETE = do_PATCH = _method_not_allowed

    # -- routing ------------------------------------------------------------

    def do_GET(self) -> None:
        try:
            self._route()
        except BrokenPipeError:
            pass
        except Exception as exc:  # never let one request kill the server
            try:
                self._error(500, f"internal error: {exc}")
            except Exception:
                pass

    do_HEAD = do_GET

    def _route(self) -> None:
        path = urllib.parse.urlsplit(self.path).path
        if path in ("/", "/index.html"):
            self._respond(
                200,
                "text/html; charset=utf-8",
                _webui_bytes(),
                {"Cache-Control": "no-store"},
            )
        elif path == "/api/units":
            self._api_units()
        elif path == "/api/facets":
            self._api_facets()
        elif path.startswith("/files/"):
            self._files(path)
        else:
            self._error(404, "not found")

    # -- endpoints ----------------------------------------------------------

    def _api_units(self) -> None:
        qs = urllib.parse.parse_qs(urllib.parse.urlsplit(self.path).query)

        def first(name: str) -> str | None:
            values = qs.get(name)
            return values[0] if values else None

        sort = first("sort")
        if sort is not None and sort not in query_mod.SORT_KEYS:
            return self._error(
                400, f"unknown sort: {sort!r} (expected one of {sorted(query_mod.SORT_KEYS)})"
            )
        limit_raw = first("limit")
        limit = None
        if limit_raw is not None:
            try:
                limit = int(limit_raw)
            except ValueError:
                return self._error(400, f"limit must be an integer, got {limit_raw!r}")

        try:
            records = query_mod.query(
                self.ks_root,
                tags=qs.get("tag"),
                concepts=qs.get("concept"),
                domain=first("domain"),
                status=first("status"),
                since=first("since"),
                until=first("until"),
                text=first("text"),
                sort=sort,
                limit=limit,
            )
        except KSError as exc:
            return self._error(503, str(exc), hint="ks reindex")
        self._json(200, records)

    def _api_facets(self) -> None:
        try:
            payload = facets(self.ks_root)
        except KSError as exc:
            return self._error(503, str(exc), hint="ks reindex")
        self._json(200, payload)

    def _files(self, path: str) -> None:
        rel = urllib.parse.unquote(path[len("/files/"):])
        if rel.startswith("/") or "\x00" in rel or "\\" in rel:
            return self._error(403, "forbidden")
        target = (self.ks_root / rel).resolve()
        if not target.is_relative_to(notes_dir(self.ks_root).resolve()):
            return self._error(403, "forbidden")
        if not target.is_file():
            return self._error(404, "not found")

        ctype = (
            _EXTRA_MIME.get(target.suffix.lower())
            or mimetypes.guess_type(target.name)[0]
            or "application/octet-stream"
        )
        if ctype.startswith(_TEXT_TYPES) or ctype == "application/json":
            ctype += "; charset=utf-8"
        self._respond(200, ctype, target.read_bytes())


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def make_server(root: Path, host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    """Build (and bind) the server; port 0 picks a free port."""
    handler = type("KSRequestHandler", (_Handler,), {"ks_root": root.resolve()})
    return ThreadingHTTPServer((host, port), handler)


def serve(
    root: Path,
    *,
    host: str = "127.0.0.1",
    port: int = 8765,
    open_browser: bool = False,
) -> int:
    """`ks serve` entry point — run until Ctrl-C."""
    server = make_server(root, host, port)
    url = f"http://{host}:{server.server_address[1]}/"
    print(f"serving {root} at {url}  (read-only; Ctrl-C to stop)")
    if open_browser:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nstopped.")
    finally:
        server.server_close()
    return 0
