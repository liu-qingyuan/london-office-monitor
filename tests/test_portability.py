"""Portable runtime contracts: real CLI/processes, fixture secrets/provider only.

Unavailable Unix modules and Windows lock calls can be simulated on macOS;
only the OS matrix exercises native Windows/Linux behavior.
"""
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from urllib.request import ProxyHandler, getproxies_environment

from london_office.data import ROOT
from london_office.discovery import DiscoveryBudget, DiscoveryError, DiscoveryTools, GoogleDiscovery
from london_office.discovery_bridge import GoogleBridgeClient, GoogleSearchBridge
from london_office.source_pool import SourcePool


class ProviderResponse(io.BytesIO):
    status = 200


def provider_responses():
    return [ProviderResponse(json.dumps({"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
        "total_searches_left": 5, "this_hour_searches": 0, "account_rate_limit_per_hour": 100,
        "api_key": "portability-fixture-secret", "email": "fixture@example.test"}).encode()),
        ProviderResponse(json.dumps({"search_metadata": {"status": "Success"}, "organic_results": [
            {"link": "https://example.test/office-report", "title": "Unverified fixture report"}]}).encode())]


class PortableStartupTests(unittest.TestCase):
    def test_cli_help_does_not_require_unix_only_modules(self):
        code = (
            "import sys; sys.modules['fcntl'] = None; "
            "from london_office.cli import main; "
            "sys.argv = ['london-office', '--help']; raise SystemExit(main())"
        )
        result = subprocess.run([sys.executable, "-c", code], cwd=ROOT,
            env={**os.environ, "PYTHONUTF8": "1", "SERPAPI_API_KEY": ""},
            capture_output=True, text=True, encoding="utf-8", timeout=10)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("collect-sources", result.stdout)

    def test_browser_python_launcher_configuration_has_no_unix_only_venv_path(self):
        # Configuration regression guard, not a native Windows execution claim.
        for filename in ("market.spec.ts", "left-detail.spec.ts", "cold-start.spec.ts"):
            with self.subTest(filename=filename):
                source = (ROOT / "frontend/tests" / filename).read_text(encoding="utf-8")
                self.assertFalse("../.venv/bin/python" in source, f"{filename} still uses a Unix-only Python launcher")

    def test_pinned_native_codex_runtime_starts_without_authentication(self):
        from codex_cli_bin import bundled_codex_path
        with TemporaryDirectory() as directory:
            result = subprocess.run([str(bundled_codex_path()), "--version"], cwd=ROOT,
                env={**os.environ, "CODEX_HOME": directory, "OPENAI_API_KEY": "", "CODEX_API_KEY": "",
                    "LONDON_OPENAI_API_KEY": "", "SERPAPI_API_KEY": ""},
                capture_output=True, text=True, encoding="utf-8", timeout=10)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("0.162.0", result.stdout)
            self.assertFalse((Path(directory) / "auth.json").exists())

    @unittest.skipUnless(shutil.which("node") and shutil.which("npm"), "Frontend checks require the documented Node/npm tools")
    def test_focused_check_validates_arguments_without_bash(self):
        node_directory = str(Path(shutil.which("node")).parent)
        shell = os.environ.get("COMSPEC", "cmd.exe") if os.name == "nt" else "/bin/sh"
        result = subprocess.run([shutil.which("npm"), "run", "check:focused", "--"], cwd=ROOT / "frontend",
            env={**os.environ, "PATH": node_directory, "npm_config_script_shell": shell, "PYTHONUTF8": "1"},
            capture_output=True, text=True, encoding="utf-8", timeout=10)
        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("Pass a test file", result.stderr)


class PortableBudgetTests(unittest.TestCase):
    def test_windows_receipt_lock_reserves_and_unlocks_the_same_byte(self):
        calls = []
        def locking(descriptor, action, length):
            calls.append((action, length, os.lseek(descriptor, 0, os.SEEK_CUR)))
        windows = SimpleNamespace(LK_LOCK=1, LK_UNLCK=2, locking=locking)
        with TemporaryDirectory() as directory:
            receipt = Path(directory) / "budget.json"
            receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0}), encoding="utf-8")
            with patch("london_office.storage.os", SimpleNamespace(name="nt", replace=os.replace, fsync=os.fsync)), \
                patch.dict(sys.modules, {"fcntl": None, "msvcrt": windows}):
                DiscoveryBudget(receipt).start("search", "fixture-search", "伦敦 City")
            saved = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(saved["serpapi_search_http_starts"], 1)
            self.assertEqual(saved["jobs"]["fixture-search"]["query"], "伦敦 City")
            self.assertEqual(calls, [(windows.LK_LOCK, 1, 0), (windows.LK_UNLCK, 1, 0)])
            self.assertGreaterEqual(len(receipt.with_suffix(".lock").read_bytes()), 1)


    def test_spawned_processes_cannot_overspend_or_reset_receipt(self):
        code = """
import sys
from pathlib import Path
from london_office.discovery import DiscoveryBudget, DiscoveryError
try:
    DiscoveryBudget(Path(sys.argv[1])).start('search', sys.argv[2], '并发 fixture')
    print('reserved')
except DiscoveryError as error:
    print(error.code)
"""
        with TemporaryDirectory() as directory:
            receipt = Path(directory) / "budget.json"
            receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0}), encoding="utf-8")
            children = [subprocess.Popen([sys.executable, "-c", code, str(receipt), f"fixture-{index}"], cwd=ROOT,
                env={**os.environ, "PYTHONUTF8": "1", "SERPAPI_API_KEY": ""}, stdout=subprocess.PIPE,
                stderr=subprocess.PIPE, text=True, encoding="utf-8") for index in range(4)]
            try:
                results = [child.communicate(timeout=10) for child in children]
                for child, (_, errors) in zip(children, results):
                    self.assertEqual(child.returncode, 0, errors)
                self.assertEqual([output.strip() for output, _ in results].count("reserved"), 1)
                self.assertEqual([output.strip() for output, _ in results].count("search_budget_exhausted"), 3)
                self.assertEqual(json.loads(receipt.read_text(encoding="utf-8"))["serpapi_search_http_starts"], 1)
                with self.assertRaises(DiscoveryError) as failure:
                    DiscoveryBudget(receipt).start("search", "reopened", "fixture")
                self.assertEqual(failure.exception.code, "search_budget_exhausted")
            finally:
                for child in children:
                    if child.poll() is None:
                        child.kill()
                        child.wait(timeout=5)


class PortableCredentialTests(unittest.TestCase):
    def test_missing_key_on_non_macos_is_explicit_and_never_looks_up_keychain(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = root / "budget.json"
            receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0}), encoding="utf-8")
            with patch.dict(os.environ, {"SERPAPI_API_KEY": ""}), patch("sys.platform", "linux"), \
                patch("london_office.discovery.subprocess.run", side_effect=AssertionError("No platform credential command")) as command, \
                patch("london_office.discovery._open") as provider:
                with self.assertRaises(DiscoveryError) as failure:
                    GoogleDiscovery(SourcePool(root / "pool"), receipt).search("London office sources", topic_ids=["rents"])
                self.assertEqual(failure.exception.code, "search_key_unavailable")
                command.assert_not_called()
                provider.assert_not_called()
            saved = json.loads(receipt.read_text(encoding="utf-8"))
            self.assertEqual(saved["serpapi_search_http_starts"], 0)

    def test_existing_macos_keychain_is_reused_only_when_environment_key_is_absent(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = root / "budget.json"
            receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                "serpapi_search_http_starts": 0}), encoding="utf-8")
            with patch.dict(os.environ, {"SERPAPI_API_KEY": ""}), patch("sys.platform", "darwin"), \
                patch("london_office.discovery.subprocess.run", return_value=SimpleNamespace(
                    returncode=0, stdout="portability-fixture-secret\n")) as keychain, \
                patch("london_office.discovery._open", side_effect=provider_responses()):
                result = GoogleDiscovery(SourcePool(root / "pool"), receipt).search("London office reports", topic_ids=["rents"])
            self.assertEqual(result["status"], "completed_metadata_only")
            self.assertEqual(keychain.call_args.args[0], ["/usr/bin/security", "find-generic-password", "-a",
                "london-office-research-lab", "-s", "london-office-research-lab.serpapi", "-w"])
            self.assertNotIn("portability-fixture-secret", json.dumps(result))


class PortableTransportTests(unittest.TestCase):
    def test_search_uses_standard_or_explicit_proxy_instead_of_personal_port(self):
        cases = [({}, {}), ({"HTTPS_PROXY": "http://localhost:8899"}, {"https": "http://localhost:8899"}),
            ({"LONDON_SERPAPI_PROXY": "http://localhost:9988"}, {"https": "http://localhost:9988"}),
            ({"HTTPS_PROXY": "http://localhost:8899", "LONDON_SERPAPI_PROXY": ""}, {})]
        for environment, expected in cases:
            with self.subTest(environment=environment), TemporaryDirectory() as directory:
                root = Path(directory)
                receipt = root / "budget.json"
                receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 1,
                    "serpapi_search_http_starts": 0}), encoding="utf-8")
                opener = Mock()
                opener.open.side_effect = provider_responses()
                with patch.dict(os.environ, {"SERPAPI_API_KEY": "portability-fixture-secret", **environment}, clear=True), \
                    patch("urllib.request.getproxies", side_effect=getproxies_environment), \
                    patch("london_office.discovery.build_opener", return_value=opener) as build:
                    result = GoogleDiscovery(SourcePool(root / "pool"), receipt).search("London office reports", topic_ids=["rents"])
                self.assertEqual(result["status"], "completed_metadata_only")
                for call in build.call_args_list:
                    handler = next(item for item in call.args if isinstance(item, ProxyHandler))
                    self.assertEqual(handler.proxies, expected)


class BridgeSecurityTests(unittest.TestCase):
    def test_bridge_denies_untrusted_scope_replay_and_credentials_and_closes(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            receipt = root / "budget.json"
            receipt.write_text(json.dumps({"authorization": "fixture-only", "serpapi_search_http_start_cap": 2,
                "serpapi_search_http_starts": 0}), encoding="utf-8")
            bridge = GoogleSearchBridge(DiscoveryTools(GoogleDiscovery(SourcePool(root / "pool"), receipt,
                request_id="fixture-request"), topic_ids=["rents"], context={"area_id": "city"}))
            environment = bridge.mcp_env
            client = GoogleBridgeClient(environment["LONDON_GOOGLE_BRIDGE_URL"], environment["LONDON_GOOGLE_BRIDGE_TOKEN"])
            with patch.dict(os.environ, {"SERPAPI_API_KEY": "portability-fixture-secret"}), \
                patch("london_office.discovery._open", side_effect=provider_responses()) as provider:
                try:
                    untrusted = GoogleBridgeClient(environment["LONDON_GOOGLE_BRIDGE_URL"], "wrong-fixture-token")
                    with self.assertRaises(DiscoveryError) as denied:
                        untrusted.call("google_search_sources", {"query": "fixture"})
                    self.assertEqual(denied.exception.code, "discovery_bridge_denied")
                    with self.assertRaises(DiscoveryError):
                        client.call("google_search_sources", {"query": "fixture", "budget_file": "not-allowed"})
                    with self.assertRaises(DiscoveryError):
                        client.call("google_search_sources", {"query": "x" * 9000})
                    provider.assert_not_called()
                    result = client.call("google_search_sources", {"query": "伦敦 office fixture"})
                    self.assertEqual(result["run"]["intent_context"], {"area_id": "city"})
                    self.assertEqual(result["run"]["topic_ids"], ["rents"])
                    self.assertNotIn("portability-fixture-secret", json.dumps(result))
                    reconnected = GoogleBridgeClient(environment["LONDON_GOOGLE_BRIDGE_URL"], environment["LONDON_GOOGLE_BRIDGE_TOKEN"])
                    with self.assertRaises(DiscoveryError) as repeated:
                        reconnected.call("google_search_sources", {"query": "retry fixture"})
                    self.assertEqual(repeated.exception.code, "discovery_query_limit")
                    self.assertEqual(provider.call_count, 2)  # Only account + original search.
                finally:
                    bridge.close()
                    bridge.close()  # Cleanup is idempotent.
            self.assertEqual(json.loads(receipt.read_text(encoding="utf-8"))["serpapi_search_http_starts"], 1)
            stored = "\n".join(path.read_text(encoding="utf-8") for path in root.rglob("*.json*"))
            self.assertNotIn("portability-fixture-secret", stored)
            self.assertNotIn(environment["LONDON_GOOGLE_BRIDGE_TOKEN"], stored)
            with self.assertRaises(DiscoveryError) as closed:
                client.call("google_search_sources", {"query": "after close"})
            self.assertEqual(closed.exception.code, "discovery_bridge_unavailable")

    def test_bridge_client_refuses_external_or_redirectable_endpoints(self):
        for url in ["https://example.test/google", "http://localhost:1234/google", "http://127.0.0.1:1234/other",
            "http://user:pass@127.0.0.1:1234/google", "http://127.0.0.1:1234/google?key=fixture"]:
            with self.subTest(url=url), self.assertRaises(DiscoveryError):
                GoogleBridgeClient(url, "fixture-token")


if __name__ == "__main__":
    unittest.main()
