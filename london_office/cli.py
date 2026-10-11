"""Interactive entry point; authentication remains in the Codex Adapter."""
from __future__ import annotations

import argparse
import json
from dataclasses import replace
from pathlib import Path
from .data import read_document
from .market import Market
from .runtime import AgentError, CodexAdapter
from .settings import Settings
from .source_pool import SourcePool, TOPICS
from .discovery import GoogleDiscovery, DiscoveryError


def _print(value):
    print(json.dumps(value, ensure_ascii=False, indent=2), flush=True)


def main():
    parser = argparse.ArgumentParser(prog="london-office", description="Evidence-led London office monitoring. Historical snapshots, not live prices.")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("catalog")
    for name in ["query", "brief"]:
        query = sub.add_parser(name)
        query.add_argument("--area")
        query.add_argument("--period", default="2025-YE")
        if name == "query":
            query.add_argument("--metric", default="prime_rent")
    compare = sub.add_parser("compare")
    compare.add_argument("--area", required=True)
    compare.add_argument("--metric", default="prime_rent")
    compare.add_argument("--previous", default="2024-YE")
    compare.add_argument("--current", default="2025-YE")
    verify = sub.add_parser("verify")
    verify.add_argument("source_id")
    inspect = sub.add_parser("inspect")
    inspect.add_argument("report", type=Path)
    login = sub.add_parser("login")
    login.add_argument("--device", action="store_true")
    sub.add_parser("status")
    sub.add_parser("models")
    sub.add_parser("sources", help="Read archived source candidates without searching or calling a model")
    collect = sub.add_parser("collect-sources", help="Explicit bounded Google metadata collection; not verified market data")
    collect.add_argument("--query", required=True)
    collect.add_argument("--topic", action="append", choices=list(TOPICS), required=True)
    collect.add_argument("--area-context", choices=["city", "west_end", "canary_wharf", "midtown_fringe"])
    collect.add_argument("--budget-file", type=Path, required=True, help="Existing operator-authorized receipt; never automatically created or reset")
    chat = sub.add_parser("chat")
    chat.add_argument("question", nargs="?")
    serve = sub.add_parser("serve")
    serve.add_argument("--port", type=int, default=8017)
    serve.add_argument("--no-agent", action="store_true", help="Offline API/UI; no simulated model response")
    args = parser.parse_args()
    adapter = None
    try:
        if args.command == "catalog":
            _print(Market().catalog())
        elif args.command == "query":
            _print(Market().query(area=args.area, metric=args.metric, period=args.period))
        elif args.command == "brief":
            _print(Market().brief(area=args.area, period=args.period))
        elif args.command == "compare":
            _print(Market().compare(area=args.area, metric=args.metric, previous_period=args.previous, current_period=args.current))
        elif args.command == "verify":
            result = Market().verify_source(args.source_id)
            _print(result)
            if result["status"] != "verified":
                return 1
        elif args.command == "inspect":
            if args.report.suffix.lower() not in {".pdf", ".html", ".htm", ".txt", ".md"}:
                raise ValueError("inspect accepts a user-supplied report PDF/HTML/text, not credential or configuration files")
            text = read_document(args.report)
            _print({"characters":len(text), "preview":text[:400], "validated_as_market_data":False})
        elif args.command == "sources":
            _print(SourcePool(Settings.from_env().discovery_dir).view())
        elif args.command == "collect-sources":
            settings = Settings.from_env()
            discovery = GoogleDiscovery(SourcePool(settings.discovery_dir), args.budget_file)
            context = {"area_id": args.area_context} if args.area_context else None
            _print(discovery.search(args.query, topic_ids=args.topic, context=context))
        elif args.command == "serve":
            import uvicorn
            from .app import create_app
            settings = replace(Settings.from_env(), agent_enabled=not args.no_agent)
            uvicorn.run(create_app(settings), host="127.0.0.1", port=args.port, log_level="info")
        else:
            adapter = CodexAdapter()
            if args.command == "login":
                _print(adapter.login(device=args.device))
            elif args.command == "status":
                _print(adapter.status())
            elif args.command == "models":
                _print({"models":adapter.models()})
            elif args.command == "chat":
                if args.question:
                    _print(adapter.ask(args.question))
                else:
                    print("London Office Monitor — historical data. Type exit to finish. Every accepted answer requires Python tools.")
                    session_id = None
                    while True:
                        try:
                            question = input("You> ").strip()
                        except (EOFError, KeyboardInterrupt):
                            break
                        if question.lower() in {"exit", "quit"}:
                            break
                        if not question:
                            continue
                        try:
                            result = adapter.ask(question, session_id=session_id)
                            session_id = result["session_id"]
                            _print(result)
                        except AgentError as error:
                            _print({"status":"error","error":{"code":error.code,"message":error.message}})
    except AgentError as error:
        _print({"status":"error","error":{"code":error.code,"message":error.message}})
        return 1
    except DiscoveryError as error:
        _print({"status":"error", "error":{"code":error.code,"message":error.message}})
        return 1
    except (ValueError, OSError) as error:
        _print({"status":"error","error":{"code":"operation_failed","message":str(error)}})
        return 1
    finally:
        if adapter:
            adapter.close()
    return 0
