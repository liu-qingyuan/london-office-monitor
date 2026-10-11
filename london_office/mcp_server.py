"""Local MCP stdio Adapter: six market tools OR explicit Google discovery.

Default profile unchanged. No SDK imports, model shell or arbitrary URL fetching.
stdout is JSON-RPC only. Each attempted tool call records a local evidence event.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from .tools import BusinessTools


class MCPServer:
    def __init__(self, tools: BusinessTools | None = None, trace: Path | None = None):
        self.tools = tools or BusinessTools()
        self.trace = trace
        if trace:
            trace.parent.mkdir(parents=True, exist_ok=True)

    def handle(self, request: dict) -> dict | None:
        if not isinstance(request, dict) or request.get("jsonrpc") != "2.0":
            return {"jsonrpc": "2.0", "id": None, "error": {"code": -32600, "message": "Invalid request"}}
        if "id" not in request:
            return None
        identifier = request["id"]
        method = request.get("method")
        params = request.get("params", {})
        if not isinstance(params, dict):
            return {"jsonrpc": "2.0", "id": identifier, "error": {"code": -32602, "message": "Invalid params"}}
        if method == "initialize":
            result = {"protocolVersion": params.get("protocolVersion", "2024-11-05"),
                "capabilities": {"tools": {}}, "serverInfo": {"name": "london-office-business-tools", "version": "0.1.0"}}
        elif method == "ping":
            result = {}
        elif method == "tools/list":
            result = {"tools": self.tools.list_tools()}
        elif method == "tools/call":
            name, arguments = params.get("name"), params.get("arguments", {})
            try:
                output = self.tools.call(name, arguments)
                ok = True
            except Exception as error:
                output = {"error": {"code": "tool_error", "message": str(error)}}
                ok = False
            event = {"call_id": str(uuid4()), "at": datetime.now(timezone.utc).isoformat(),
                "name": name, "arguments": arguments, "ok": ok, "output": output}
            if self.trace:
                with self.trace.open("a", encoding="utf-8") as file:
                    file.write(json.dumps(event, ensure_ascii=False) + "\n")
            result = {"content": [{"type": "text", "text": json.dumps(output, ensure_ascii=False)}], "structuredContent": output, "isError": not ok}
        else:
            return {"jsonrpc": "2.0", "id": identifier, "error": {"code": -32601, "message": "Unsupported method"}}
        return {"jsonrpc": "2.0", "id": identifier, "result": result}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", type=Path)
    parser.add_argument("--discovery-bridge", action="store_true", help="Application discovery; parent-owned bounded loopback search")
    parser.add_argument("--discovery-budget", type=Path, help="Explicit standalone discovery profile; existing consent receipt only")
    parser.add_argument("--discovery-request", help="Host-owned request ID, not a model tool parameter")
    parser.add_argument("--topic", action="append")
    parser.add_argument("--area-context", choices=["city", "west_end", "canary_wharf", "midtown_fringe"])
    args = parser.parse_args()
    tools = None
    if args.discovery_bridge:
        if args.discovery_budget or args.topic or args.area_context or args.discovery_request:
            parser.error("Parent-owned discovery scope cannot be overridden by the MCP client")
        from .discovery_bridge import GoogleBridgeClient
        tools = GoogleBridgeClient(os.environ.get("LONDON_GOOGLE_BRIDGE_URL", ""),
            os.environ.get("LONDON_GOOGLE_BRIDGE_TOKEN", ""))
    elif args.discovery_budget:
        from .discovery import GoogleDiscovery, DiscoveryTools
        from .source_pool import SourcePool, TOPICS
        from .settings import Settings
        topics = args.topic or list(TOPICS)
        if any(topic not in TOPICS for topic in topics): parser.error("Unknown discovery topic")
        context = {"area_id": args.area_context} if args.area_context else None
        tools = DiscoveryTools(GoogleDiscovery(SourcePool(Settings.from_env().discovery_dir), args.discovery_budget, request_id=args.discovery_request), topic_ids=topics, context=context)
    elif args.topic or args.area_context or args.discovery_request:
        parser.error("Discovery topic/context requires the explicit discovery profile and budget")
    server = MCPServer(tools=tools, trace=args.trace)
    for line in sys.stdin:
        try:
            if len(line) > 100_000:
                raise ValueError("Request exceeds input processing limit")
            request = json.loads(line)
            response = server.handle(request)
        except (ValueError, TypeError):
            response = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "Invalid JSON-RPC input"}}
        if response is not None:
            print(json.dumps(response, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
