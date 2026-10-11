"""Offline public Adapter contract: real candidate/Data/MCP path, fake SDK/network.

None of these fixtures constitute a live model, native engine or browser result.
"""
import io
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch
import unittest
from london_office.runtime import CodexAdapter, AgentError, _Session
from london_office.settings import Settings
from london_office.source_pool import SourcePool
from london_office.discovery import DiscoveryError
from london_office.discovery_bridge import GoogleBridgeClient


class DiscoveryRuntimeTests(unittest.TestCase):
    def test_explicit_profile_captures_both_paths_and_keeps_native_ref_scope(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0, "codex_turn_start_cap": 3, "codex_turn_starts": 0, "jobs": {}}))
            settings = Settings(run_dir=root / "runs", discovery_dir=root / "pool", discovery_budget_file=budget)
            configs = []
            closed = []
            def notification(method, payload):
                return SimpleNamespace(method=method, payload=SimpleNamespace(model_dump=lambda **kwargs: payload))
            class Handle:
                id = "fixture-turn"
                thread_id = "fixture-thread"
                def interrupt(self): raise AssertionError("This fixture stays within allowed tools")
                def stream(self):
                    native = {"type": "webSearch", "id": "fixture-native-item", "query": "Savills Central London office report",
                        "action": {"type": "search", "query": "Savills Central London office report"},
                        "results": [{"text_result": {"url": f"https://native.test/report/{index}", "title": f"Native fixture {index}",
                            "snippet": "Unverified native index metadata", "ref_id": f"view0search{index}"}} for index in range(16)]}
                    scope = {"threadId": self.thread_id, "turnId": self.id}
                    yield notification("item/started", {**scope, "item": {**native, "results": None, "action": None}})
                    yield notification("item/completed", {**scope, "item": native})
                    args = configs[-1]["config"]["mcp_servers"]["london_office"]["args"]
                    trace = Path(args[args.index("--trace") + 1])
                    mcp_env = configs[-1]["config"]["mcp_servers"]["london_office"]["env"]
                    assert mcp_env.get("LONDON_GOOGLE_BRIDGE_URL"), "Application Google search needs the backend bridge"
                    request = {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
                        "name": "google_search_sources", "arguments": {"query": "Savills Central London rents vacancy"}}}
                    child = subprocess.run([sys.executable, *args], cwd=Path(__file__).resolve().parents[1],
                        env={**os.environ, **mcp_env}, input=json.dumps(request) + "\n",
                        capture_output=True, text=True, encoding="utf-8", timeout=10)
                    assert child.returncode == 0, child.stderr
                    response = json.loads(child.stdout)
                    assert not response["result"]["isError"], response
                    yield notification("item/completed", {**scope, "item": {"type": "mcpToolCall", "id": "fixture-google-item",
                        "server": "london_office", "tool": "google_search_sources", "status": "completed", "result": response["result"], "error": None}})
                    yield notification("item/completed", {**scope, "item": {"type": "agentMessage", "id": "fixture-answer", "text": json.dumps({
                        "assessment": "Collected report leads remain unverified and need source review.",
                        "selected_urls": ["https://native.test/report/15", "https://google.test/report/15"], "warnings": []})}})
                    yield notification("turn/completed", {**scope, "turn": {"id": self.id, "status": "completed", "error": None}})
            class Codex:
                def account(self): return SimpleNamespace(account=SimpleNamespace(type="chatgpt"))
                def models(self): return SimpleNamespace(data=[SimpleNamespace(model=settings.model)])
                def thread_start(self, **kwargs):
                    configs.append(kwargs)
                    return SimpleNamespace(id="fixture-thread", turn=lambda *args, **kwargs: Handle())
                def close(self): closed.append(True)
            class Response(io.BytesIO): status = 200
            responses = [Response(json.dumps({"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
                "total_searches_left": 10, "this_hour_searches": 0, "account_rate_limit_per_hour": 100}).encode()),
                Response(json.dumps({"search_metadata": {"status": "Success"}, "organic_results": [
                    {"link": f"https://google.test/report/{index}", "title": f"Google fixture {index}", "position": index + 1} for index in range(16)]}).encode())]
            with patch.object(CodexAdapter, "_open", return_value=Codex()), \
                patch.dict(os.environ, {"SERPAPI_API_KEY": "fixture-key"}), \
                patch("london_office.discovery._open", side_effect=responses):
                adapter = CodexAdapter(settings)
                result = adapter.discover("Find official London office source reports", topic_ids=["rents", "vacancy"], context={"area_id": "canary_wharf"})
            config = configs[0]["config"]
            self.assertEqual(config["web_search"], "live")
            self.assertEqual(config["mcp_servers"]["london_office"]["enabled_tools"], ["google_search_sources"])
            self.assertEqual(config["mcp_servers"]["london_office"]["env"]["SERPAPI_API_KEY"], "")
            self.assertNotIn("fixture-key", json.dumps(configs))
            stored = "\n".join(path.read_text(encoding="utf-8") for path in root.rglob("*.json*"))
            self.assertNotIn("fixture-key", stored)
            self.assertNotIn(config["mcp_servers"]["london_office"]["env"]["LONDON_GOOGLE_BRIDGE_TOKEN"], stored)
            self.assertEqual(result["data_kind"], "source_discovery")
            self.assertEqual(result["status"], "completed_metadata_only")
            self.assertEqual(len(result["pool"]["candidates"]), 32)
            self.assertEqual(len(result["selected_candidate_ids"]), 2)
            self.assertNotIn("observations", result)
            self.assertEqual(result["provider_states"]["codex_native"]["candidate_occurrences_captured"], 16)
            self.assertIsNone(result["provider_states"]["codex_native"]["http_request_count"])
            occurrences = [item for source in result["pool"]["candidates"] for item in source["occurrences"] if item["provider"] == "codex_native"]
            self.assertEqual(len(occurrences), 16)
            self.assertTrue(all(item["thread_id"] == "fixture-thread" and item["turn_id"] == "fixture-turn"
                and item["tool_item_id"] == "fixture-native-item" for item in occurrences))
            self.assertEqual(occurrences[-1]["ref_id"], "view0search15")
            self.assertEqual(adapter._sessions, {})  # A source thread cannot be reused as market chat.
            self.assertTrue(closed)
            self.assertEqual(json.loads(budget.read_text())["codex_turn_starts"], 1)
            self.assertEqual(json.loads(budget.read_text())["serpapi_search_http_starts"], 1)
            bridge_env = config["mcp_servers"]["london_office"]["env"]
            with self.assertRaises(DiscoveryError) as closed_bridge:
                GoogleBridgeClient(bridge_env["LONDON_GOOGLE_BRIDGE_URL"], bridge_env["LONDON_GOOGLE_BRIDGE_TOKEN"]).call(
                    "google_search_sources", {"query": "after completed turn"})
            self.assertEqual(closed_bridge.exception.code, "discovery_bridge_unavailable")

    def test_thread_start_failure_closes_bridge_without_credential_lookup(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "codex_turn_start_cap": 1,
                "codex_turn_starts": 0, "serpapi_search_http_start_cap": 1, "serpapi_search_http_starts": 0}), encoding="utf-8")
            settings = Settings(run_dir=root / "runs", discovery_dir=root / "pool", discovery_budget_file=budget)
            configs = []
            close = Mock()
            def failed_start(**kwargs):
                configs.append(kwargs["config"])
                raise RuntimeError("fixture SDK thread start failed")
            codex = SimpleNamespace(account=lambda: SimpleNamespace(account=SimpleNamespace(type="chatgpt")),
                models=lambda: SimpleNamespace(data=[SimpleNamespace(model=settings.model)]),
                thread_start=failed_start, close=close)
            with patch.object(CodexAdapter, "_open", return_value=codex), \
                patch("london_office.discovery._key") as credential:
                adapter = CodexAdapter(settings)
                with self.assertRaises(AgentError) as failure:
                    adapter.discover("Find fixture office reports", topic_ids=["rents"])
                self.assertEqual(failure.exception.code, "runtime_start_failed")
                credential.assert_not_called()
            close.assert_called_once()
            environment = configs[0]["mcp_servers"]["london_office"]["env"]
            with self.assertRaises(DiscoveryError):
                GoogleBridgeClient(environment["LONDON_GOOGLE_BRIDGE_URL"], environment["LONDON_GOOGLE_BRIDGE_TOKEN"]).call(
                    "google_search_sources", {"query": "after startup failure"})
            self.assertEqual(adapter._discoveries, {})
            self.assertEqual(json.loads(budget.read_text(encoding="utf-8"))["codex_turn_starts"], 1)

    def test_evidence_setup_failure_closes_session_and_releases_active_discovery(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "codex_turn_start_cap": 3,
                "codex_turn_starts": 0, "serpapi_search_http_start_cap": 1, "serpapi_search_http_starts": 0, "jobs": {}}))
            adapter = CodexAdapter(Settings(run_dir=root / "runs", discovery_dir=root / "pool", discovery_budget_file=budget))
            session = _Session("fixture-session", SimpleNamespace(close=Mock()), SimpleNamespace(turn=Mock()), root / "trace.jsonl")
            original_mkdir = Path.mkdir
            def mkdir(path, *args, **kwargs):
                if path.parent == root / "runs" / "discovery": raise PermissionError("fixture evidence write denied")
                return original_mkdir(path, *args, **kwargs)
            with patch.object(adapter, "_new_session", return_value=session), patch.object(Path, "mkdir", new=mkdir):
                with self.assertRaises(AgentError) as error:
                    adapter.discover("Find London office sources", topic_ids=["rents"])
                self.assertEqual(error.exception.code, "evidence_unavailable")
            self.assertEqual(adapter._discoveries, {})
            session.codex.close.assert_called_once()
            session.thread.turn.assert_not_called()
            self.assertEqual(json.loads(budget.read_text())["codex_turn_starts"], 1)
            run = SourcePool(root / "pool").view()["runs"][0]
            self.assertEqual(run["status"], "not_executed")
            self.assertEqual(run["error"]["code"], "evidence_unavailable")

    def test_completed_native_search_with_empty_results_does_not_claim_metadata_capture(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "codex_turn_start_cap": 3,
                "codex_turn_starts": 0, "serpapi_search_http_start_cap": 1, "serpapi_search_http_starts": 0, "jobs": {}}))
            adapter = CodexAdapter(Settings(run_dir=root / "runs", discovery_dir=root / "pool", discovery_budget_file=budget))
            class Handle:
                thread_id = "fixture-thread"
                id = "fixture-turn"
                def stream(self):
                    scope = {"threadId": self.thread_id, "turnId": self.id}
                    for method, item in [("item/completed", {"type": "webSearch", "id": "fixture-search", "query": "London office sources",
                        "action": {"type": "search", "query": "London office sources"}, "results": []}),
                        ("item/completed", {"type": "agentMessage", "id": "fixture-answer", "text": json.dumps({
                            "assessment": "No candidate metadata was exposed; source absence was not inferred.", "selected_urls": [], "warnings": []})})]:
                        yield SimpleNamespace(method=method, payload=SimpleNamespace(model_dump=lambda value={**scope, "item": item}, **kwargs: value))
                    yield SimpleNamespace(method="turn/completed", payload=SimpleNamespace(model_dump=lambda **kwargs: {**scope, "turn": {"status": "completed"}}))
            session = _Session("fixture-session", SimpleNamespace(close=Mock()), SimpleNamespace(turn=Mock(return_value=Handle())), root / "trace.jsonl")
            with patch.object(adapter, "_new_session", return_value=session):
                result = adapter.discover("Find London office sources", topic_ids=["macro"])
            self.assertEqual(result["status"], "partial")
            self.assertEqual(result["provider_states"]["codex_native"]["status"], "metadata_unavailable")
            self.assertEqual(result["provider_states"]["codex_native"]["searches_completed_observed"], 1)
            self.assertEqual(result["pool"]["runs"][0]["status"], "completed_no_candidates")
            self.assertEqual(next(t for t in result["pool"]["topics"] if t["id"] == "macro")["status"], "metadata_unavailable")
            session.codex.close.assert_called_once()

    def test_failed_discovery_start_is_archived_without_retry_or_leaked_session(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "codex_turn_start_cap": 3,
                "codex_turn_starts": 0, "serpapi_search_http_start_cap": 1, "serpapi_search_http_starts": 0, "jobs": {}}))
            adapter = CodexAdapter(Settings(run_dir=root / "runs", discovery_dir=root / "pool", discovery_budget_file=budget))
            with patch.object(adapter, "_new_session", side_effect=AgentError("model_unavailable", "Configured model unavailable")) as startup:
                with self.assertRaises(AgentError):
                    adapter.discover("Find London office research", topic_ids=["vacancy"])
                startup.assert_called_once()
            self.assertEqual(json.loads(budget.read_text())["codex_turn_starts"], 1)
            self.assertEqual(SourcePool(root / "pool").view()["runs"][0]["status"], "not_executed")
            self.assertEqual(adapter._discoveries, {})
            self.assertTrue(list((root / "runs").rglob("failure.json")))


if __name__ == "__main__": unittest.main()
