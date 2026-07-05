"""Index/query projection of source, references, confidence, original_question.

The display layer may only read the index/query layer, so these meta fields
must round-trip notes/ -> catalog.db -> query() without touching meta.json.
"""

from __future__ import annotations

import shutil
import sqlite3

import pytest

from conftest import base_meta

from ks import index, unit
from ks.config import catalog_db, index_dir
from ks.query import query
from ks.unit import KSError

SOURCE = {"channel": "claude-code", "model": "claude-opus-4-8",
          "transcript": "source/chat.md"}
REFERENCES = [
    {"title": "Z-last on purpose", "url": "https://example.com/z"},
    {"url": "https://example.com/a"},
]


def test_query_projects_source_references_confidence(ks_root, make_draft):
    meta = unit.ingest(ks_root, make_draft("d1", base_meta(
        source=SOURCE, references=REFERENCES, confidence="solid",
    )))
    (rec,) = query(ks_root)
    assert rec["id"] == meta["id"]
    assert rec["source"] == SOURCE
    assert rec["confidence"] == "solid"
    assert rec["original_question"] == "What is the test topic?"
    # author order preserved (not alphabetised), missing title -> None
    assert rec["references"] == [
        {"title": "Z-last on purpose", "url": "https://example.com/z"},
        {"title": None, "url": "https://example.com/a"},
    ]


def test_unit_without_source_yields_null_and_empty(ks_root, make_draft):
    unit.ingest(ks_root, make_draft("d1", base_meta()))
    (rec,) = query(ks_root)
    assert rec["source"] is None
    assert rec["references"] == []
    assert rec["confidence"] is None


def test_rebuild_invariant_covers_new_fields(ks_root, make_draft):
    unit.ingest(ks_root, make_draft("d1", base_meta(
        title="With source", source=SOURCE, references=REFERENCES,
        confidence="moderate",
    )))
    unit.ingest(ks_root, make_draft("d2", base_meta(title="Bare")))

    before = query(ks_root, sort="recent")
    shutil.rmtree(index_dir(ks_root))
    assert index.reindex(ks_root) == 2
    assert query(ks_root, sort="recent") == before


def test_stale_catalog_is_rejected(ks_root):
    """A catalog built by an older ks must fail loudly, pointing at reindex."""
    index_dir(ks_root).mkdir(exist_ok=True)
    conn = sqlite3.connect(catalog_db(ks_root))
    conn.execute(
        "CREATE TABLE units (id TEXT PRIMARY KEY, title TEXT NOT NULL, "
        "summary TEXT NOT NULL, domain TEXT, status TEXT NOT NULL, "
        "created_at TEXT NOT NULL, updated_at TEXT NOT NULL, "
        "artifact_format TEXT NOT NULL, artifact_entry TEXT NOT NULL, "
        "path TEXT NOT NULL)"
    )
    conn.commit()
    conn.close()

    with pytest.raises(KSError, match="ks reindex"):
        query(ks_root)
