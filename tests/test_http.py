"""Real local HTTP integration with the real Market Module; model access disabled."""
import json
import os
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from london_office.data import ROOT
from pathlib import Path


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{port}"
        cls.discovery_directory = tempfile.TemporaryDirectory()
        cls.server = subprocess.Popen([sys.executable, "-m", "london_office", "serve", "--port", str(port), "--no-agent"], cwd=ROOT,
            env={**os.environ, "LONDON_DISCOVERY_DIR": cls.discovery_directory.name,
                "LONDON_RESEARCH_DIR": str(Path(cls.discovery_directory.name)/"research")},
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(100):
            if cls.server.poll() is not None:
                raise RuntimeError("Dedicated integration server failed to start")
            try:
                with urlopen(cls.url + "/api/catalog", timeout=1):
                    return
            except (URLError, ConnectionError):
                time.sleep(0.05)
        cls.server.terminate()
        cls.server.wait(timeout=5)
        raise RuntimeError("Dedicated integration server did not become ready")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=5)
        cls.discovery_directory.cleanup()

    def request(self, path, body=None, headers=None):
        data = json.dumps(body).encode() if body is not None else None
        request = Request(self.url + path, data=data, headers={"Content-Type":"application/json", **(headers or {})})
        try:
            with urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except HTTPError as error:
            return error.code, json.load(error)

    def test_catalog_and_map_values_share_business_contract(self):
        code, catalog = self.request("/api/catalog")
        self.assertEqual(code, 200)
        self.assertFalse(catalog["agent"]["enabled"])
        self.assertEqual(len(catalog["areas"]), 4)
        code, market = self.request("/api/market?metric=prime_rent&period=2025-YE")
        self.assertEqual(code, 200)
        self.assertEqual([row["value"] for row in market["observations"]], [105.26, 166.61, None, None])
        self.assertEqual(market["comparisons"][1]["change_value"], 5.78)

    def test_eight_research_dimensions_cross_real_http_without_expanding_map_values(self):
        code, result = self.request("/api/market?area=canary_wharf&period=2025-YE")
        self.assertEqual(code, 200)
        self.assertIsNone(result["observations"][0]["value"])
        research = result["research"]
        self.assertEqual(len(research["topics"]), 8)
        self.assertEqual(len(research["records"]), 132)
        self.assertEqual(len(research["latest_update"]["record_ids"]), 12)
        self.assertEqual(len(research["exclusions"]), 7)
        self.assertTrue(all(r["map_binding"] is None for r in research["records"]))
        self.assertTrue(any(r["metric"] == "bank_rate" and r["value"] == 3.75 for r in research["records"]))
        self.assertEqual(research["publication_status"], "admitted_with_caveats")
        self.assertFalse(research["is_live"])

    def test_discovery_inventory_is_readonly_and_separate_from_market_facts(self):
        code, pool = self.request("/api/discovery")
        self.assertEqual(code, 200)
        self.assertEqual(pool["data_kind"], "source_candidates")
        self.assertEqual({topic["id"] for topic in pool["topics"]},
            {"rents", "vacancy", "leasing", "supply", "submarkets", "macro", "demand", "news"})
        self.assertEqual(pool["candidates"], [])
        self.assertTrue(all(topic["status"] == "not_searched" for topic in pool["topics"]))
        self.assertNotIn("observations", pool)
        self.assertNotIn("answer", pool)

    def test_unknown_period_and_extra_request_fields_are_explicit_errors(self):
        code, error = self.request("/api/market?period=2026-Q3")
        self.assertEqual(code, 422)
        self.assertEqual(error["status"], "error")
        code, error = self.request("/api/chat", {"question":"City?", "api_key":"TEST-ONLY"})
        self.assertEqual(code, 422)
        self.assertEqual(error["error"]["code"], "invalid_request")
        self.assertNotIn("TEST-ONLY", json.dumps(error))

    def test_offline_chat_is_not_a_simulated_model_answer(self):
        code, result = self.request("/api/chat", {"question":"City rent?"})
        self.assertEqual(code, 503)
        self.assertEqual(result["error"]["code"], "agent_disabled")
        self.assertNotIn("answer", result)

    def test_explicit_discovery_does_not_bypass_agent_or_origin_permissions(self):
        body = {"question": "Find current London office source reports", "topic_ids": ["rents", "vacancy"]}
        code, result = self.request("/api/discovery", body)
        self.assertEqual(code, 503)
        self.assertEqual(result["error"]["code"], "agent_disabled")
        code, result = self.request("/api/discovery", body, {"Origin": "https://example.com"})
        self.assertEqual(code, 403)
        self.assertEqual(result["error"]["code"], "origin_not_allowed")
        code, result = self.request("/api/discovery", {**body, "api_key": "TEST-ONLY"})
        self.assertEqual(code, 422)
        self.assertNotIn("TEST-ONLY", json.dumps(result))

    def test_web_grant_requires_exact_user_origin_and_never_starts_offline_model(self):
        body = {"google_cap":2,"model_turn_cap":1,"valid_for_minutes":5,"request_id":"http-fixture-action"}
        for headers in ({}, {"Origin":"https://example.com","X-Office-User-Action":"confirm"},
                {"Origin":"http://127.0.0.1:9","X-Office-User-Action":"confirm"}):
            code, result = self.request("/api/discovery/authorization", body, headers)
            self.assertEqual(code,403)
            self.assertEqual(result["error"]["code"],"origin_not_allowed")
        headers={"Origin":self.url,"X-Office-User-Action":"confirm"}
        code, grant = self.request("/api/discovery/authorization",body,headers)
        self.assertEqual(code,200)
        self.assertEqual(grant["status"],"active")
        self.assertEqual(grant["google"]["remaining"],2)
        self.assertNotIn("budget_file",grant)
        self.assertNotIn(self.discovery_directory.name,json.dumps(grant))
        code, failure = self.request("/api/discovery",{"question":"Offline fixture only","authorization_id":grant["authorization_id"]},headers)
        self.assertEqual(failure["error"]["code"],"agent_disabled")
        code, repeated = self.request("/api/discovery/authorization",body,headers)
        self.assertEqual(repeated["authorization_id"],grant["authorization_id"])
        self.assertEqual(repeated["model_turns"]["starts"],0)
        self.assertEqual(self.request("/api/discovery/authorization")[1]["authorization_id"],grant["authorization_id"])

    def test_foreign_browser_origin_cannot_spend_model_turns(self):
        code, result = self.request("/api/chat", {"question":"City rent?"}, {"Origin":"https://example.com"})
        self.assertEqual(code, 403)
        self.assertEqual(result["error"]["code"], "origin_not_allowed")


if __name__ == "__main__":
    unittest.main()
