"""Single-check monitoring contracts. Provider fixtures are NOT live evidence."""
import hashlib
import io
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit

from london_office.discovery import DiscoveryError
from london_office.monitoring import SourceMonitor
from london_office.source_pool import SourcePool


class Response(io.BytesIO):
    status = 200


class SourceMonitorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.pool = SourcePool(self.root / "pool")
        self.receipt = self.root / "fixture-receipt.json"
        self.monitor = SourceMonitor(self.pool, self.receipt)
        self.plan = {"schema_version": 1, "query": "SYNTHETIC London office rents 2025 2026", "topic_ids": ["rents"]}
        now = datetime.now(timezone.utc)
        self.receipt.write_text(json.dumps({"authorization": "synthetic fixture ONLY; not real execution permission",
            "serpapi_search_http_start_cap": 4, "serpapi_search_http_starts": 0, "jobs": {},
            "source_monitoring": {"plan_sha256": self.monitor.preview(self.plan)["plan_sha256"],
                "purpose": "source_candidates_only", "authorized_at": (now - timedelta(seconds=1)).isoformat(),
                "expires_at": (now + timedelta(hours=1)).isoformat(), "run_start_cap": 5, "run_starts": 0}}), encoding="utf-8")
        self.payload = {"search_metadata": {"status": "Success"}, "organic_results": [
            {"link": "https://example.test/report", "title": "SYNTHETIC report", "snippet": "Unverified metadata", "date": "2026-01-30"}]}
        self.calls = []
        self.fail_search = False
        self.key = patch("london_office.discovery._key", return_value="monitoring-fixture-secret").start()
        self.addCleanup(patch.stopall)
        self.provider = patch("london_office.discovery._open", side_effect=self.fetch).start()

    def fetch(self, request, timeout):
        path = urlsplit(request.full_url).path
        self.calls.append(path)
        if path == "/search" and self.fail_search:
            raise TimeoutError("synthetic timeout")
        payload = {"account_status": "Active", "plan_name": "Free Plan", "plan_monthly_price": 0,
            "total_searches_left": 20, "this_hour_searches": 0, "account_rate_limit_per_hour": 100,
            "api_key": "monitoring-fixture-secret", "email": "fixture@example.test"} if path == "/account.json" else self.payload
        return Response(json.dumps(payload).encode())

    def test_one_incremental_check_binds_candidates_to_actual_execution_not_market_facts(self):
        result = self.monitor.run(self.plan)
        self.assertEqual(result["status"], "pending_verification")
        self.assertFalse(result["formal_market_updated"])
        self.assertEqual(result["publication_check_status"], "not_checked")
        self.assertEqual(len(result["new_candidate_ids"]), 1)
        view = self.pool.view()
        self.assertEqual(view["source_count"], 1)
        self.assertEqual(view["candidates"][0]["occurrences"][0]["run_id"], result["source_run_id"])
        raw = self.pool.directory / result["metadata_evidence"]["path"]
        self.assertEqual(result["metadata_evidence"]["sha256"], hashlib.sha256(raw.read_bytes()).hexdigest())
        self.assertEqual(self.calls, ["/account.json", "/search"])
        self.assertEqual(self.monitor.view()["runs"][-1], result)
        self.assertNotIn("observations", result)
        stored = "\n".join(path.read_text(encoding="utf-8") for path in self.pool.directory.rglob("*.json"))
        self.assertNotIn("monitoring-fixture-secret", stored)
        self.assertNotIn("fixture@example.test", stored)

    def test_failed_check_retains_last_valid_metadata_and_never_retries(self):
        first = self.monitor.run(self.plan)
        self.fail_search = True
        failed = self.monitor.run(self.plan)
        self.assertEqual(failed["status"], "check_failed")
        self.assertEqual(failed["last_valid_source_run_id"], first["source_run_id"])
        self.assertEqual(failed["error"]["code"], "google_discovery_failed")
        self.assertEqual(failed["discovery_status"], "failed")
        self.assertEqual(failed["new_candidate_ids"], [])
        self.assertIsNone(failed["checked_at"])
        self.assertEqual(self.pool.view()["source_count"], 1)
        self.assertEqual(self.calls, ["/account.json", "/search", "/account.json", "/search"])
        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        self.assertEqual(receipt["serpapi_search_http_starts"], 2)
        self.assertEqual(receipt["source_monitoring"]["run_starts"], 2)
        topic = next(t for t in self.monitor.view()["topics"] if t["id"] == "rents")
        self.assertEqual(topic["status"], "check_failed")
        self.assertEqual(topic["last_valid_source_run_id"], first["source_run_id"])

    def test_real_module_cli_previews_one_plan_without_receipt_credentials_or_writes(self):
        plan = self.root / "plan.json"
        plan.write_text(json.dumps(self.plan), encoding="utf-8")
        command = subprocess.run([sys.executable, "-m", "london_office.monitoring", "--plan", str(plan), "--preview"],
            env={**os.environ, "LONDON_DISCOVERY_DIR": str(self.pool.directory), "SERPAPI_API_KEY": ""},
            capture_output=True, text=True, encoding="utf-8", timeout=10)
        self.assertEqual(command.returncode, 0, command.stderr)
        self.assertTrue(command.stdout.strip(), "The module CLI must actually report the preview")
        output = json.loads(command.stdout)
        self.assertEqual(output["plan_sha256"], self.monitor.preview(self.plan)["plan_sha256"])
        self.assertEqual(output["searches_per_run"], 1)
        self.assertFalse(output["formal_market_updated"])
        self.assertFalse(self.pool.directory.exists())

    def test_repeat_deduplicates_urls_and_response_hash_change_is_not_a_market_revision(self):
        from london_office.data import ROOT
        snapshot = ROOT / "data/snapshot.json"
        snapshot_before = snapshot.read_bytes()
        first = self.monitor.run(self.plan)
        first_record = self.monitor.directory / first["id"] / "result.json"
        first_bytes = first_record.read_bytes()
        self.payload["search_metadata"]["provider_request_id"] = "changed transport metadata only"
        repeat = self.monitor.run(self.plan)
        self.assertEqual(repeat["status"], "no_new_candidates")
        self.assertEqual(repeat["new_candidate_ids"], [])
        self.assertEqual(repeat["metadata_changed_candidate_ids"], [])
        self.assertNotEqual(first["metadata_evidence"]["sha256"], repeat["metadata_evidence"]["sha256"])
        self.assertEqual(self.pool.view()["source_count"], 1)
        self.assertEqual(self.pool.view()["occurrence_count"], 2)
        self.assertEqual(first_record.read_bytes(), first_bytes)
        self.assertEqual(snapshot.read_bytes(), snapshot_before)
        self.assertFalse(repeat["formal_market_updated"])
        self.assertEqual(repeat["publication_check_status"], "not_checked")

    def test_search_budget_stops_before_credentials_or_network_and_preserves_old_candidates(self):
        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        receipt["serpapi_search_http_start_cap"] = 1
        self.receipt.write_text(json.dumps(receipt), encoding="utf-8")
        first = self.monitor.run(self.plan)
        self.key.reset_mock()
        self.provider.reset_mock()
        blocked = self.monitor.run(self.plan)
        self.assertEqual(blocked["status"], "not_checked")
        self.assertEqual(blocked["error"]["code"], "search_budget_exhausted")
        self.assertEqual(blocked["last_valid_source_run_id"], first["source_run_id"])
        self.assertEqual(blocked["discovery_status"], "not_executed")
        self.key.assert_not_called()
        self.provider.assert_not_called()
        self.assertEqual(self.pool.view()["source_count"], 1)
        self.assertEqual(json.loads(self.receipt.read_text(encoding="utf-8"))["serpapi_search_http_starts"], 1)

    def test_historical_receipt_with_spare_quota_cannot_authorize_monitoring(self):
        legacy = json.loads(self.receipt.read_text(encoding="utf-8"))
        del legacy["source_monitoring"]
        self.receipt.write_text(json.dumps(legacy), encoding="utf-8")
        before = self.receipt.read_bytes()
        with self.assertRaises(DiscoveryError) as rejected:
            self.monitor.run(self.plan)
        self.assertEqual(rejected.exception.code, "monitoring_authorization_required")
        self.key.assert_not_called()
        self.provider.assert_not_called()
        self.assertEqual(self.receipt.read_bytes(), before)
        self.assertEqual(self.pool.view()["runs"], [])

    def test_malformed_boolean_plan_version_is_rejected_before_any_execution(self):
        with self.assertRaises(DiscoveryError) as rejected:
            self.monitor.run({**self.plan, "schema_version": True})
        self.assertEqual(rejected.exception.code, "invalid_monitoring_plan")
        self.key.assert_not_called()
        self.provider.assert_not_called()

    def test_finite_round_budget_blocks_repeated_failed_account_checks(self):
        receipt = json.loads(self.receipt.read_text(encoding="utf-8"))
        receipt["source_monitoring"]["run_start_cap"] = 1
        self.receipt.write_text(json.dumps(receipt), encoding="utf-8")
        with patch("london_office.discovery._open", side_effect=TimeoutError("synthetic account timeout")) as provider:
            failed = self.monitor.run(self.plan)
            self.assertEqual(failed["status"], "check_failed")
            with self.assertRaises(DiscoveryError) as blocked:
                self.monitor.run(self.plan)
            self.assertEqual(blocked.exception.code, "monitor_run_budget_exhausted")
            self.assertEqual(provider.call_count, 1)
        saved = json.loads(self.receipt.read_text(encoding="utf-8"))
        self.assertEqual(saved["source_monitoring"]["run_starts"], 1)
        self.assertEqual(saved["account_http_starts"], 1)
        self.assertEqual(saved["serpapi_search_http_starts"], 0)

    def test_expiry_between_account_and_search_prevents_search_start(self):
        clock = [datetime.now(timezone.utc)]
        def expires_after_account(request, timeout):
            response = self.fetch(request, timeout)
            clock[0] += timedelta(hours=2)
            return response
        with patch("london_office.monitoring._now", side_effect=lambda: clock[0]), \
                patch("london_office.discovery._open", side_effect=expires_after_account):
            result = self.monitor.run(self.plan)
        self.assertEqual(result["status"], "not_checked")
        self.assertEqual(result["error"]["code"], "monitoring_authorization_expired")
        self.assertEqual(self.calls, ["/account.json"])
        self.assertEqual(json.loads(self.receipt.read_text(encoding="utf-8"))["serpapi_search_http_starts"], 0)
        self.assertFalse(result["formal_market_updated"])

    def test_interrupted_completion_is_not_no_update_and_keeps_previous_valid_metadata(self):
        from london_office.monitoring import _save
        first = self.monitor.run(self.plan)
        def cannot_finish(path, value):
            if path.name == "result.json":
                raise OSError("synthetic interrupted completion")
            _save(path, value)
        with patch("london_office.monitoring._save", side_effect=cannot_finish):
            with self.assertRaises(OSError):
                self.monitor.run(self.plan)
        interrupted = SourceMonitor(self.pool).view()["runs"][-1]
        self.assertEqual(interrupted["status"], "check_incomplete")
        self.assertEqual(interrupted["last_valid_source_run_id"], first["source_run_id"])
        self.assertIsNone(interrupted["checked_at"])
        self.assertEqual(self.pool.view()["source_count"], 1)
        self.assertFalse(interrupted["formal_market_updated"])
