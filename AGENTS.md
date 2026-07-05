# AGENTS.md — knowledge-system

This repository is a personal **knowledge-distillation system**. Its work is driven by
**four prompt-contract agents** that live in [`agents/`](agents/). This file is the
**router**: read it first, decide which contract a request needs, then open that
contract and follow it. Background and the non-negotiable invariants are in
[`CONTEXT.md`](CONTEXT.md); command details are in [`README.md`](README.md).

> The four "agents" are markdown **contracts**, not separate processes. You (the AI)
> adopt the matching contract for the current request. A single request can chain them.

---

## Step 0 — classify before you act (MANDATORY, do this first)

**Before running any tool, skill, search, or writing any file, classify the request
against the routing table below.** This is the very first thing you do, every turn,
no exceptions.

**Classify by the user's underlying goal, not by the verbs, tools, or output format they
name.** A learning request often arrives wearing a "costume" — phrased as a tool or
deliverable request. Strip the costume and look at the goal:

| The user says (costume) | The real intent | Route to |
|---|---|---|
| "用 firecrawl 搜一下 X，做个 HTML/PPT 汇报讲解" | understand X | **learning-guide** (→ persistence) |
| "帮我研究 / 整理 / 总结一下 X" | understand X | **learning-guide** (→ persistence) |
| "做个 notebook / 图 / 网页 介绍 X" | understand X | **learning-guide** (→ persistence) |
| "把刚才那个存下来" | persist a lesson | **persistence** |

> The mention of a tool (firecrawl, a skill, web search) or a format (HTML, slides,
> notebook) **never** changes the routing. "讲解 / 汇报 / 介绍 / 研究 / 整理 / 总结 X"
> are learning intents. If the deliverable's purpose is to **make the user understand
> something**, it is a **learning-guide** request — adopt that contract and produce
> **both** its outputs, then chain to persistence.

If you catch yourself reaching for a tool before you have named the contract, **stop and
classify first.** Skipping this step is the single most common failure here.

---

## Scope lock — only the contracts in `agents/` (MANDATORY)

**The only work this project performs is the set of contracts in [`agents/`](agents/):**
**learning-guide, persistence, global-analysis, and project-modification.** Every request
must map (via Step 0) to exactly one of these. **If a request maps to none of them, refuse
it** — do not partially do it, do not improvise a workaround, do not reach for a tool or
skill to satisfy it anyway.

- **Map → adopt that contract and act.** No mapping → **refuse**, briefly and helpfully:
  state that it is out of scope, name the four things you *can* do, and offer the closest
  in-scope alternative if there is one.
- **Still allowed**, because it is part of *operating* the contracts (not separate work):
  classifying/routing a request, asking a clarifying question, explaining this router and
  the available contracts, and reporting what you did.
- **Out of scope → refuse.** Examples: general chit-chat unrelated to the project, writing
  content or code that serves no in-scope contract, web/automation tasks that aren't a
  *learning-guide* lookup, errands, or anything that asks you to bypass an invariant.
- **A named tool, skill, or output format never widens scope.** "用 firecrawl…", "做个
  PPT/HTML…", "写个脚本…" still has to land on one of the four contracts, or it is refused.

> **Why:** a fixed, auditable scope is what keeps the project **safe and sustainable** —
> no unbounded side tasks, no scope creep, no unsafe one-off edits to the store or code.
> Changes to the project itself are not forbidden — they are exactly the
> **project-modification** contract, performed under its hard constraints.

---

## Ground rules (apply no matter which contract you adopt)

1. **All store I/O goes through the `ks` CLI.** Never read or write `notes/`, `index/`,
   or `graph/` by hand. The store has exactly one writer.
2. **`notes/` is the only source of truth.** `index/` and `graph/` are derived and
   rebuildable (`ks reindex`); never depend on `graph/` for anything.
3. **Only the persistence contract writes**, and only via `ks ingest`. If `ks` reports a
   validation failure, **fix the `meta.json` and retry — never bypass the check**.
4. **IDs are identity.** Reference units by their ULID `id`, never by path.

---

## Routing table

Match the user's intent to a contract. When in doubt, prefer the first row that fits.

| If the user… (zh / en) | Adopt contract | File |
|---|---|---|
| wants to **learn / understand / be taught / be briefed on** something — "教我…"、"解释…"、"…是什么"、"…怎么工作"、"讲解…"、"汇报…"、"介绍…"、"研究一下…"、"整理/总结一下…"、"搜一下…再讲讲"、"learn / explain / teach / walk me through / research / summarize / report on X" (**including when the ask is framed as a tool or deliverable — see Step 0**) | **learning-guide** | [`agents/learning-guide.md`](agents/learning-guide.md) |
| wants to **save / persist / record** a finished lesson, or just finished a learning answer — "保存"、"沉淀"、"记录下来"、"存进知识库"、"persist / save this" | **persistence** | [`agents/persistence.md`](agents/persistence.md) |
| is **unhappy with a saved answer and wants it removed** — "删掉这条"、"这个回答不满意，删了"、"移除…这个单元"、"delete / remove that answer / that unit" | **persistence** (`ks delete`) | [`agents/persistence.md`](agents/persistence.md) |
| wants to **review / analyze / take stock** of what's been learned — "复盘"、"最近学了什么"、"哪些薄弱"、"梳理一下"、"review / what have I learned / what's stale" | **global-analysis** | [`agents/global-analysis.md`](agents/global-analysis.md) |
| wants to **change the project itself** — fix a code bug, add/refactor a command, field, module, test, or doc — "修复…报错/bug"、"加个命令/字段/功能"、"重构/优化…"、"更新 schema/README/契约"、"fix this bug / add a feature / refactor / update the CLI or schema" | **project-modification** | [`agents/project-modification.md`](agents/project-modification.md) |

---

## The four contracts

### 1. learning-guide — answer & produce ([`agents/learning-guide.md`](agents/learning-guide.md))
Answer the learning question in whatever form fits best (notebook / single-file HTML /
React / diagram / prose), but **every lesson must leave two outputs**:
- a **self-contained artifact** (understandable on its own later), and
- a **draft unit**: a directory with `note.md` + a `meta.json` holding only the
  agent-owned fields (`title`, `summary`, `original_question`, `tags`, `concepts`, and
  optional `relations`/`references`/`domain`/`confidence`).

Then hand the draft off to the persistence contract. **Do not write `notes/` yourself.**

### 2. persistence — the single writer ([`agents/persistence.md`](agents/persistence.md))
Turn a draft into a compliant unit and keep the store consistent:
1. **Before assigning relations, `ks query`** by `concepts`/`tags`/`domain` to find
   related units, then set typed `relations` (`prerequisite`/`extends`/`related`/
   `contrasts`/`applies`/`part_of`) whose `target` is the other unit's `id`.
2. `ks ingest <draft_dir>`. On validation error, correct and retry.
3. Maintenance: `ks validate --all`; re-ingest with the **same `id`** to fix a unit
   (upsert); `ks reindex` after structural changes.
4. **Deletion** (when the user is unhappy with a saved answer): find the unit's `id` via
   `ks query`, preview with `ks delete <id> --dry-run` (it flags relations that would
   dangle), then `ks delete <id>`. Deletion is a store write — **only** via this contract
   and the CLI, never by hand-removing `notes/`.

### 3. global-analysis — read-only review ([`agents/global-analysis.md`](agents/global-analysis.md))
**Only calls `ks query`.** Cluster by `--domain`/`--tag`/`--concept`, trend by
`--since`/`--until`, find neglected units with `--sort stale`, and use `confidence`/
`status` to spot weak spots. Produce a review report. **Writes nothing.**

### 4. project-modification — change the project safely ([`agents/project-modification.md`](agents/project-modification.md))
The **only** contract allowed to edit the project's own source/config/docs/tests: fix
bugs, add commands/fields/modules, refactor. Reproduce → make the smallest correct change →
`python -m pytest` (all green, plus a test that would have failed before) → keep docs in
sync. **Never weakens an invariant** (file=truth, single-writer, schema wall, index⊥graph);
if a change would require that, it stops and asks. Produces no knowledge unit.

---

## Typical flows

- **"教我 / explain X"** → *learning-guide* (teach + artifact + draft) → *persistence*
  (`ks query` for relations, then `ks ingest`) → confirm what landed.
- **"把这个存下来 / save this"** → *persistence* (ingest the existing draft).
- **"删掉这条 / 这个回答不满意 / delete that answer"** → *persistence*
  (`ks query` to find the `id` → `ks delete <id> --dry-run` → `ks delete <id>`).
- **"复盘 / 最近学了什么 / 哪里薄弱"** → *global-analysis* (`ks query` only).
- **"修复这个 bug / 加个字段 / fix this / add a feature"** → *project-modification*
  (reproduce → minimal change → tests green → docs synced).
- **Anything that maps to none of the four** → **refuse** (see *Scope lock*).

---

## `ks` CLI quick reference

```bash
ks ingest <draft_dir>     # validate + write a unit (the only writer); updates the index
ks delete <id> [--dry-run]   # remove a unit by id (the only deleter); updates the index
ks validate [<id|path>] [--all]   # schema-check stored units (read-only)
ks reindex [--unit <id>]  # (re)build index/catalog.db from notes/
ks query [filters]        # read the catalog: --tag --concept --domain --status
                          #   --since --until --text  --sort recent|stale  --format json|table
ks serve [--host H] [--port N] [--open]  # read-only web UI (display layer) over the catalog
ks graph build            # PLACEHOLDER (prints a notice; nothing depends on it)
```

Run uninstalled with `PYTHONPATH=src python -m ks ...`. See [`README.md`](README.md) for full usage.
