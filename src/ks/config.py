"""Path constants and schema loading.

The "root" is the directory that holds the storage layout:

    <root>/
      schema/unit.schema.json   load-bearing wall
      schema/tags.txt           soft vocabulary
      notes/                    source of truth (units)
      index/                    derived (SQLite) — rebuildable
      graph/                    derived (placeholder output)

Root resolution order:
  1. an explicit path passed on the command line (`ks --root <path>`)
  2. the `KS_ROOT` environment variable
  3. the nearest ancestor of the current working directory that contains
     `schema/unit.schema.json`
  4. the current working directory (last-resort fallback)

Resolving by a `schema/unit.schema.json` marker lets the CLI be run from any
subdirectory of the repo, and lets tests point at a throwaway root.
"""

from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path

SCHEMA_DIRNAME = "schema"
SCHEMA_FILENAME = "unit.schema.json"
TAGS_FILENAME = "tags.txt"
NOTES_DIRNAME = "notes"
INDEX_DIRNAME = "index"
GRAPH_DIRNAME = "graph"
CATALOG_DB_NAME = "catalog.db"
GRAPH_JSON_NAME = "graph.json"


def resolve_root(explicit: str | os.PathLike | None = None) -> Path:
    """Return the storage root as an absolute Path (see module docstring)."""
    if explicit:
        return Path(explicit).expanduser().resolve()

    env = os.environ.get("KS_ROOT")
    if env:
        return Path(env).expanduser().resolve()

    cwd = Path.cwd().resolve()
    for candidate in (cwd, *cwd.parents):
        if (candidate / SCHEMA_DIRNAME / SCHEMA_FILENAME).is_file():
            return candidate
    return cwd


def schema_file(root: Path) -> Path:
    return root / SCHEMA_DIRNAME / SCHEMA_FILENAME


def tags_file(root: Path) -> Path:
    return root / SCHEMA_DIRNAME / TAGS_FILENAME


def notes_dir(root: Path) -> Path:
    return root / NOTES_DIRNAME


def index_dir(root: Path) -> Path:
    return root / INDEX_DIRNAME


def graph_dir(root: Path) -> Path:
    return root / GRAPH_DIRNAME


def catalog_db(root: Path) -> Path:
    return index_dir(root) / CATALOG_DB_NAME


def graph_json(root: Path) -> Path:
    return graph_dir(root) / GRAPH_JSON_NAME


@lru_cache(maxsize=8)
def _load_schema_cached(path_str: str, mtime_ns: int) -> dict:
    return json.loads(Path(path_str).read_text(encoding="utf-8"))


def load_schema(root: Path) -> dict:
    """Load and parse the unit meta JSON Schema for the given root.

    Cached on (path, mtime) so repeated validations within a process do not
    re-read the file, while still picking up edits between runs.
    """
    path = schema_file(root)
    if not path.is_file():
        raise FileNotFoundError(
            f"schema not found at {path}. Is --root / KS_ROOT pointing at the "
            f"storage root (the directory containing schema/{SCHEMA_FILENAME})?"
        )
    return _load_schema_cached(str(path), path.stat().st_mtime_ns)


def load_tag_vocabulary(root: Path) -> set[str]:
    """Return the soft controlled-tag vocabulary (may be empty)."""
    path = tags_file(root)
    if not path.is_file():
        return set()
    vocab: set[str] = set()
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            vocab.add(line)
    return vocab
