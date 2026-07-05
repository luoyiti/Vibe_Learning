"""The display layer server: read-only, jailed to notes/, query passthrough.

Runs a real ThreadingHTTPServer on port 0 and talks to it over the socket so
routing, headers, and the traversal jail are exercised end to end. Encoded
payloads like %2e%2e travel verbatim (http.client does not normalise them).
"""

from __future__ import annotations

import json
import threading
import urllib.error
import urllib.request

import pytest

from conftest import base_meta

from ks import unit
from ks.config import catalog_db
from ks.query import query
from ks.serve import facets, make_server


def _get(url: str, method: str = "GET"):
    req = urllib.request.Request(url, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return resp.status, dict(resp.headers), resp.read()
    except urllib.error.HTTPError as exc:
        return exc.code, dict(exc.headers), exc.read()


def _seed(ks_root, make_draft):
    """Two units: one with artifact + transcript on disk, one bare."""
    rich = make_draft("rich", base_meta(
        title="Rich unit", domain="databases", status="stable",
        tags=["alpha", "beta"], concepts=["mvcc"],
        artifact={"format": "html", "entry": "artifact/index.html",
                  "self_contained": True},
        source={"channel": "claude-code", "model": "m",
                "transcript": "source/chat.md"},
    ), note="A note mentioning MVCC snapshots.")
    (rich / "artifact").mkdir()
    (rich / "artifact" / "index.html").write_text(
        "<!DOCTYPE html><title>rich artifact</title>", encoding="utf-8")
    (rich / "source").mkdir()
    (rich / "source" / "chat.md").write_text("# transcript\n", encoding="utf-8")
    rich_meta = unit.ingest(ks_root, rich)

    bare_meta = unit.ingest(ks_root, make_draft("bare", base_meta(
        title="Bare unit", status="draft", tags=["beta"], concepts=["basics"],
    )))
    return rich_meta["id"], bare_meta["id"]


@pytest.fixture
def served(ks_root, make_draft):
    rich_id, bare_id = _seed(ks_root, make_draft)
    server = make_server(ks_root, "127.0.0.1", 0)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    base = f"http://127.0.0.1:{server.server_address[1]}"
    yield ks_root, base, rich_id, bare_id
    server.shutdown()
    server.server_close()


def test_spa_is_served(served):
    _, base, *_ = served
    status, headers, body = _get(base + "/")
    assert status == 200
    assert headers["Content-Type"].startswith("text/html")
    assert "知识手账" in body.decode("utf-8")


def test_api_units_matches_query_exactly(served):
    root, base, *_ = served
    status, _, body = _get(base + "/api/units")
    assert status == 200
    assert json.loads(body) == query(root)


def test_api_units_filters(served):
    root, base, rich_id, bare_id = served
    def ids(qs):
        status, _, body = _get(base + "/api/units" + qs)
        assert status == 200
        return [r["id"] for r in json.loads(body)]

    assert ids("?tag=alpha&tag=beta") == [rich_id]        # AND semantics
    assert ids("?text=MVCC") == [rich_id]
    assert ids("?status=draft") == [bare_id]
    assert len(ids("?limit=1")) == 1
    assert set(ids("?sort=stale")) == {rich_id, bare_id}


def test_api_units_bad_params(served):
    _, base, *_ = served
    assert _get(base + "/api/units?sort=bogus")[0] == 400
    assert _get(base + "/api/units?limit=x")[0] == 400


def test_api_facets(served):
    root, base, *_ = served
    status, _, body = _get(base + "/api/facets")
    assert status == 200
    payload = json.loads(body)
    assert payload == facets(root)          # HTTP layer is a thin wrapper
    assert payload["total"] == 2
    assert {"name": "beta", "count": 2} in payload["tags"]
    assert {"name": "alpha", "count": 1} in payload["tags"]
    assert {"name": "databases", "count": 1} in payload["domains"]
    assert {"name": "draft", "count": 1} in payload["statuses"]
    assert payload["date_range"]["min"] <= payload["date_range"]["max"]
    assert isinstance(payload["fts"], bool)


def test_files_serves_artifact_and_transcript(served):
    root, base, rich_id, _ = served
    (rec,) = query(root, tags=["alpha"])
    art = f"{base}/files/{rec['path']}/{rec['artifact']['entry']}"
    status, headers, body = _get(art)
    assert status == 200
    assert headers["Content-Type"].startswith("text/html")
    assert b"rich artifact" in body

    tr = f"{base}/files/{rec['path']}/{rec['source']['transcript']}"
    assert _get(tr)[0] == 200

    head_status, head_headers, head_body = _get(art, method="HEAD")
    assert head_status == 200
    assert head_body == b""
    assert int(head_headers["Content-Length"]) == len(body)


def test_files_jail(served):
    root, base, *_ = served
    (rec,) = query(root, tags=["alpha"])
    for path, expected in [
        ("/files/%2e%2e/schema/unit.schema.json", 403),   # encoded dot-dot
        ("/files/notes/../schema/unit.schema.json", 403), # dot-dot inside
        ("/files//etc/passwd", 403),                       # absolute component
        ("/files/schema/unit.schema.json", 403),           # in root, outside notes/
        (f"/files/{rec['path']}/missing.bin", 404),        # inside jail, absent
    ]:
        assert _get(base + path)[0] == expected, path


def test_read_only_and_unknown_routes(served):
    _, base, *_ = served
    status, headers, _ = _get(base + "/api/units", method="POST")
    assert status == 405
    assert headers["Allow"] == "GET, HEAD"
    assert _get(base + "/nope")[0] == 404


def test_api_returns_503_when_catalog_vanishes(served):
    root, base, *_ = served
    catalog_db(root).unlink()
    status, _, body = _get(base + "/api/units")
    assert status == 503
    assert "ks reindex" in json.loads(body)["hint"]
    assert _get(base + "/api/facets")[0] == 503
