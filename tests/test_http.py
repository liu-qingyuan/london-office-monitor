"""Real local HTTP integration with the real Market Module; model access disabled."""
import json
import socket
import subprocess
import sys
import time
import unittest
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
from london_office.data import ROOT


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.url = f"http://127.0.0.1:{port}"
        cls.server = subprocess.Popen([sys.executable, "-m", "london_office", "serve", "--port", str(port), "--no-agent"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
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

    def test_foreign_browser_origin_cannot_spend_model_turns(self):
        code, result = self.request("/api/chat", {"question":"City rent?"}, {"Origin":"https://example.com"})
        self.assertEqual(code, 403)
        self.assertEqual(result["error"]["code"], "origin_not_allowed")


if __name__ == "__main__":
    unittest.main()
