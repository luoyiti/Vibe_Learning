"""knowledge-system (ks) — tool layer.

Deterministic, side-effect-controlled scripts that own ALL reads and writes to
the storage layer. Agents never touch the filesystem directly; they go through
this package's CLI (`ks`).

Design invariants this package enforces (see CONTEXT.md §2):
  1. Files are the source of truth. `index/` and `graph/` are derived and
     rebuildable from `notes/` alone.
  2. Judgement vs. execution are separate. These scripts execute; agents judge.
  3. Machine-strict / human-free. The only load-bearing wall is `meta.json`
     (validated against schema/unit.schema.json). Prose and artifacts are free.
  4. ID is identity. Units are addressed by ULID; references use IDs, never paths.
"""

__version__ = "0.1.0"

SCHEMA_VERSION = "1.0"
