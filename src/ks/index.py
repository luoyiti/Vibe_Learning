"""reindex — (re)build the derived SQLite catalog from `notes/`.

The catalog (`index/catalog.db`) is a pure projection of the unit files. The
load-bearing invariant (CONTEXT.md §2.1) is that deleting `index/` entirely and
running `ks reindex` reproduces a catalog that answers every query identically.
Nothing here ever writes to `notes/`, and nothing here depends on `graph/`.

Tables
------
  units(id PK, title, summary, domain, status, created_at, updated_at,
        artifact_format, artifact_entry, path, original_question,
        confidence, source_channel, source_model, source_transcript)
  tags(unit_id, tag)
  concepts(unit_id, concept)
  relations(src_id, type, target_id, note)
  refs(unit_id, seq, title, url)   external references, in meta order
  notes_fts                 full-text over note.md bodies

`notes_fts` is an FTS5 virtual table when the runtime's SQLite supports it,
otherwise a plain fallback table queried with LIKE. The choice is deterministic
per machine, so the rebuild invariant holds within an environment.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from . import unit
from .config import catalog_db, index_dir

# ---------------------------------------------------------------------------
# FTS capability detection
# ---------------------------------------------------------------------------


def _fts5_available() -> bool:
    try:
        probe = sqlite3.connect(":memory:")
        try:
            probe.execute("CREATE VIRTUAL TABLE _fts_probe USING fts5(x)")
            return True
        finally:
            probe.close()
    except sqlite3.OperationalError:
        return False


_FTS5 = _fts5_available()


# ---------------------------------------------------------------------------
# Connection / schema
# ---------------------------------------------------------------------------


def connect(root: Path, create: bool = True) -> sqlite3.Connection:
    """Open (and optionally initialise) the catalog database for `root`."""
    index_dir(root).mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(catalog_db(root))
    conn.row_factory = sqlite3.Row
    if create:
        _ensure_schema(conn)
    _check_catalog_fresh(conn, root)
    return conn


def _check_catalog_fresh(conn: sqlite3.Connection, root: Path) -> None:
    """Reject a catalog built by an older ks (CREATE IF NOT EXISTS never adds
    columns, so an old `units` table would fail every downstream read)."""
    cols = {r[1] for r in conn.execute("PRAGMA table_info(units)")}
    if cols and "source_transcript" not in cols:
        conn.close()
        raise unit.KSError(
            f"catalog at {catalog_db(root)} predates this version of ks. "
            "Rebuild it with `ks reindex`."
        )


def fts_enabled() -> bool:
    """Whether the full-text table is a real FTS5 table (vs. LIKE fallback)."""
    return _FTS5


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS units (
            id                TEXT PRIMARY KEY,
            title             TEXT NOT NULL,
            summary           TEXT NOT NULL,
            domain            TEXT,
            status            TEXT NOT NULL,
            created_at        TEXT NOT NULL,
            updated_at        TEXT NOT NULL,
            artifact_format   TEXT NOT NULL,
            artifact_entry    TEXT NOT NULL,
            path              TEXT NOT NULL,
            original_question TEXT,
            confidence        TEXT,
            source_channel    TEXT,
            source_model      TEXT,
            source_transcript TEXT
        );
        CREATE TABLE IF NOT EXISTS tags (
            unit_id TEXT NOT NULL,
            tag     TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS concepts (
            unit_id TEXT NOT NULL,
            concept TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS relations (
            src_id    TEXT NOT NULL,
            type      TEXT NOT NULL,
            target_id TEXT NOT NULL,
            note      TEXT
        );
        CREATE TABLE IF NOT EXISTS refs (
            unit_id TEXT NOT NULL,
            seq     INTEGER NOT NULL,
            title   TEXT,
            url     TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_tags_unit     ON tags(unit_id);
        CREATE INDEX IF NOT EXISTS idx_tags_tag      ON tags(tag);
        CREATE INDEX IF NOT EXISTS idx_concepts_unit ON concepts(unit_id);
        CREATE INDEX IF NOT EXISTS idx_concepts_name ON concepts(concept);
        CREATE INDEX IF NOT EXISTS idx_relations_src ON relations(src_id);
        CREATE INDEX IF NOT EXISTS idx_refs_unit     ON refs(unit_id);
        """
    )
    if _FTS5:
        conn.execute(
            "CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts "
            "USING fts5(body, unit_id UNINDEXED)"
        )
    else:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS notes_fts ("
            "unit_id TEXT NOT NULL, body TEXT NOT NULL)"
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Row writes (delete-then-insert keeps full and incremental paths identical)
# ---------------------------------------------------------------------------


def _delete_unit_rows(conn: sqlite3.Connection, unit_id: str) -> None:
    for table in ("units", "tags", "concepts", "relations", "refs"):
        col = "id" if table == "units" else ("src_id" if table == "relations" else "unit_id")
        conn.execute(f"DELETE FROM {table} WHERE {col} = ?", (unit_id,))
    conn.execute("DELETE FROM notes_fts WHERE unit_id = ?", (unit_id,))


def _insert_unit(conn: sqlite3.Connection, root: Path, unit_dir: Path) -> str:
    meta = unit.load_meta(unit_dir)
    body = unit.read_note(unit_dir)
    unit_id = meta["id"]
    rel_path = unit_dir.resolve().relative_to(root.resolve()).as_posix()
    artifact = meta.get("artifact", {})
    source = meta.get("source") or {}

    conn.execute(
        "INSERT INTO units (id, title, summary, domain, status, created_at, "
        "updated_at, artifact_format, artifact_entry, path, original_question, "
        "confidence, source_channel, source_model, source_transcript) "
        "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (
            unit_id,
            meta.get("title", ""),
            meta.get("summary", ""),
            meta.get("domain"),
            meta.get("status", ""),
            meta.get("created_at", ""),
            meta.get("updated_at", ""),
            artifact.get("format", ""),
            artifact.get("entry", ""),
            rel_path,
            meta.get("original_question"),
            meta.get("confidence"),
            source.get("channel"),
            source.get("model"),
            source.get("transcript"),
        ),
    )
    conn.executemany(
        "INSERT INTO tags (unit_id, tag) VALUES (?, ?)",
        [(unit_id, t) for t in meta.get("tags", [])],
    )
    conn.executemany(
        "INSERT INTO concepts (unit_id, concept) VALUES (?, ?)",
        [(unit_id, c) for c in meta.get("concepts", [])],
    )
    conn.executemany(
        "INSERT INTO relations (src_id, type, target_id, note) VALUES (?,?,?,?)",
        [
            (unit_id, r["type"], r["target"], r.get("note"))
            for r in meta.get("relations", [])
        ],
    )
    conn.executemany(
        "INSERT INTO refs (unit_id, seq, title, url) VALUES (?,?,?,?)",
        [
            (unit_id, seq, r.get("title"), r["url"])
            for seq, r in enumerate(meta.get("references", []))
        ],
    )
    conn.execute(
        "INSERT INTO notes_fts (unit_id, body) VALUES (?, ?)", (unit_id, body)
    )
    return unit_id


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------


def reindex(root: Path) -> int:
    """Full rebuild: drop the catalog and reproject every unit from `notes/`.

    Returns the number of units indexed.
    """
    db = catalog_db(root)
    if db.exists():
        db.unlink()
    conn = connect(root, create=True)
    try:
        count = 0
        for unit_dir in unit.iter_unit_dirs(root):
            _insert_unit(conn, root, unit_dir)
            count += 1
        conn.commit()
        return count
    finally:
        conn.close()


def reindex_unit(root: Path, unit_id: str) -> bool:
    """Incrementally (re)index a single unit by ID.

    If the unit no longer exists on disk, its rows are removed. Returns True if
    the unit was (re)indexed, False if it was removed/absent.
    """
    conn = connect(root, create=True)
    try:
        _delete_unit_rows(conn, unit_id)
        unit_dir = unit.find_unit_dir(root, unit_id)
        present = unit_dir is not None
        if present:
            _insert_unit(conn, root, unit_dir)
        conn.commit()
        return present
    finally:
        conn.close()
