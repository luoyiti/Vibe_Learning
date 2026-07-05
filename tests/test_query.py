"""Query filters and sorting return the correct sets."""

from __future__ import annotations

from conftest import base_meta

from ks import unit
from ks.query import _escape_like, query


def _ids(records):
    return {r["id"] for r in records}


def _seed(ks_root, make_draft):
    u1 = unit.ingest(ks_root, make_draft("u1", base_meta(
        title="MVCC and snapshots", domain="databases",
        tags=["databases", "concurrency"], concepts=["mvcc"],
    ), note="A note about snapshot isolation and visibility."))
    u2 = unit.ingest(ks_root, make_draft("u2", base_meta(
        title="Python generators", domain="python", status="stable",
        tags=["python"], concepts=["generators"],
    ), note="Lazy iteration with yield."))
    u3 = unit.ingest(ks_root, make_draft("u3", base_meta(
        title="B-tree indexing", domain="databases", confidence="shaky",
        tags=["databases"], concepts=["indexing"],
    ), note="How a btree keeps lookups logarithmic."))
    return u1["id"], u2["id"], u3["id"]


def test_filter_by_domain(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    assert _ids(query(ks_root, domain="databases")) == {u1, u3}
    assert _ids(query(ks_root, domain="python")) == {u2}


def test_filter_by_tag_and_concept(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    assert _ids(query(ks_root, tags=["concurrency"])) == {u1}
    assert _ids(query(ks_root, tags=["databases"])) == {u1, u3}
    assert _ids(query(ks_root, concepts=["generators"])) == {u2}


def test_multiple_tags_are_anded(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    assert _ids(query(ks_root, tags=["databases", "concurrency"])) == {u1}
    assert _ids(query(ks_root, tags=["databases", "python"])) == set()


def test_filter_by_status(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    assert _ids(query(ks_root, status="stable")) == {u2}
    assert _ids(query(ks_root, status="draft")) == {u1, u3}


def test_full_text_search(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    assert _ids(query(ks_root, text="snapshot")) == {u1}
    assert _ids(query(ks_root, text="btree")) == {u3}
    assert _ids(query(ks_root, text="nonexistentword")) == set()


def test_since_until_bound_created_at(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    all_ids = {u1, u2, u3}
    assert _ids(query(ks_root, since="2000-01-01T00:00:00+00:00")) == all_ids
    assert _ids(query(ks_root, until="2000-01-01T00:00:00+00:00")) == set()
    assert _ids(query(ks_root, since="2100-01-01T00:00:00+00:00")) == set()


def test_sort_recent_and_stale_track_updated_at(ks_root, make_draft):
    u1, u2, u3 = _seed(ks_root, make_draft)
    # Upsert u1 so it becomes the most-recently-updated unit.
    unit.ingest(ks_root, make_draft("u1b", base_meta(
        id=u1, title="MVCC and snapshots (rev)", domain="databases",
        tags=["databases", "concurrency"], concepts=["mvcc"],
    )))

    recent = [r["id"] for r in query(ks_root, sort="recent")]
    stale = [r["id"] for r in query(ks_root, sort="stale")]

    assert len(recent) == len(stale) == 3
    assert recent[0] == u1          # newest updated first
    assert stale[-1] == u1          # newest updated last
    assert set(recent) == set(stale)


def test_limit(ks_root, make_draft):
    _seed(ks_root, make_draft)
    assert len(query(ks_root, limit=2)) == 2


def test_escape_like_escapes_metacharacters():
    assert _escape_like("5%") == "5\\%"
    assert _escape_like("a_b") == "a\\_b"
    assert _escape_like("c\\d") == "c\\\\d"
    assert _escape_like("plain") == "plain"
