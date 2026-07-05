"""Shared pytest fixtures.

Tests run directly against the source tree (no install required): we prepend
`src/` to sys.path and build a throwaway storage root per test by copying the
real schema into a tmp directory.
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import pytest

REPO_ROOT = Path(__file__).resolve().parents[1]
SRC = REPO_ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))


@pytest.fixture
def ks_root(tmp_path: Path) -> Path:
    """A fresh storage root with the real schema copied in."""
    root = tmp_path / "store"
    (root / "schema").mkdir(parents=True)
    shutil.copyfile(
        REPO_ROOT / "schema" / "unit.schema.json",
        root / "schema" / "unit.schema.json",
    )
    tags = REPO_ROOT / "schema" / "tags.txt"
    if tags.exists():
        shutil.copyfile(tags, root / "schema" / "tags.txt")
    for sub in ("notes", "index", "graph"):
        (root / sub).mkdir()
    return root


@pytest.fixture
def make_draft(tmp_path: Path):
    """Factory: build a draft directory (meta.json + note.md) and return its path."""

    def _make(name: str, meta: dict, note: str = "# Note\n\nBody text.") -> Path:
        d = tmp_path / "drafts" / name
        d.mkdir(parents=True, exist_ok=True)
        (d / "meta.json").write_text(
            json.dumps(meta, ensure_ascii=False), encoding="utf-8"
        )
        (d / "note.md").write_text(note, encoding="utf-8")
        return d

    return _make


def base_meta(**overrides) -> dict:
    """A minimal valid *draft* meta (tool fills id/timestamps/slug/etc.)."""
    meta = {
        "title": "Test topic",
        "summary": "A one-line summary for testing.",
        "original_question": "What is the test topic?",
        "tags": ["test", "topic"],
        "concepts": ["testing"],
    }
    meta.update(overrides)
    return meta
