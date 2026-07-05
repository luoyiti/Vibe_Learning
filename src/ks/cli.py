"""`ks` command-line entry point.

Subcommands:
  ks ingest <draft_dir>                 validate + write a unit, update the index
  ks delete <id> [--dry-run]            remove a unit by id, update the index
  ks validate [<id|path>] [--all]       schema-check stored units (read-only)
  ks reindex [--unit <id>]              (re)build the SQLite catalog from notes/
  ks query [filters] [--sort] [--format]  read the catalog for review/retrieval
  ks serve [--host] [--port] [--open]   local read-only web UI over the catalog
  ks graph build                        placeholder (prints, never depended on)

All filesystem access flows through here and the modules it calls — agents never
touch the store directly.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from . import __version__, index, query as query_mod, unit
from .config import catalog_db, resolve_root
from .graph import build as graph_build
from .unit import KSError, ValidationError


def _add_root_arg(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--root",
        default=None,
        help="storage root (default: $KS_ROOT or nearest ancestor with schema/unit.schema.json)",
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="ks", description="knowledge-system tool layer (deterministic store I/O)"
    )
    parser.add_argument("--version", action="version", version=f"ks {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    # ingest -----------------------------------------------------------------
    p_ingest = sub.add_parser("ingest", help="validate + write a draft into notes/")
    _add_root_arg(p_ingest)
    p_ingest.add_argument("draft_dir", help="path to the draft directory")
    p_ingest.set_defaults(func=_cmd_ingest)

    # delete -----------------------------------------------------------------
    p_delete = sub.add_parser("delete", help="remove a stored unit by id (single writer)")
    _add_root_arg(p_delete)
    p_delete.add_argument("unit_id", help="ULID of the unit to delete")
    p_delete.add_argument("--dry-run", action="store_true",
                          help="show what would be deleted, without deleting")
    p_delete.set_defaults(func=_cmd_delete)

    # validate ---------------------------------------------------------------
    p_validate = sub.add_parser("validate", help="schema-check stored units (read-only)")
    _add_root_arg(p_validate)
    p_validate.add_argument("target", nargs="?", help="unit id, unit dir, or meta.json path")
    p_validate.add_argument("--all", action="store_true", help="validate every unit under notes/")
    p_validate.set_defaults(func=_cmd_validate)

    # reindex ----------------------------------------------------------------
    p_reindex = sub.add_parser("reindex", help="(re)build the catalog from notes/")
    _add_root_arg(p_reindex)
    p_reindex.add_argument("--unit", help="incrementally reindex a single unit by id")
    p_reindex.set_defaults(func=_cmd_reindex)

    # query ------------------------------------------------------------------
    p_query = sub.add_parser("query", help="read the catalog (default JSON output)")
    _add_root_arg(p_query)
    p_query.add_argument("--tag", action="append", dest="tags", metavar="TAG",
                         help="require this tag (repeatable; AND)")
    p_query.add_argument("--concept", action="append", dest="concepts", metavar="CONCEPT",
                         help="require this concept (repeatable; AND)")
    p_query.add_argument("--domain", help="exact domain match")
    p_query.add_argument("--status", choices=["draft", "stable", "needs_review"],
                         help="exact status match")
    p_query.add_argument("--since", help="created_at >= this ISO 8601 timestamp")
    p_query.add_argument("--until", help="created_at <= this ISO 8601 timestamp")
    p_query.add_argument("--text", help="full-text search over note.md bodies")
    p_query.add_argument("--sort", choices=["recent", "stale"], default="recent",
                         help="recent = newest updated first; stale = oldest updated first")
    p_query.add_argument("--limit", type=int, help="cap the number of results")
    p_query.add_argument("--format", choices=["json", "table"], default="json")
    p_query.set_defaults(func=_cmd_query)

    # serve ------------------------------------------------------------------
    p_serve = sub.add_parser("serve", help="local read-only web UI for browsing units")
    _add_root_arg(p_serve)
    p_serve.add_argument("--host", default="127.0.0.1",
                         help="bind address (default 127.0.0.1)")
    p_serve.add_argument("--port", type=int, default=8765,
                         help="port to listen on (default 8765)")
    p_serve.add_argument("--open", action="store_true", dest="open_browser",
                         help="open the browser once the server starts")
    p_serve.set_defaults(func=_cmd_serve)

    # graph (placeholder) ----------------------------------------------------
    p_graph = sub.add_parser("graph", help="knowledge graph (placeholder)")
    graph_sub = p_graph.add_subparsers(dest="graph_command", required=True)
    p_graph_build = graph_sub.add_parser("build", help="placeholder — prints, builds nothing")
    _add_root_arg(p_graph_build)
    p_graph_build.set_defaults(func=_cmd_graph_build)

    return parser


# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------


def _cmd_ingest(args) -> int:
    root = resolve_root(args.root)
    meta = unit.ingest(root, Path(args.draft_dir))
    unit_dir = unit.find_unit_dir(root, meta["id"])
    rel = unit_dir.relative_to(root).as_posix() if unit_dir else "?"
    print(f"ingested {meta['id']}  ({meta['title']})")
    print(f"  path: {rel}")
    print(f"  status={meta['status']} tags={meta.get('tags', [])}")
    return 0


def _cmd_delete(args) -> int:
    root = resolve_root(args.root)
    summary = unit.delete(root, args.unit_id, dry_run=args.dry_run)
    verb = "would delete" if args.dry_run else "deleted"
    print(f"{verb} {summary['id']}  ({summary['title']})")
    print(f"  path: {summary['path']}")
    referrers = summary["referrers"]
    if referrers:
        print(f"  warning: {len(referrers)} unit(s) still reference this id "
              f"(relations would dangle):")
        for r in referrers:
            print(f"    - {r['id']} ({r.get('title')})  via {r.get('type')}")
        print("  -> re-ingest those units (same id) with the stale relation removed.")
    return 0


def _cmd_validate(args) -> int:
    root = resolve_root(args.root)
    all_ok, report = unit.validate_units(root, args.target, args.all or not args.target)
    if not report:
        print("no units to validate.")
        return 0
    for label, errors in report:
        if errors:
            print(f"FAIL  {label}")
            for err in errors:
                print(f"        - {err}")
        else:
            print(f"OK    {label}")
    print(f"\n{sum(1 for _, e in report if not e)}/{len(report)} valid.")
    return 0 if all_ok else 1


def _cmd_reindex(args) -> int:
    root = resolve_root(args.root)
    if args.unit:
        present = index.reindex_unit(root, args.unit)
        print(f"reindexed {args.unit}" if present else f"removed from index: {args.unit}")
    else:
        count = index.reindex(root)
        print(f"reindexed {count} unit(s).")
    return 0


def _cmd_query(args) -> int:
    root = resolve_root(args.root)
    records = query_mod.query(
        root,
        tags=args.tags,
        concepts=args.concepts,
        domain=args.domain,
        status=args.status,
        since=args.since,
        until=args.until,
        text=args.text,
        sort=args.sort,
        limit=args.limit,
    )
    if args.format == "table":
        print(query_mod.format_table(records))
    else:
        print(json.dumps(records, ensure_ascii=False, indent=2))
    return 0


def _cmd_serve(args) -> int:
    root = resolve_root(args.root)
    if not catalog_db(root).exists():
        raise KSError(
            f"no catalog at {catalog_db(root)}. Build it first with `ks reindex`."
        )
    from . import serve as serve_mod  # lazy: keep other commands' startup lean

    return serve_mod.serve(
        root, host=args.host, port=args.port, open_browser=args.open_browser
    )


def _cmd_graph_build(args) -> int:
    root = resolve_root(args.root)
    return graph_build(root)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        return args.func(args)
    except ValidationError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2
    except KSError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except BrokenPipeError:
        return 0


if __name__ == "__main__":  # pragma: no cover
    sys.exit(main())
