"""ingest / upsert behaviour beyond plain validation."""

from __future__ import annotations

import json

from conftest import base_meta

from ks import unit


def _write_draft(path, meta, note="# n\n"):
    path.mkdir(parents=True, exist_ok=True)
    (path / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (path / "note.md").write_text(note, encoding="utf-8")
    return path


def test_upsert_preserves_created_bumps_updated(ks_root, make_draft):
    m1 = unit.ingest(ks_root, make_draft("v1", base_meta(title="First")))
    uid = m1["id"]
    m2 = unit.ingest(ks_root, make_draft("v2", base_meta(id=uid, title="First revised")))

    assert m2["id"] == uid
    assert len(list(unit.iter_unit_dirs(ks_root))) == 1     # in-place, not a 2nd unit
    assert m2["created_at"] == m1["created_at"]             # created_at preserved
    assert m2["updated_at"] >= m1["updated_at"]             # updated_at bumped
    assert m2["title"] == "First revised"


def test_upsert_replaces_stale_subdirs(ks_root, tmp_path):
    """A subdir present in v1 but absent in v2 must not survive the upsert."""
    d1 = tmp_path / "v1"
    _write_draft(d1, base_meta(
        title="Rich", artifact={"format": "html", "entry": "artifact/index.html", "self_contained": True},
    ))
    (d1 / "artifact").mkdir()
    (d1 / "artifact" / "index.html").write_text("<html>v1</html>", encoding="utf-8")

    m1 = unit.ingest(ks_root, d1)
    uid = m1["id"]
    unit_dir = unit.find_unit_dir(ks_root, uid)
    assert (unit_dir / "artifact" / "index.html").exists()

    # v2: same id, no artifact dir, plain markdown
    d2 = tmp_path / "v2"
    _write_draft(d2, base_meta(
        id=uid, title="Rich (now plain)",
        artifact={"format": "markdown", "entry": "note.md", "self_contained": True},
    ))
    unit.ingest(ks_root, d2)

    assert not (unit_dir / "artifact").exists(), "stale artifact/ survived the upsert"


def test_new_unit_without_id_gets_fresh_ulid(ks_root, make_draft):
    from ks.ids import is_valid_ulid

    m1 = unit.ingest(ks_root, make_draft("a", base_meta(title="A")))
    m2 = unit.ingest(ks_root, make_draft("b", base_meta(title="B")))
    assert is_valid_ulid(m1["id"]) and is_valid_ulid(m2["id"])
    assert m1["id"] != m2["id"]
    assert len(list(unit.iter_unit_dirs(ks_root))) == 2
