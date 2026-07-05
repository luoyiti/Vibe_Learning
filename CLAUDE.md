# CLAUDE.md — knowledge-system

The agent routing and ground rules for this repository live in **AGENTS.md** (single
source of truth, shared across AI tools). It is imported below — read it first and route
every request to the matching contract in [`agents/`](agents/).

@AGENTS.md

---

## Claude-specific notes

- **Scope lock (AGENTS.md "Scope lock") — refuse out-of-scope work.** This project only
  performs the four contracts in [`agents/`](agents/): **learning-guide, persistence,
  global-analysis, project-modification.** Every request must map to one of them. If it
  maps to none, **refuse** — briefly say it's out of scope, name the four things you can
  do, and offer the closest in-scope alternative. Do not improvise a workaround or reach
  for a tool/skill to satisfy an out-of-scope ask; a named tool or output format never
  widens scope. Routing, clarifying questions, explaining the system, and reporting what
  you did are allowed (they are part of operating the contracts, not separate work).
- **Modifying the project is in scope — via project-modification.** Fixing a code bug or
  adding a command/field/module/test/doc is the **project-modification** contract: open
  [`agents/project-modification.md`](agents/project-modification.md), make the smallest
  correct change, run `python -m pytest` (all green + a test that would have failed
  before), keep docs in sync, and **never weaken an invariant** — if a change would
  require that, stop and ask.
- **Classify first, always (AGENTS.md "Step 0").** On every turn, before invoking any
  tool, skill, web search, or writing any file, match the request to the routing table
  and name the contract you are adopting. **A named tool, skill (e.g. firecrawl), or
  output format (HTML, slides, notebook) does NOT exempt you from routing** — classify by
  the user's underlying goal. "搜一下 X 并做个 HTML 讲解 / 汇报 / 研究 X" is a
  **learning-guide** request, not a one-off tooling task. Forgetting to classify, and so
  failing to recognize a learning request, is the mistake this repo most wants to prevent.
- When a request matches a row in the routing table, **open the linked `agents/*.md`
  contract and follow it** before doing anything else. A learning request **chains
  *learning-guide → persistence* automatically — do both without asking for permission.**
  Only skip persistence if the user explicitly says not to save. Do not stop after the
  artifact to ask "want me to persist?"; the answer is already yes.
- Treat the `ks` CLI as the only door to the store. Use the Bash tool to run it
  (`ks ...`, or `PYTHONPATH=src python -m ks ...` when not installed). Never edit files
  under `notes/`, `index/`, or `graph/` with Read/Edit/Write — that breaks the
  single-writer invariant.
- A draft directory is scratch (e.g. under `.drafts/`); only `ks ingest` promotes it into
  `notes/`. If `ks ingest` fails validation, fix the draft `meta.json` and retry — do not
  hand-write the unit to work around it.
- After persisting, you can confirm with `ks validate --all` and surface the new unit via
  `ks query`.
