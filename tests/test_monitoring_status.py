"""Read-only monitoring DTO tests; synthetic archives, no native or network work."""
import asyncio
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from london_office.data import ROOT
from london_office.monitoring_status import monitoring_status


SAVILLS = "https://www.savills.co.uk/research_articles/229130/394968-0"
CROWN = "https://www.thecrownestate.co.uk/news/West-End-office-vacancy"
JOB = "https://www.thecrownestate.co.uk/news/London-office-careers"
OTHER = "https://www.thecrownestate.co.uk/news/coastal-estate"


class MonitoringStatusTests(unittest.TestCase):
    def setUp(self):
        platform = patch("london_office.monitoring_status.sys", SimpleNamespace(platform="darwin"))
        platform.start()
        self.addCleanup(platform.stop)
        (ROOT / "var/monitoring").mkdir(parents=True, exist_ok=True)
        temp = tempfile.TemporaryDirectory(prefix="monitoring-ui-fixture-", dir=ROOT / "var/monitoring")
        self.addCleanup(temp.cleanup)
        self.directory = Path(temp.name)
        self.config = self.directory / "schedule.json"
        self.config.write_text(json.dumps({"schema_version": 1, "interval_seconds": 60, "max_runs": 2,
            "expires_at": "2099-01-01T00:00:00+00:00", "plan": str(self.directory / "plan.json"),
            "budget_file": str(self.directory / "synthetic-not-read.json"),
            "run_dir": str(self.directory / "runtime")}), encoding="utf-8")
        self.ui = self.directory / "ui-config.json"

    def configure(self, config=None):
        self.ui.write_text(json.dumps({"schema_version": 1, "schedule_config": str(config or self.config)}), encoding="utf-8")

    def test_no_configuration_does_not_touch_native_or_watch(self):
        with patch("london_office.monitoring_status.Schedule.status", side_effect=AssertionError("native")), \
             patch("london_office.monitoring_status.OfficialWatch.view", side_effect=AssertionError("watch")):
            dto = monitoring_status(self.directory)
        self.assertEqual(dto, {"schema_version": 1, "data_kind": "monitoring_status", "status": "not_configured",
            "last_checked_at": None, "schedule": {"state": "not_configured", "interval_seconds": None,
                "max_runs": None, "run_starts": None, "remaining_runs": None, "expires_at": None},
            "filter": {"mode": "official_office_keywords", "ai_used": False, "omitted_links": 0},
            "sources": [], "formal_market_updated": False, "warnings": []})

    def test_latest_failure_keeps_last_valid_links_and_time_but_exposes_failure(self):
        self.configure()
        savills = {"url": SAVILLS, "title": "Central London Office Market Watch – September 2026",
                   "edition": "2026-09", "published_at": None, "observation_period": None}
        crown = [{"url": url, "title": title, "edition": None, "published_at": None, "observation_period": None}
                 for url, title in ((CROWN, "West End office vacancy"), (JOB, "London office careers"),
                                    (OTHER, "Coastal estate"), ("https://evil.test/news/West-End-office", "West End office"))]
        first = {"id": "a", "started_at": "2026-10-11T22:00:00+00:00", "checked_at": "2026-10-11T22:01:00+00:00",
                 "watch_ids": ["savills-central-london", "crown-estate-news"], "sources": [
                     {"watch_id": "savills-central-london", "status": "baseline_captured", "checked_at": "2026-10-11T22:01:00+00:00",
                      "publication_links": [savills], "new_publication_links": []},
                     {"watch_id": "crown-estate-news", "status": "new_publication_links", "checked_at": "2026-10-11T22:00:30+00:00",
                      "publication_links": crown, "new_publication_links": [crown[0], crown[1]]}]}
        failed = {"id": "b", "started_at": "2026-10-11T23:00:00+00:00", "checked_at": None,
                  "watch_ids": ["savills-central-london", "crown-estate-news"], "sources": [
                      {"watch_id": key, "status": "check_failed", "checked_at": None, "publication_links": [],
                       "new_publication_links": [], "error": {"code": "parse_unconfirmed", "message": "No links bound"}}
                      for key in ("savills-central-london", "crown-estate-news")]}
        native = {"status": "not_installed", "native_loaded": False, "interval_seconds": 60, "max_runs": 2,
                  "run_starts": 2, "remaining_runs": 0, "expires_at": "2099-01-01T00:00:00+00:00", "expired": False,
                  "native_print": "PRIVATE NATIVE OUTPUT", "runs": []}
        with patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": [first, failed]}), \
             patch("london_office.monitoring_status.Schedule.status", return_value=native) as status:
            dto = monitoring_status(self.directory)
        self.assertEqual(status.call_count, 1)
        self.assertEqual(dto["status"], "available")
        self.assertEqual(dto["schedule"]["state"], "stopped")
        self.assertEqual(dto["last_checked_at"], first["checked_at"])
        by_id = {source["id"]: source for source in dto["sources"]}
        self.assertEqual(set(by_id), {"savills-central-london", "crown-estate-news"})
        self.assertEqual(by_id["crown-estate-news"]["status"], "check_failed")
        self.assertEqual(by_id["crown-estate-news"]["checked_at"], "2026-10-11T22:00:30+00:00")
        self.assertEqual(by_id["crown-estate-news"]["new_link_count"], 1)
        self.assertEqual(by_id["crown-estate-news"]["links"], [{**crown[0], "is_new": True}])
        self.assertEqual(by_id["savills-central-london"]["links"], [{**savills, "is_new": False}])
        self.assertEqual(dto["filter"]["omitted_links"], 3)
        self.assertTrue(dto["warnings"])
        self.assertNotIn(str(self.directory), json.dumps(dto))
        self.assertNotIn("PRIVATE NATIVE OUTPUT", json.dumps(dto))
        self.assertFalse(dto["formal_market_updated"])

    def test_started_only_attempt_is_not_masked_by_older_success(self):
        self.configure()
        link = {"url": SAVILLS, "title": "Central London Office Market Watch – September 2026",
                "edition": "2026-09", "published_at": None, "observation_period": None}
        archived = [{"watch_ids": ["savills-central-london"], "sources": [
            {"watch_id": "savills-central-london", "status": "baseline_captured", "checked_at": "2026-10-11T22:01:00Z",
             "publication_links": [link], "new_publication_links": []}]},
            {"watch_ids": ["savills-central-london"], "sources": [], "status": "check_incomplete"}]
        with patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": archived}), \
             patch("london_office.monitoring_status.Schedule.status", return_value={
                 "status": "not_installed", "native_loaded": False, "interval_seconds": 60,
                 "max_runs": 2, "run_starts": 1, "remaining_runs": 1, "expired": False,
                 "expires_at": "2099-01-01T00:00:00+00:00"}):
            dto = monitoring_status(self.directory)
        self.assertEqual(dto["schedule"]["state"], "stopped")
        self.assertEqual(dto["sources"][0]["status"], "check_incomplete")
        self.assertEqual(dto["sources"][0]["checked_at"], "2026-10-11T22:01:00Z")
        self.assertEqual(dto["sources"][0]["links"][0]["url"], SAVILLS)
        self.assertTrue(dto["warnings"])

    def test_native_state_only_running_if_loaded_and_within_limits(self):
        self.configure()
        with patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": []}), \
             patch("london_office.monitoring_status.Schedule.status", return_value={
                 "status": "installed", "native_loaded": True, "interval_seconds": 60, "max_runs": 2,
                 "run_starts": 0, "remaining_runs": 2, "expired": False, "expires_at": "2099-01-01T00:00:00+00:00"}):
            self.assertEqual(monitoring_status(self.directory)["schedule"]["state"], "running")
        with patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": []}), \
             patch("london_office.monitoring_status.Schedule.status", return_value={
                 "status": "installed", "native_loaded": True, "interval_seconds": 60, "max_runs": 2,
                 "run_starts": 1, "remaining_runs": 1, "expired": True, "expires_at": "2020-01-01T00:00:00+00:00"}):
            self.assertEqual(monitoring_status(self.directory)["schedule"]["state"], "expired")

    def test_exhausted_loaded_job_and_unsupported_platform_remain_distinct(self):
        self.configure()
        with patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": []}), \
             patch("london_office.monitoring_status.Schedule.status", return_value={
                 "status": "installed", "native_loaded": True, "interval_seconds": 60, "max_runs": 2,
                 "run_starts": 2, "remaining_runs": 0, "expired": False,
                 "expires_at": "2099-01-01T00:00:00+00:00"}):
            self.assertEqual(monitoring_status(self.directory)["schedule"]["state"], "exhausted")
        with patch("london_office.monitoring_status.sys", SimpleNamespace(platform="win32")), \
             patch("london_office.monitoring_status.OfficialWatch.view", return_value={"runs": []}), \
             patch("london_office.monitoring_status.Schedule.status", side_effect=AssertionError("native on Windows")):
            dto = monitoring_status(self.directory)
        self.assertEqual(dto["schedule"]["state"], "unsupported")
        self.assertEqual(dto["status"], "available")
        self.assertEqual(dto["schedule"]["max_runs"], 2)

    def test_invalid_config_or_archive_reports_unavailable_not_empty_success(self):
        self.ui.write_text('{"schema_version":2}', encoding="utf-8")
        with patch("london_office.monitoring_status.Schedule.status", side_effect=AssertionError("native")):
            dto = monitoring_status(self.directory)
        self.assertEqual(dto["status"], "unavailable")
        self.assertTrue(dto["warnings"])
        self.configure()
        with patch("london_office.monitoring_status.OfficialWatch.view", side_effect=ValueError("private/archive/path")), \
             patch("london_office.monitoring_status.Schedule.status", return_value={"status": "not_installed", "native_loaded": False,
                 "interval_seconds": 60, "max_runs": 2, "run_starts": 0, "remaining_runs": 2,
                 "expires_at": "2099-01-01T00:00:00+00:00", "expired": False}):
            dto = monitoring_status(self.directory)
        self.assertEqual(dto["status"], "unavailable")
        self.assertTrue(dto["warnings"])
        self.assertNotIn("private/archive/path", json.dumps(dto))

    def test_http_get_uses_same_public_dto_and_no_query_inputs(self):
        # ASGI directly, avoiding a server process or optional HTTP test dependency.
        from london_office.app import create_app
        from london_office.settings import Settings
        with patch("london_office.app.ROOT", self.directory), \
             patch("london_office.app.monitoring_status", return_value={"schema_version": 1,
                 "data_kind": "monitoring_status", "status": "not_configured"}) as getter:
            app = create_app(Settings.from_env())
            messages = []
            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}
            async def send(message):
                messages.append(message)
            asyncio.run(app({"type": "http", "asgi": {"version": "3.0"}, "method": "GET",
                "path": "/api/monitoring", "raw_path": b"/api/monitoring", "root_path": "", "query_string": b"",
                "scheme": "http", "server": ("127.0.0.1", 8017), "client": ("127.0.0.1", 1234),
                "headers": [(b"host", b"127.0.0.1")]}, receive, send))
        self.assertEqual(messages[0]["status"], 200)
        self.assertEqual(json.loads(messages[-1]["body"])["data_kind"], "monitoring_status")
        getter.assert_called_once_with(self.directory / "var/monitoring")


if __name__ == "__main__":
    unittest.main()
