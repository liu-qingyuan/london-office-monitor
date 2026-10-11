"""Source-candidate Data Interface contracts; synthetic inputs, not live evidence."""
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit
import io
import json
import unittest

from london_office.source_pool import SourcePool
from london_office.mcp_server import MCPServer


class SourcePoolTests(unittest.TestCase):
    def test_archive_preserves_all_occurrences_without_turning_intent_into_geography(self):
        with TemporaryDirectory() as directory:
            pool = SourcePool(Path(directory))
            occurrences = [{"url": f"https://example.test/report/{index}", "title": f"Fixture report {index}",
                "snippet": "Index metadata, not an original excerpt", "provider_path": f"/organic_results/{index}/link",
                "provider_position": index + 1, "date_hint": None} for index in range(16)]
            occurrences.append({**occurrences[0], "provider_path": "/knowledge_graph/source/link"})
            pool.record({"id": "fixture-google", "provider": "serpapi_google", "query": "London office rents",
                "topic_ids": ["rents"], "intent_context": {"area_id": "city"},
                "status": "completed_metadata_only"}, occurrences)
            view = SourcePool(Path(directory)).view()
            self.assertEqual(view["source_count"], 16)
            self.assertEqual(view["occurrence_count"], 17)
            source = next(item for item in view["candidates"] if item["url"] == occurrences[0]["url"])
            self.assertEqual(len(source["occurrences"]), 2)
            self.assertEqual(source["verification_status"], "unverified_search_metadata")
            self.assertEqual(source["source_geography"]["status"], "not_verified")
            self.assertNotIn("area_id", source)
            self.assertEqual(view["runs"][0]["intent_context"], {"area_id": "city"})
            self.assertEqual(next(item for item in view["topics"] if item["id"] == "rents")["status"], "metadata_collected")
            self.assertEqual(next(item for item in view["topics"] if item["id"] == "macro")["status"], "not_searched")
            self.assertNotIn("observations", view)


    def test_completed_empty_search_does_not_claim_candidate_metadata_was_collected(self):
        with TemporaryDirectory() as directory:
            # A legacy completed execution can have no exposed candidate URLs.
            view = SourcePool(Path(directory)).record({"id": "fixture-empty", "provider": "codex_native",
                "query": "London office sources", "topic_ids": ["macro"], "status": "completed_metadata_only"}, [])
            topic = next(t for t in view["topics"] if t["id"] == "macro")
            self.assertEqual(topic["status"], "metadata_unavailable")
            self.assertEqual(topic["completed_searches"], 1)
            self.assertEqual(view["source_count"], 0)


class GoogleToolTests(unittest.TestCase):
    def test_google_tool_collects_complete_metadata_through_real_data_archive(self):
        from london_office.discovery import GoogleDiscovery, DiscoveryTools
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 2,
                "serpapi_search_http_starts": 0, "codex_turn_start_cap": 3, "codex_turn_starts": 0,
                "account_http_starts": 0, "jobs": {}}))
            payload = {"search_metadata": {"status": "Success"}, "organic_results": [
                {"link": f"https://example.test/report/{index}", "title": f"Fixture source {index}",
                 "snippet": "Unverified search metadata", "position": index + 1} for index in range(16)]}
            calls = []
            class Response(io.BytesIO):
                status = 200
                headers = {"Content-Type": "application/json"}
            def fetch(request, timeout):
                url = urlsplit(request.full_url)
                calls.append(url.path)
                self.assertEqual(parse_qs(url.query)["api_key"], ["fixture-key"])
                body = {"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
                    "total_searches_left": 20, "this_hour_searches": 0, "account_rate_limit_per_hour": 100,
                    "api_key": "fixture-key", "email": "fixture@example.test"} if url.path == "/account.json" else payload
                return Response(json.dumps(body).encode())
            with patch("london_office.discovery._key", return_value="fixture-key"), patch("london_office.discovery._open", side_effect=fetch):
                discovery = GoogleDiscovery(SourcePool(root / "pool"), budget)
                server = MCPServer(DiscoveryTools(discovery, topic_ids=["rents"], context={"area_id": "city"}))
                listed = server.handle({"jsonrpc": "2.0", "id": 1, "method": "tools/list"})
                self.assertEqual([tool["name"] for tool in listed["result"]["tools"]], ["google_search_sources"])
                response = server.handle({"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
                    "name": "google_search_sources", "arguments": {"query": "London office rents"}}})
                self.assertFalse(response["result"]["isError"])
            output = response["result"]["structuredContent"]
            self.assertEqual(len(output["candidates"]), 16)
            self.assertEqual(output["status"], "completed_metadata_only")
            self.assertEqual(SourcePool(root / "pool").view()["source_count"], 16)
            self.assertEqual(json.loads(budget.read_text())["serpapi_search_http_starts"], 1)
            self.assertEqual(calls, ["/account.json", "/search"])
            stored = "\n".join(path.read_text() for path in (root / "pool").rglob("*.json"))
            self.assertNotIn("fixture-key", stored)
            self.assertNotIn("fixture@example.test", stored)
            self.assertNotIn("fixture-key", json.dumps(output))

    def test_exhausted_budget_blocks_credentials_and_network_before_search(self):
        from london_office.discovery import GoogleDiscovery, DiscoveryError
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 1, "jobs": {}}))
            with patch("london_office.discovery._key") as key, patch("london_office.discovery._open") as network:
                with self.assertRaises(DiscoveryError) as error:
                    GoogleDiscovery(SourcePool(root / "pool"), budget).search("London office rents", topic_ids=["rents"])
                self.assertEqual(error.exception.code, "search_budget_exhausted")
                key.assert_not_called()
                network.assert_not_called()
            view = SourcePool(root / "pool").view()
            self.assertEqual(view["runs"][0]["status"], "not_executed")
            self.assertEqual(view["source_count"], 0)
            self.assertEqual(next(topic for topic in view["topics"] if topic["id"] == "rents")["status"], "not_executed")

    def test_url_encoded_credential_echo_is_not_retained(self):
        from london_office.discovery import GoogleDiscovery, DiscoveryError
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0, "jobs": {}}))
            class Response(io.BytesIO): status = 200
            responses = [Response(json.dumps({"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
                "total_searches_left": 20, "this_hour_searches": 0, "account_rate_limit_per_hour": 100}).encode()),
                Response(json.dumps({"search_metadata": {"status": "Success",
                    "json_endpoint": "https://serpapi.com/search.json?api_key=fixture%2Bkey"}}).encode())]
            with patch("london_office.discovery._key", return_value="fixture+key"), patch("london_office.discovery._open", side_effect=responses):
                with self.assertRaises(DiscoveryError) as error:
                    GoogleDiscovery(SourcePool(root / "pool"), budget).search("London office sources", topic_ids=["rents"])
                self.assertEqual(error.exception.code, "credential_echo_refused")
            self.assertFalse(list((root / "pool").rglob("search-response.json")))
            self.assertEqual(json.loads(budget.read_text())["serpapi_search_http_starts"], 1)
            for path in (root / "pool").rglob("*.json"):
                self.assertNotIn("fixture%2Bkey", path.read_text())
                self.assertNotIn("fixture+key", path.read_text())

    def test_credential_echo_is_not_saved_or_returned_and_still_consumes_start(self):
        from london_office.discovery import GoogleDiscovery, DiscoveryError
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root / "budget.json"
            budget.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0, "jobs": {}}))
            class Response(io.BytesIO):
                status = 200
            responses = [Response(json.dumps({"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
                "total_searches_left": 20, "this_hour_searches": 0, "account_rate_limit_per_hour": 100}).encode()),
                Response(json.dumps({"error": "fixture-sensitive-token"}).encode())]
            with patch("london_office.discovery._key", return_value="fixture-sensitive-token"), patch("london_office.discovery._open", side_effect=responses):
                with self.assertRaises(DiscoveryError) as error:
                    GoogleDiscovery(SourcePool(root / "pool"), budget).search("London office rents", topic_ids=["rents"])
                self.assertEqual(error.exception.code, "credential_echo_refused")
            self.assertEqual(json.loads(budget.read_text())["serpapi_search_http_starts"], 1)
            self.assertEqual(SourcePool(root / "pool").view()["runs"][0]["status"], "failed")
            self.assertFalse(list((root / "pool").rglob("search-response.json")))
            for path in (root / "pool").rglob("*.json"):
                self.assertNotIn("fixture-sensitive-token", path.read_text())


if __name__ == "__main__":
    unittest.main()
