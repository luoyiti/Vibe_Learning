"""graph build — knowledge-graph extraction (PLACEHOLDER, not implemented).

This is a deliberate stub. The MVP collects the graph's *input data* from day one
(`meta.concepts` and `meta.relations` are validated and indexed), but does not yet
assemble a graph. Nothing else in the system depends on this module, and the index
and query layers must never read `graph/` (CONTEXT.md §6 — the decoupling red line).

Future contract (documented now so historical units already carry the data)
---------------------------------------------------------------------------
`extract_graph(units)` will perform a *deterministic assembly* — no LLM judgement,
that already happened when the persistence agent wrote `concepts`/`relations`. It
will read the validated units and emit `graph/graph.json`:

    {
      "schema_version": "1.0",
      "nodes": [
        {"kind": "unit",    "id": "<ULID>", "title": "<title>"},
        {"kind": "concept", "name": "<concept>"}
      ],
      "edges": [
        {"kind": "covers",    "src": "<unit ULID>", "dst": "<concept name>"},
        {"kind": "relations", "type": "<relation type>",
                              "src": "<unit ULID>", "dst": "<unit ULID>", "note": "..."}
      ]
    }

  * nodes  = units `(id, title)` and concepts `(name)`
  * edges  = `covers` (unit → concept, from `meta.concepts`) and
             `relations` (typed unit → unit, from `meta.relations`)

The display layer (see display/README.md) will render this file plus index queries.
"""

from __future__ import annotations

from pathlib import Path

from .config import graph_dir, graph_json

PLACEHOLDER_MESSAGE = "graph extraction: placeholder, not implemented"


class Graph:
    """Placeholder graph type. The real implementation will hold nodes/edges."""


def extract_graph(units) -> "Graph":  # noqa: ANN001 - signature is the contract
    """Deterministically assemble a Graph from validated units. NOT IMPLEMENTED.

    See the module docstring for the intended `graph/graph.json` output schema.
    """
    raise NotImplementedError(PLACEHOLDER_MESSAGE)


def build(root: Path, write_placeholder: bool = True) -> int:
    """`ks graph build` entry point — a harmless no-op stub.

    Prints the placeholder message and (optionally) drops an empty, clearly
    marked `graph/graph.json` so downstream tooling has a stable path to find.
    Always returns 0; never raises; never read by other commands.
    """
    print(PLACEHOLDER_MESSAGE)
    if write_placeholder:
        graph_dir(root).mkdir(parents=True, exist_ok=True)
        import json

        graph_json(root).write_text(
            json.dumps(
                {
                    "schema_version": "1.0",
                    "placeholder": True,
                    "nodes": [],
                    "edges": [],
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
    return 0
