"""Offline public tool/transport contracts, not live model tests."""
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from london_office.data import ROOT
from london_office.mcp_server import MCPServer
from london_office.tools import BusinessTools


class ToolTests(unittest.TestCase):
    def test_tools_execute_real_python_market_queries(self):
        tools = BusinessTools()
        result = tools.call("market_query", {"area":"city", "metric":"prime_rent", "period":"2025-YE"})
        self.assertEqual(result["observations"][0]["value"], 105.26)
        names = {tool["name"] for tool in tools.list_tools()}
        self.assertEqual(names, {"market_catalog", "market_query", "compare_periods", "market_brief", "source_details", "verify_source"})
        self.assertNotIn("shell", names)

    def test_unauthorized_tools_and_bad_arguments_are_rejected_and_traced(self):
        with tempfile.TemporaryDirectory() as tmp:
            trace = Path(tmp) / "offline-contract.jsonl"
            server = MCPServer(trace=trace)
            result = server.handle({"jsonrpc":"2.0", "id":1, "method":"tools/call", "params":{"name":"shell","arguments":{"command":"not executed"}}})
            self.assertTrue(result["result"]["isError"])
            self.assertFalse(json.loads(trace.read_text())["ok"])
            with self.assertRaises(ValueError):
                BusinessTools().call("market_query", {"area":"city","metric":"prime_rent","period":"2025-YE","url":"https://example.com"})

    def test_stdio_protocol_executes_the_actual_python_tool(self):
        messages = [
            {"jsonrpc":"2.0", "id":1, "method":"initialize", "params":{"protocolVersion":"2025-03-26"}},
            {"jsonrpc":"2.0", "method":"notifications/initialized"},
            {"jsonrpc":"2.0", "id":2, "method":"tools/call", "params":{"name":"compare_periods","arguments":{"area":"city","metric":"prime_rent","previous_period":"2024-YE","current_period":"2025-YE"}}}
        ]
        completed = subprocess.run([sys.executable,"-m","london_office.mcp_server"], cwd=ROOT,
            input="\n".join(json.dumps(m) for m in messages) + "\n", text=True, capture_output=True, check=True, timeout=10)
        results = [json.loads(line) for line in completed.stdout.splitlines()]
        self.assertEqual(len(results), 2)
        self.assertEqual(results[0]["result"]["protocolVersion"], "2025-03-26")
        self.assertEqual(results[1]["result"]["structuredContent"]["comparisons"][0]["change_value"], 6.75)
        self.assertFalse(results[1]["result"]["isError"])


if __name__ == "__main__":
    unittest.main()
