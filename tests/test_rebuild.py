"""The rebuild invariant: delete index/, reindex, query results are identical."""

from __future__ import annotations

import shutil

from conftest import base_meta

from ks import index, unit
from ks.config import index_dir
from ks.query import query


def test_full_rebuild_reproduces_query_results(ks_root, make_draft):
    unit.ingest(ks_root, make_draft("d1", base_meta(
        title="Topic one", domain="databases",
        tags=["databases", "concurrency"], concepts=["mvcc"],
    )), )
    unit.ingest(ks_root, make_draft("d2", base_meta(
        title="Topic two", domain="python",
        tags=["python"], concepts=["generators"],
    )))

    before_all = query(ks_root, sort="recent")
    before_db = query(ks_root, domain="databases")
    assert len(before_all) == 2

    # nuke the entire derived layer
    shutil.rmtree(index_dir(ks_root))
    assert not (index_dir(ks_root) / "catalog.db").exists()

    rebuilt = index.reindex(ks_root)
    assert rebuilt == 2

    after_all = query(ks_root, sort="recent")
    after_db = query(ks_root, domain="databases")

    assert after_all == before_all
    assert after_db == before_db


def test_rebuild_is_idempotent(ks_root, make_draft):
    unit.ingest(ks_root, make_draft("d1", base_meta(title="Only one")))
    first = index.reindex(ks_root)
    snapshot = query(ks_root, sort="recent")
    second = index.reindex(ks_root)
    assert first == second == 1
    assert query(ks_root, sort="recent") == snapshot


def test_index_does_not_require_graph(ks_root, make_draft):
    """Decoupling red line: query works with no graph/ directory at all."""
    unit.ingest(ks_root, make_draft("d1", base_meta()))
    shutil.rmtree(ks_root / "graph", ignore_errors=True)
    index.reindex(ks_root)
    assert len(query(ks_root)) == 1
