"""The load-bearing wall: invalid meta is rejected and nothing is written."""

from __future__ import annotations

import json

import pytest
from conftest import base_meta

from ks import unit
from ks.config import catalog_db
from ks.ids import is_valid_ulid


def _unit_count(root):
    return len(list(unit.iter_unit_dirs(root)))


def test_valid_draft_ingests_and_validates(ks_root, make_draft):
    draft = make_draft("ok", base_meta())
    meta = unit.ingest(ks_root, draft)

    assert is_valid_ulid(meta["id"])
    assert _unit_count(ks_root) == 1
    # tool-generated fields are present (and were not trusted from the draft)
    for field in ("schema_version", "id", "slug", "created_at", "updated_at"):
        assert field in meta
    ok, report = unit.validate_units(ks_root, all_units=True)
    assert ok, report


def _without(meta: dict, key: str) -> dict:
    return {k: v for k, v in meta.items() if k != key}


@pytest.mark.parametrize(
    "bad_meta, reason",
    [
        (base_meta(summary=None), "summary wrong type"),
        (_without(base_meta(), "summary"), "missing required summary"),
        (base_meta(id="not-a-valid-ulid"), "malformed id"),
        (base_meta(id="01HXY8ZQ3FILOU000000000000"), "id uses excluded letters I/L/O/U"),
        (base_meta(tags=["Bad Tag"]), "tag breaks ^[a-z0-9-]+$"),
        (base_meta(tags=[]), "tags must have >= 1 item"),
        (base_meta(status="archived"), "status not in enum"),
        (base_meta(bogus_field=123), "additionalProperties forbidden"),
        (base_meta(relations=[{"type": "related", "target": "nope"}]), "relation target not a ULID"),
        (base_meta(artifact={"format": "markdown"}), "artifact missing entry"),
    ],
)
def test_invalid_meta_rejected_and_nothing_written(ks_root, make_draft, bad_meta, reason):
    draft = make_draft("bad", bad_meta)

    with pytest.raises(unit.ValidationError):
        unit.ingest(ks_root, draft)

    # 承重墙: rejection leaves the filesystem completely untouched
    assert _unit_count(ks_root) == 0, f"unit written despite invalid meta ({reason})"
    assert not catalog_db(ks_root).exists(), f"index touched despite invalid meta ({reason})"


def test_validate_command_flags_corrupt_stored_unit(ks_root, make_draft):
    # ingest a good unit, then corrupt its stored meta.json directly on disk
    draft = make_draft("ok", base_meta())
    meta = unit.ingest(ks_root, draft)
    unit_dir = unit.find_unit_dir(ks_root, meta["id"])

    corrupt = unit.load_meta(unit_dir)
    corrupt["tags"] = ["NOT-valid"]
    (unit_dir / unit.META_FILENAME).write_text(json.dumps(corrupt), encoding="utf-8")

    ok, report = unit.validate_units(ks_root, all_units=True)
    assert not ok
    assert any(errs for _, errs in report)


def test_missing_note_is_rejected(ks_root, make_draft):
    draft = make_draft("ok", base_meta())
    (draft / "note.md").unlink()
    with pytest.raises(unit.DraftError):
        unit.ingest(ks_root, draft)
    assert _unit_count(ks_root) == 0


def test_non_string_title_is_clean_validation_error(ks_root, make_draft):
    """A numeric title must reject cleanly, not crash slugify with a TypeError."""
    draft = make_draft("bad", base_meta(title=123))
    with pytest.raises(unit.ValidationError):
        unit.ingest(ks_root, draft)
    assert _unit_count(ks_root) == 0


def test_bad_uri_rejected_without_optional_format_libs(ks_root, make_draft):
    """The uri format check is enforced by our own checker, not an optional lib."""
    draft = make_draft("bad", base_meta(references=[{"url": "not a uri"}]))
    with pytest.raises(unit.ValidationError):
        unit.ingest(ks_root, draft)
    assert _unit_count(ks_root) == 0


def test_bad_datetime_rejected_by_validate_meta(ks_root, make_draft):
    """date-time format is enforced (timestamps are tool-owned, so test directly)."""
    draft = make_draft("ok", base_meta())
    meta = unit.ingest(ks_root, draft)
    meta_naive = dict(meta, created_at="2026-06-20T10:00:00")  # no timezone
    meta_garbage = dict(meta, updated_at="not-a-date")
    assert unit.validate_meta(meta_naive, ks_root)
    assert unit.validate_meta(meta_garbage, ks_root)
    assert not unit.validate_meta(meta, ks_root)  # the real one is fine
