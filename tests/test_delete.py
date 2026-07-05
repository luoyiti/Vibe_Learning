"""ks delete — remove a unit through the single writer, keep the index consistent."""

from __future__ import annotations

import shutil

import pytest
from conftest import base_meta

from ks import index, unit
from ks.config import index_dir
from ks.query import query
from ks.unit import KSError


def _ids(records):
    return {r["id"] for r in records}


def test_delete_removes_unit_and_index_rows(ks_root, make_draft):
    keep = unit.ingest(ks_root, make_draft("keep", base_meta(title="Keep me")))
    drop = unit.ingest(ks_root, make_draft("drop", base_meta(title="Drop me")))
    assert _ids(query(ks_root)) == {keep["id"], drop["id"]}

    summary = unit.delete(ks_root, drop["id"])
    assert summary["deleted"] is True
    assert summary["id"] == drop["id"]

    # gone from disk and from the index
    assert unit.find_unit_dir(ks_root, drop["id"]) is None
    assert _ids(query(ks_root)) == {keep["id"]}


def test_delete_dry_run_changes_nothing(ks_root, make_draft):
    m = unit.ingest(ks_root, make_draft("u", base_meta()))
    summary = unit.delete(ks_root, m["id"], dry_run=True)

    assert summary["deleted"] is False
    assert unit.find_unit_dir(ks_root, m["id"]) is not None
    assert _ids(query(ks_root)) == {m["id"]}


def test_delete_unknown_id_raises(ks_root, make_draft):
    unit.ingest(ks_root, make_draft("u", base_meta()))
    with pytest.raises(KSError):
        unit.delete(ks_root, "01HXY8ZQ3FABCDEFGHJKMNPQRS")  # valid ULID, not present


def test_delete_reports_dangling_referrers(ks_root, make_draft):
    target = unit.ingest(ks_root, make_draft("target", base_meta(title="Target")))
    referrer = unit.ingest(ks_root, make_draft("ref", base_meta(
        title="Referrer",
        relations=[{"type": "related", "target": target["id"]}],
    )))

    preview = unit.delete(ks_root, target["id"], dry_run=True)
    ref_ids = {r["id"] for r in preview["referrers"]}
    assert referrer["id"] in ref_ids


def test_rebuild_invariant_holds_after_delete(ks_root, make_draft):
    a = unit.ingest(ks_root, make_draft("a", base_meta(title="A")))
    b = unit.ingest(ks_root, make_draft("b", base_meta(title="B")))
    unit.delete(ks_root, a["id"])

    before = query(ks_root, sort="recent")
    shutil.rmtree(index_dir(ks_root))
    index.reindex(ks_root)
    after = query(ks_root, sort="recent")

    assert _ids(before) == {b["id"]}
    assert after == before
