"""query — read the derived catalog for review / retrieval.

Read-only. Returns a deterministic list of unit records (default JSON) for the
global-analysis agent to reason over. Output is fully sorted (rows by the chosen
key with an `id` tie-break; nested tags/concepts/relations alphabetised) so that
results are identical before and after an index rebuild — the projection of the
rebuild invariant onto the query layer.

Never reads `graph/`. Never writes anything.
"""

from __future__ import annotations

from pathlib import Path

from . import index
from .config import catalog_db
from .unit import KSError

SORT_KEYS = {
    "recent": "u.updated_at DESC, u.id ASC",
    "stale": "u.updated_at ASC, u.id ASC",
}
DEFAULT_SORT = "recent"


def _build_fts_match(text: str) -> str:
    """Quote each token so FTS5 treats them as literal AND-ed terms."""
    tokens = [t for t in text.split() if t]
    return " ".join('"' + t.replace('"', '""') + '"' for t in tokens)


def _escape_like(text: str) -> str:
    """Escape LIKE metacharacters so the LIKE fallback matches text literally.

    Pairs with an `ESCAPE '\\'` clause; otherwise a literal '%' or '_' in the
    search text would behave as a wildcard, diverging from the FTS5 path.
    """
    return text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def query(
    root: Path,
    *,
    tags: list[str] | None = None,
    domain: str | None = None,
    concepts: list[str] | None = None,
    status: str | None = None,
    since: str | None = None,
    until: str | None = None,
    text: str | None = None,
    sort: str | None = None,
    limit: int | None = None,
) -> list[dict]:
    """Return matching units as a list of dicts (see module docstring)."""
    db = catalog_db(root)
    if not db.exists():
        raise KSError(
            f"no catalog at {db}. Build it first with `ks reindex`."
        )

    sort = sort or DEFAULT_SORT
    if sort not in SORT_KEYS:
        raise KSError(f"unknown sort: {sort!r} (expected one of {sorted(SORT_KEYS)})")

    where: list[str] = []
    params: list[object] = []

    for tag in tags or []:
        where.append("u.id IN (SELECT unit_id FROM tags WHERE tag = ?)")
        params.append(tag)
    for concept in concepts or []:
        where.append("u.id IN (SELECT unit_id FROM concepts WHERE concept = ?)")
        params.append(concept)
    if domain is not None:
        where.append("u.domain = ?")
        params.append(domain)
    if status is not None:
        where.append("u.status = ?")
        params.append(status)
    if since is not None:
        where.append("u.created_at >= ?")
        params.append(since)
    if until is not None:
        where.append("u.created_at <= ?")
        params.append(until)
    if text:
        if index.fts_enabled():
            where.append(
                "u.id IN (SELECT unit_id FROM notes_fts WHERE notes_fts MATCH ?)"
            )
            params.append(_build_fts_match(text))
        else:
            where.append(
                "u.id IN (SELECT unit_id FROM notes_fts "
                "WHERE body LIKE ? ESCAPE '\\')"
            )
            params.append(f"%{_escape_like(text)}%")

    sql = "SELECT * FROM units u"
    if where:
        sql += " WHERE " + " AND ".join(where)
    sql += " ORDER BY " + SORT_KEYS[sort]
    if limit is not None:
        sql += " LIMIT ?"
        params.append(limit)

    conn = index.connect(root, create=False)
    try:
        rows = conn.execute(sql, params).fetchall()
        return [_assemble_record(conn, row) for row in rows]
    finally:
        conn.close()


def _assemble_record(conn, row) -> dict:
    unit_id = row["id"]
    tags = [r[0] for r in conn.execute(
        "SELECT tag FROM tags WHERE unit_id = ? ORDER BY tag", (unit_id,))]
    concepts = [r[0] for r in conn.execute(
        "SELECT concept FROM concepts WHERE unit_id = ? ORDER BY concept", (unit_id,))]
    relations = [
        {"type": r["type"], "target": r["target_id"], "note": r["note"]}
        for r in conn.execute(
            "SELECT type, target_id, note FROM relations WHERE src_id = ? "
            "ORDER BY type, target_id",
            (unit_id,),
        )
    ]
    references = [
        {"title": r["title"], "url": r["url"]}
        for r in conn.execute(
            "SELECT title, url FROM refs WHERE unit_id = ? ORDER BY seq",
            (unit_id,),
        )
    ]
    source = None
    if row["source_channel"] or row["source_model"] or row["source_transcript"]:
        source = {
            "channel": row["source_channel"],
            "model": row["source_model"],
            "transcript": row["source_transcript"],
        }
    return {
        "id": unit_id,
        "title": row["title"],
        "summary": row["summary"],
        "domain": row["domain"],
        "status": row["status"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "artifact": {"format": row["artifact_format"], "entry": row["artifact_entry"]},
        "tags": tags,
        "concepts": concepts,
        "relations": relations,
        "path": row["path"],
        "original_question": row["original_question"],
        "confidence": row["confidence"],
        "references": references,
        "source": source,
    }


def format_table(records: list[dict]) -> str:
    """Render query results as a compact fixed-width table."""
    if not records:
        return "(no matching units)"

    cols = [
        ("id", 26),
        ("status", 12),
        ("domain", 16),
        ("updated_at", 26),
        ("title", 40),
    ]
    header = "  ".join(name.upper().ljust(width) for name, width in cols)
    lines = [header, "  ".join("-" * width for _, width in cols)]
    for rec in records:
        cells = []
        for name, width in cols:
            value = rec.get(name)
            value = "" if value is None else str(value)
            if len(value) > width:
                value = value[: width - 1] + "…"
            cells.append(value.ljust(width))
        lines.append("  ".join(cells))
    return "\n".join(lines)
