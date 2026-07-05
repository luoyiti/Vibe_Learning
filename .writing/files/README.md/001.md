# knowledge-system

A personal system for distilling **knowledge learned from AI conversations** into
reusable assets. You ask any AI agent a learning question; it teaches you however
suits the material (notebook / single-file HTML / React / diagram / plain prose),
but every lesson must leave **two durable outputs**: a self-contained artifact and
a structured metadata envelope. Those land in a file-based store; indexes and a
(future) knowledge graph are derived from the files and can be rebuilt at any time.

Design background and the non-negotiable invariants live in [`CONTEXT.md`](CONTEXT.md).
**The files in `notes/` are the only source of truth.** Read it before changing anything.

---

## Architecture (four layers, four agent contracts)

| Layer | What it does |
|---|---|
| ① Agents | Prompt-driven LLM contracts that *judge / generate / analyse*. Never write the store directly — all store I/O goes through the tools. |
| ② Tools (`ks`) | Deterministic scripts — the **only** path that reads or writes the store. This package. |
| ③ Store | Knowledge units (files) are the source of truth. `index/` + `graph/` are derived. |
| ④ Display | Read-only local web UI (`ks serve`) over the index/query layer — see [`display/README.md`](display/README.md). |

The agent contracts are in [`agents/`](agents/): the learning-guide produces drafts,
the **single-writer** persistence agent ingests them, the read-only global-analysis
agent reviews via `ks query`, and the project-modification agent is the only one allowed
to change the project's own code. Per the **scope lock** in [`AGENTS.md`](AGENTS.md), a
request that matches none of the four contracts is refused.

---

## Install

Requires Python 3.11+.

```bash
cd knowledge-system
python -m pip install -e .
```

The only runtime dependency is `jsonschema`. This registers the `ks` command.
(Without installing you can also run `PYTHONPATH=src python -m ks ...`.)

Run the tests with:

```bash
python -m pip install -e ".[test]"
python -m pytest
```

---

## Commands

`ks` resolves its storage **root** from `--root`, then `$KS_ROOT`, then the nearest
ancestor directory containing `schema/unit.schema.json` (so you can run it from
anywhere in the repo).

### `ks ingest <draft_dir>` — write + validate (the single writer)

Reads a *draft directory* (`meta.json` with only the human/agent-owned fields +
`note.md`, optional `artifact/`), assembles the full meta (generating `id`,
`created_at`, `updated_at`, `schema_version`, and deriving `slug`), validates it
against the schema, and **only then** writes the unit to
`notes/<YYYY-MM>/<timestamp>--<slug>--<id>/` and updates the index incrementally.

- If `meta.json` carries an existing `id`, this is an **upsert** (in-place update,
  `created_at` preserved, `updated_at` bumped).
- **If validation fails, `ks` exits non-zero and writes nothing.** This is the
  load-bearing wall.

```bash
ks ingest examples/sample-draft
```

### `ks delete <id> [--dry-run]` — remove a unit (the single deleter)

Removes the unit directory from `notes/` and drops its rows from the index — the only
sanctioned way to delete a unit (deletion is a store write, so it goes through the tool,
never a hand-removal of files). `--dry-run` previews the target and warns about any other
units whose `relations` point at it (which would dangle). Exits non-zero if no unit has
that `id`.

```bash
ks delete 01HXY8ZQ3F... --dry-run   # preview
ks delete 01HXY8ZQ3F...             # delete + reindex
```

### `ks validate [<id|path>] [--all]` — schema-check only (read-only)

Validate a stored unit by `id`, by directory/`meta.json` path, or every unit with
`--all` (the default when no target is given). Never writes.

### `ks reindex [--unit <id>]` — (re)build the catalog

Rebuilds `index/catalog.db` from `notes/`. `--unit <id>` reindexes one unit.
**Rebuild invariant:** deleting `index/` and running `ks reindex` reproduces a
catalog that answers every query identically (covered by tests).

### `ks query [filters]` — read for review / retrieval

Reads the catalog and prints results (default JSON, for the global-analysis agent).

```bash
ks query --domain databases --format json
ks query --tag databases --tag concurrency        # repeated = AND
ks query --concept "isolation levels"
ks query --status needs_review
ks query --text "snapshot isolation"              # full-text over note.md
ks query --since 2026-06-01T00:00:00+00:00 --sort stale --limit 10
```

Filters: `--tag` `--concept` (repeatable, AND), `--domain`, `--status`, `--since`/`--until`
(bound `created_at`), `--text` (full-text). Sort: `--sort recent|stale`
(`stale` = longest since `updated_at`). Format: `--format json|table`.

Each JSON record also carries `original_question`, `confidence`, `references`
(author order preserved) and `source` (`{channel, model, transcript}`, or `null`
when the unit has none) — projected into the catalog so the display layer never
has to read `meta.json`. After upgrading `ks`, run `ks reindex` once: an older
`catalog.db` lacks these columns and is rejected with a clear error.

### `ks serve [--host H] [--port N] [--open]` — browse the store (read-only web UI)

Serves the display layer (「知识手账」) on `127.0.0.1:8765` by default — a local,
self-contained page for flipping through everything you've learned: filter by
tag / domain / concept / status / time range, full-text search, cards with
summary + tags + dates, and a detail view that links each unit's self-contained
artifact and (when recorded) its original conversation transcript. `--open`
launches the browser.

```bash
ks reindex && ks serve --open
```

- Data comes **only** from the index/query layer (`/api/units` is a passthrough
  that emits exactly what `ks query` prints; `/api/facets` aggregates counts).
- Files (artifacts / transcripts / assets) are served GET-only from paths
  strictly under `notes/`; everything else is rejected.
- The server is **read-only** — all writes still go through `ks ingest`.

### `ks graph build` — knowledge graph (PLACEHOLDER)

Prints `graph extraction: placeholder, not implemented` and (optionally) writes an
empty `graph/graph.json`. The function signature `extract_graph(units) -> Graph` and
the future output schema are documented in [`src/ks/graph.py`](src/ks/graph.py).
**Nothing else depends on this command** — the index and query layers never read
`graph/`.

---

## Repository layout

```
knowledge-system/
├── CONTEXT.md              design background + invariants (read first)
├── README.md               this file
├── AGENTS.md               agent router: maps a request to the right agent contract
├── CLAUDE.md               imports AGENTS.md (+ Claude-specific notes)
├── pyproject.toml          deps + the `ks` entry point
├── schema/
│   ├── unit.schema.json    ★ the load-bearing wall (meta.json schema)
│   └── tags.txt            soft controlled-tag vocabulary (seed)
├── notes/                  ★ units — the source of truth (runtime-populated)
├── index/                  ☆ derived SQLite (gitignored; rebuildable)
├── graph/                  ☆ derived placeholder output (gitignored)
├── src/ks/                 the tool layer (ingest/validate/reindex/query/serve + graph stub)
│   └── webui/index.html    the display layer's single-file SPA (served by `ks serve`)
├── agents/                 four agent contracts (learning-guide / persistence / global-analysis / project-modification)
├── display/                展示层 contract & endpoint docs (code lives in src/ks/)
├── examples/sample-draft/  a draft you can ingest end-to-end
└── tests/                  validation / rebuild / query tests
```

## Current scope (MVP)

**Implemented:** storage layout + schema, the `ingest` / `validate` / `reindex` /
`query` tools, the read-only display layer (`ks serve`), four agent contracts,
scaffolding, and tests.

**Placeholders (interface only):** `ks graph build` (graph extraction). The
`meta.concepts` / `meta.relations` fields are **collected and validated from day
one** so that when the graph tool is built, every historical unit already carries
the data. The index, query, and display layers **never depend on the graph** —
the system runs fully without it.
