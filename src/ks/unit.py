"""ingest / validate — the single writer to `notes/`.

This module is the ONLY place that creates or mutates unit files. Validation
against the load-bearing wall (schema/unit.schema.json) happens *before* any
byte is written: a meta that fails the schema is rejected with a non-zero exit
and leaves the filesystem untouched (CONTEXT.md §2 — "machine strict").

A unit on disk looks like:

    notes/<YYYY-MM>/<YYYYMMDD-HHMMSS>--<slug>--<ULID>/
      meta.json     required — validated envelope
      note.md       required — durable prose
      artifact/     optional — rich self-contained product
      assets/       optional — images/data referenced by note.md
      source/       optional — provenance (raw transcript, etc.)

Identity is the ULID, not the path. The directory name is a human-readable hint;
renaming or moving a directory never breaks a reference, because references use
IDs. On upsert we therefore update the existing directory in place.
"""

from __future__ import annotations

import json
import re
import shutil
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit

from jsonschema import Draft7Validator, FormatChecker

from . import SCHEMA_VERSION
from .config import load_schema, notes_dir
from .ids import is_valid_ulid, new_ulid

META_FILENAME = "meta.json"
NOTE_FILENAME = "note.md"
# Optional sub-directories of a unit, copied verbatim from the draft if present.
COPYABLE_SUBDIRS = ("artifact", "assets", "source")

# Canonical key order for serialised meta.json (purely cosmetic / for diffs).
_META_KEY_ORDER = (
    "schema_version", "id", "title", "slug", "summary", "original_question",
    "domain", "tags", "concepts", "relations", "references", "artifact",
    "source", "status", "confidence", "created_at", "updated_at",
)


# ---------------------------------------------------------------------------
# Errors
# ---------------------------------------------------------------------------


class KSError(Exception):
    """Base class for expected, user-facing tool errors."""


class DraftError(KSError):
    """The input draft is malformed (missing files, bad JSON, no such target)."""


class ValidationError(KSError):
    """The assembled meta.json failed schema validation. Carries the messages."""

    def __init__(self, errors: list[str]):
        self.errors = errors
        super().__init__("meta.json failed validation:\n  - " + "\n  - ".join(errors))


# ---------------------------------------------------------------------------
# Filesystem helpers (shared with index.py; no writes here)
# ---------------------------------------------------------------------------


def iter_unit_dirs(root: Path):
    """Yield every unit directory under notes/ (those containing meta.json), sorted."""
    base = notes_dir(root)
    if not base.exists():
        return
    for meta_path in sorted(base.rglob(META_FILENAME), key=lambda p: p.as_posix()):
        yield meta_path.parent


def load_meta(unit_dir: Path) -> dict:
    return json.loads((unit_dir / META_FILENAME).read_text(encoding="utf-8"))


def read_note(unit_dir: Path) -> str:
    note = unit_dir / NOTE_FILENAME
    return note.read_text(encoding="utf-8") if note.exists() else ""


def find_unit_dir(root: Path, unit_id: str) -> Path | None:
    """Locate a stored unit by ID (path is irrelevant — identity is the ULID)."""
    for unit_dir in iter_unit_dirs(root):
        try:
            if load_meta(unit_dir).get("id") == unit_id:
                return unit_dir
        except (json.JSONDecodeError, OSError):
            continue
    return None


# ---------------------------------------------------------------------------
# Pure helpers
# ---------------------------------------------------------------------------


def now_iso() -> str:
    """Current time as an ISO 8601 string with timezone (UTC)."""
    return datetime.now(timezone.utc).isoformat()


def slugify(title: object) -> str:
    """Derive a `^[a-z0-9-]+$` slug from a title, with an ASCII-only fallback.

    Defensive against non-string input: a malformed draft (e.g. a numeric title)
    must surface as a clean schema ValidationError, never a TypeError — so slug
    derivation, which runs before validation, falls back to "unit" here and lets
    the schema's `type` keyword report the real problem.
    """
    if not isinstance(title, str) or not title:
        return "unit"
    ascii_str = unicodedata.normalize("NFKD", title).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_str.lower()).strip("-")
    if len(slug) > 60:
        slug = slug[:60].rstrip("-")
    return slug or "unit"


def _ordered_meta(meta: dict) -> dict:
    """Return meta with known keys first (canonical order), unknowns appended."""
    ordered = {k: meta[k] for k in _META_KEY_ORDER if k in meta}
    for k in meta:
        if k not in ordered:
            ordered[k] = meta[k]
    return ordered


def _format_error(err) -> str:
    loc = "/".join(str(p) for p in err.absolute_path) or "<root>"
    return f"at '{loc}': {err.message}"


# A private, always-active format checker. jsonschema's built-in "date-time" and
# "uri" checkers silently no-op (fail OPEN) when their optional backing libraries
# are absent — the opposite of a load-bearing wall. We register our own
# dependency-free checkers so these formats are enforced on every install.
_FORMAT_CHECKER = FormatChecker()


@_FORMAT_CHECKER.checks("date-time", raises=(ValueError, TypeError))
def _check_date_time(value: object) -> bool:
    if not isinstance(value, str):
        return True  # a type mismatch is reported by the schema's "type" keyword
    parsed = datetime.fromisoformat(value)
    return parsed.tzinfo is not None  # ISO 8601 MUST carry a timezone


@_FORMAT_CHECKER.checks("uri", raises=(ValueError,))
def _check_uri(value: object) -> bool:
    if not isinstance(value, str):
        return True
    parts = urlsplit(value)  # may raise ValueError on malformed input -> non-conforming
    return bool(parts.scheme) and bool(parts.netloc or parts.path)


def validate_meta(meta: dict, root: Path) -> list[str]:
    """Validate a meta dict against the schema; return a list of error messages."""
    schema = load_schema(root)
    validator = Draft7Validator(schema, format_checker=_FORMAT_CHECKER)
    errors = sorted(validator.iter_errors(meta), key=lambda e: list(e.absolute_path))
    return [_format_error(e) for e in errors]


# ---------------------------------------------------------------------------
# Assembly
# ---------------------------------------------------------------------------


def _assemble(root: Path, draft_meta: dict) -> tuple[dict, Path | None]:
    """Fill tool-owned fields and apply defaults.

    Returns (full_meta, existing_dir). `existing_dir` is the on-disk directory of
    a matching unit when this is an upsert, else None.

    Policy:
      * If the draft carries an `id`, it is honoured (identity is the ID). If a
        unit with that ID exists, this is an in-place update and `created_at` is
        preserved; otherwise a new unit is created under that ID. A malformed id
        is kept verbatim so schema validation rejects it.
      * If the draft has no `id`, a fresh ULID is generated.
    Tool-owned fields (schema_version, id, slug, created_at, updated_at) are
    always set/overwritten here — never trusted from the draft.
    """
    now = now_iso()
    provided_id = draft_meta.get("id")
    existing_dir: Path | None = None
    existing: dict | None = None

    if provided_id:
        unit_id = provided_id
        if is_valid_ulid(provided_id):
            existing_dir = find_unit_dir(root, provided_id)
            if existing_dir is not None:
                existing = load_meta(existing_dir)
    else:
        unit_id = new_ulid()

    created_at = existing.get("created_at", now) if existing else now

    meta = dict(draft_meta)  # shallow copy; preserve agent-provided fields
    meta["schema_version"] = SCHEMA_VERSION
    meta["id"] = unit_id
    meta["created_at"] = created_at
    meta["updated_at"] = now
    meta["slug"] = draft_meta.get("slug") or slugify(draft_meta.get("title"))

    # Defaults for tool-completable required fields when the draft omits them.
    meta.setdefault("status", "draft")
    meta.setdefault(
        "artifact",
        {"format": "markdown", "entry": NOTE_FILENAME, "self_contained": True},
    )
    return _ordered_meta(meta), existing_dir


def _target_dir(root: Path, meta: dict) -> Path:
    """Canonical directory for a new unit: notes/<YYYY-MM>/<ts>--<slug>--<id>/."""
    try:
        created = datetime.fromisoformat(meta["created_at"])
    except ValueError:
        created = datetime.now(timezone.utc)
    month = created.strftime("%Y-%m")
    stamp = created.strftime("%Y%m%d-%H%M%S")
    name = f"{stamp}--{meta['slug']}--{meta['id']}"
    return notes_dir(root) / month / name


# ---------------------------------------------------------------------------
# ingest
# ---------------------------------------------------------------------------


def ingest(root: Path, draft_dir: Path) -> dict:
    """Validate a draft and write it into notes/ as a unit; update the index.

    Raises:
        DraftError:      the draft directory/files are missing or unreadable.
        ValidationError: assembled meta.json fails the schema (nothing written).

    Returns the assembled meta dict on success.
    """
    draft_dir = Path(draft_dir)
    if not draft_dir.is_dir():
        raise DraftError(f"draft directory not found: {draft_dir}")

    meta_path = draft_dir / META_FILENAME
    note_path = draft_dir / NOTE_FILENAME
    if not meta_path.is_file():
        raise DraftError(f"draft is missing {META_FILENAME}: {meta_path}")
    if not note_path.is_file():
        raise DraftError(f"draft is missing {NOTE_FILENAME}: {note_path}")

    try:
        draft_meta = json.loads(meta_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise DraftError(f"{meta_path} is not valid JSON: {exc}") from exc
    if not isinstance(draft_meta, dict):
        raise DraftError(f"{meta_path} must contain a JSON object")

    meta, existing_dir = _assemble(root, draft_meta)

    # --- LOAD-BEARING WALL: validate before writing anything ---------------
    errors = validate_meta(meta, root)
    if errors:
        raise ValidationError(errors)

    # --- Write (only reached once validation passes) -----------------------
    target = existing_dir if existing_dir is not None else _target_dir(root, meta)
    target.mkdir(parents=True, exist_ok=True)

    (target / META_FILENAME).write_text(
        json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    shutil.copyfile(note_path, target / NOTE_FILENAME)

    # Replace optional subdirs wholesale so an upsert is a *clean* replace: a
    # subdir present in a prior version but absent from this draft must not
    # survive (else the stored unit would carry orphan content its meta no
    # longer references).
    for sub in COPYABLE_SUBDIRS:
        src = draft_dir / sub
        dst = target / sub
        if dst.exists():
            shutil.rmtree(dst)
        if src.is_dir():
            shutil.copytree(src, dst)

    # --- Keep the derived index consistent (never touches graph/) ----------
    from . import index  # local import avoids a circular dependency at load

    index.reindex_unit(root, meta["id"])
    return meta


# ---------------------------------------------------------------------------
# delete (the only sanctioned way to remove a unit; still the single writer)
# ---------------------------------------------------------------------------


def find_referrers(root: Path, unit_id: str) -> list[dict]:
    """Units whose `relations[].target` points at `unit_id`.

    Deleting `unit_id` would leave these relations dangling, so the caller can
    warn about them. Authoritative scan of notes/ (not the possibly-stale index).
    """
    referrers: list[dict] = []
    for unit_dir in iter_unit_dirs(root):
        try:
            meta = load_meta(unit_dir)
        except (json.JSONDecodeError, OSError):
            continue
        if meta.get("id") == unit_id:
            continue
        for rel in meta.get("relations", []) or []:
            if rel.get("target") == unit_id:
                referrers.append(
                    {"id": meta.get("id"), "title": meta.get("title"), "type": rel.get("type")}
                )
                break
    return referrers


def delete(root: Path, unit_id: str, dry_run: bool = False) -> dict:
    """Delete a stored unit by ID and drop it from the index.

    This is the ONLY sanctioned way to remove a unit — deletion is a store write,
    so it goes through this single writer, never a hand-removal of `notes/` files.

    Raises:
        KSError: no unit has that ID (nothing to delete).

    Returns a summary dict ``{id, title, path, referrers, deleted}``. With
    ``dry_run=True`` nothing is removed and ``deleted`` is False — use it to
    preview the target and any relations that would dangle.
    """
    unit_dir = find_unit_dir(root, unit_id)
    if unit_dir is None:
        raise KSError(f"no unit with id {unit_id!r} (nothing to delete)")

    meta = load_meta(unit_dir)
    summary = {
        "id": unit_id,
        "title": meta.get("title"),
        "path": unit_dir.resolve().relative_to(root.resolve()).as_posix(),
        "referrers": find_referrers(root, unit_id),
        "deleted": False,
    }
    if dry_run:
        return summary

    shutil.rmtree(unit_dir)

    # Keep the derived index consistent: the unit is gone from disk, so
    # reindex_unit removes its rows (never touches graph/).
    from . import index  # local import avoids a circular dependency at load

    index.reindex_unit(root, unit_id)
    summary["deleted"] = True
    return summary


# ---------------------------------------------------------------------------
# validate (read-only inspection; never writes)
# ---------------------------------------------------------------------------


def validate_units(
    root: Path, target: str | None = None, all_units: bool = False
) -> tuple[bool, list[tuple[str, list[str]]]]:
    """Validate stored units. Returns (all_ok, [(label, errors), ...]).

    Target may be a unit ID, a path to a unit directory, or a path to a
    meta.json file. With `all_units` (or no target) every unit under notes/ is
    checked.
    """
    report: list[tuple[str, list[str]]] = []

    def _check(label: str, meta: dict) -> None:
        report.append((label, validate_meta(meta, root)))

    if target and not all_units:
        p = Path(target)
        if p.exists():
            meta_path = p / META_FILENAME if p.is_dir() else p
            if not meta_path.is_file():
                raise DraftError(f"no {META_FILENAME} found at: {target}")
            try:
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError as exc:
                raise DraftError(f"{meta_path} is not valid JSON: {exc}") from exc
            _check(str(meta_path), meta)
        else:
            unit_dir = find_unit_dir(root, target)
            if unit_dir is None:
                raise DraftError(f"no unit found for id or path: {target}")
            _check(target, load_meta(unit_dir))
    else:
        for unit_dir in iter_unit_dirs(root):
            try:
                meta = load_meta(unit_dir)
            except json.JSONDecodeError as exc:
                report.append((unit_dir.name, [f"invalid JSON: {exc}"]))
                continue
            _check(meta.get("id", unit_dir.name), meta)

    all_ok = all(not errs for _, errs in report)
    return all_ok, report
