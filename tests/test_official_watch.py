"""Synthetic official HTML and fresh temporary authorization; never live reads."""
import io
import json
import os
import subprocess
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from london_office.official_watch import OfficialWatch


SAVILLS = "https://www.savills.co.uk/insight-and-opinion/research.aspx?rc=United%20Kingdom&p=Offices&t=&f=date&q=Central%20London%20Office%20Market%20Watch&page=1"
ARTICLE = "https://www.savills.co.uk/research_articles/229130/394968-0"
CROWN = "https://www.thecrownestate.co.uk/news"
CROWN_LINK = "https://www.thecrownestate.co.uk/news/Embassy-of-Ireland-takes-four-floors-in-landmark-office-building"


class Response(io.BytesIO):
    status = 200
    headers = {"Content-Type": "text/html; charset=utf-8"}

    def __init__(self, body, url):
        super().__init__(body.encode("utf-8") if isinstance(body, str) else body)
        self.url = url

    def geturl(self):
        return self.url


class OfficialWatchTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.budget = self.root / "test-only-ledger.json"
        self.budget.write_text(json.dumps({
            "authorization": "SYNTHETIC TEST ONLY; not real permission",
            "request_start_cap": 10, "request_starts": 0, "urls": [],
            "expires_at": (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat(),
            "allow_explicit_repeat_reads": True,
        }), encoding="utf-8")
        self.watch = OfficialWatch(self.root / "archive", self.budget)
        self.plan = {"schema_version": 1, "watch_ids": ["savills-central-london"]}
        self.html = f'<html><h1>Research</h1><a href="{ARTICLE}">Central London Office Market Watch – September 2026</a></html>'
        self.calls = []

    def fetch(self, request, timeout):
        self.calls.append((request.full_url, timeout))
        return Response(self.html, request.full_url)

    def test_first_successful_direct_official_read_establishes_baseline_without_new_publication(self):
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            result = self.watch.run(self.plan)
        self.assertEqual(result["status"], "baseline_captured")
        self.assertEqual(result["data_kind"], "official_source_monitor_run")
        self.assertFalse(result["formal_market_updated"])
        self.assertEqual(result["new_publication_links"], [])
        self.assertEqual(result["sources"][0]["publication_links"][0]["url"], ARTICLE)
        self.assertEqual(result["sources"][0]["publication_links"][0]["edition"], "2026-09")
        self.assertIsNone(result["sources"][0]["publication_links"][0]["published_at"])
        self.assertEqual(self.calls, [(SAVILLS, 20)])
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8"))["request_starts"], 1)
        self.assertEqual(self.watch.view()["runs"], [result])
        started = json.loads((self.watch.directory / "runs" / result["id"] / "started.json").read_text(encoding="utf-8"))
        self.assertEqual(started["status"], "check_incomplete")
        self.assertIsNone(started["completed_at"])
        self.assertEqual(json.loads((self.watch.directory / "runs" / result["id"] / "result.json").read_text(encoding="utf-8")), result)

    def test_actual_anchor_text_or_image_alt_binds_only_its_own_official_href(self):
        savills = f'''<h2>September 2026</h2>
            <a href="/research_articles/229130/395216-0">Market in Minutes</a>
            <img alt="Central London Office Market Watch – October 2026">
            <a href="{ARTICLE}"><img alt="Central London Office Market Watch – September 2026"></a>
            <a href="https://evil.test/research_articles/229130/5-0">Central London Office Market Watch – November 2026</a>'''
        crown = f'''<h1>News</h1><a href="/news/Embassy-of-Ireland-takes-four-floors-in-landmark-office-building">Embassy leases floors</a>
            <a href="https://evil.test/news/spurious">False news</a>
            <a href="/insights/archive">Not news</a>'''
        def fetch(request, timeout):
            self.calls.append((request.full_url, timeout))
            return Response(crown if request.full_url == CROWN else savills, request.full_url)
        with patch("london_office.official_watch._open", side_effect=fetch):
            result = self.watch.run({"schema_version": 1, "watch_ids": ["savills-central-london", "crown-estate-news"]})
        self.assertEqual(result["status"], "baseline_captured")
        by_id = {source["watch_id"]: source for source in result["sources"]}
        self.assertEqual([item["url"] for item in by_id["savills-central-london"]["publication_links"]], [ARTICLE])
        self.assertEqual(by_id["savills-central-london"]["publication_links"][0]["edition"], "2026-09")
        self.assertEqual([item["url"] for item in by_id["crown-estate-news"]["publication_links"]], [CROWN_LINK])
        self.assertIsNone(by_id["crown-estate-news"]["publication_links"][0]["edition"])
        self.assertEqual(result["new_publication_links"], [])
        self.assertNotIn("market_events", result)
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8"))["urls"], [CROWN, SAVILLS])

    def test_new_link_then_reordered_repeated_or_body_hash_only_is_not_a_revision(self):
        october = "https://www.savills.co.uk/research_articles/229130/395001-0"
        september_anchor = f'<a href="{ARTICLE}">Central London Office Market Watch – September 2026</a>'
        october_anchor = f'<a href="{october}">Central London Office Market Watch – October 2026</a>'
        bodies = [
            f'<h1>Research</h1>{september_anchor}',
            f'<h1>Research</h1>{october_anchor}{september_anchor}<p>PRIVATE_FULL_BODY_DO_NOT_ARCHIVE</p>',
            f'<h1>Research</h1>{september_anchor}{october_anchor}<p>layout changed</p>',
            f'<h1>Research</h1>{september_anchor}<p>another body hash</p>',
            f'<h1>Research</h1>{october_anchor}{september_anchor}',
        ]
        with patch("london_office.official_watch._open", side_effect=lambda request, timeout: Response(bodies.pop(0), request.full_url)):
            first = self.watch.run(self.plan)
            first_path = self.watch.directory / "runs" / first["id"] / "result.json"
            first_bytes = first_path.read_bytes()
            added = self.watch.run(self.plan)
            repeated = [self.watch.run(self.plan) for _ in range(3)]
        self.assertEqual(added["status"], "new_publication_links")
        self.assertEqual([item["url"] for item in added["new_publication_links"]], [october])
        self.assertEqual([run["status"] for run in repeated], ["no_new_publication_links"] * 3)
        self.assertTrue(all(not run["new_publication_links"] for run in repeated))
        self.assertNotEqual(first["sources"][0]["body_sha256"], added["sources"][0]["body_sha256"])
        self.assertNotEqual(added["sources"][0]["body_sha256"], repeated[0]["sources"][0]["body_sha256"])
        self.assertEqual(first_path.read_bytes(), first_bytes)
        self.assertNotIn("PRIVATE_FULL_BODY_DO_NOT_ARCHIVE", "".join(p.read_text(encoding="utf-8") for p in self.watch.directory.rglob("*.json")))
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8"))["request_starts"], 5)

    def test_http200_without_bound_official_links_is_parse_unconfirmed_and_keeps_prior_state(self):
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            first = self.watch.run(self.plan)
        self.html = '<html><h1>Research</h1><script>JS loads cards later</script><p>September 2026</p></html>'
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            failed = self.watch.run(self.plan)
        self.assertEqual(failed["status"], "check_failed")
        self.assertEqual(failed["sources"][0]["error"]["code"], "parse_unconfirmed")
        self.assertEqual(failed["sources"][0]["last_valid_run_id"], first["id"])
        self.assertIsNone(failed["checked_at"])
        self.assertTrue(failed["sources"][0]["body_sha256"])
        self.assertEqual(failed["sources"][0]["headings"], ["Research"])
        self.assertEqual(failed["new_publication_links"], [])
        self.assertEqual(self.watch.view()["runs"][0], first)

    def test_expiry_after_first_source_blocks_next_request_without_losing_partial_result(self):
        crown_html = f'<h1>News</h1><a href="{CROWN_LINK}">Office leasing announcement</a>'
        def expire_after_fetch(request, timeout):
            self.calls.append((request.full_url, timeout))
            ledger = json.loads(self.budget.read_text(encoding="utf-8"))
            ledger["expires_at"] = (datetime.now(timezone.utc) - timedelta(seconds=1)).isoformat()
            self.budget.write_text(json.dumps(ledger), encoding="utf-8")
            return Response(crown_html, request.full_url)
        with patch("london_office.official_watch._open", side_effect=expire_after_fetch):
            result = self.watch.run({"schema_version": 1, "watch_ids": ["savills-central-london", "crown-estate-news"]})
        self.assertEqual(result["status"], "check_incomplete")
        self.assertEqual([(s["watch_id"], s["status"]) for s in result["sources"]],
            [("crown-estate-news", "baseline_captured"), ("savills-central-london", "not_checked")])
        self.assertEqual(result["sources"][1]["error"]["code"], "official_budget_expired")
        self.assertEqual(self.calls, [(CROWN, 20)])
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8"))["urls"], [CROWN])
        self.assertIsNotNone(result["checked_at"])

    def test_budget_cap_and_invalid_plan_stop_before_http_and_never_reset_ledger(self):
        with self.assertRaises(ValueError):
            self.watch.run({"schema_version": True, "watch_ids": ["savills-central-london"]})
        with self.assertRaises(ValueError):
            self.watch.preview({"schema_version": 1, "watch_ids": ["savills-central-london", "unknown"]})
        self.assertFalse(self.watch.directory.exists())
        receipt = json.loads(self.budget.read_text(encoding="utf-8"))
        receipt["request_start_cap"] = 0
        self.budget.write_text(json.dumps(receipt), encoding="utf-8")
        with patch("london_office.official_watch._open") as provider:
            blocked = self.watch.run(self.plan)
        self.assertEqual(blocked["status"], "not_checked")
        self.assertEqual(blocked["sources"][0]["error"]["code"], "official_budget_exhausted")
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8")), receipt)
        provider.assert_not_called()

    def test_unreadable_ledger_is_not_a_new_authority_or_http_start(self):
        self.budget.write_text("{broken receipt", encoding="utf-8")
        before = self.budget.read_bytes()
        with patch("london_office.official_watch._open") as provider:
            result = self.watch.run(self.plan)
        self.assertEqual(result["status"], "not_checked")
        self.assertEqual(result["sources"][0]["error"]["code"], "invalid_official_budget")
        self.assertIsNone(result["sources"][0]["request_started_at"])
        self.assertEqual(self.budget.read_bytes(), before)
        provider.assert_not_called()

    def test_response_size_and_transport_failure_keep_previous_valid_state_without_retry(self):
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            baseline = self.watch.run(self.plan)
        oversized = Response(b"Z" * (5 * 1024 * 1024 + 1), SAVILLS)
        with patch("london_office.official_watch._open", return_value=oversized) as provider:
            too_large = self.watch.run(self.plan)
        self.assertEqual(too_large["status"], "check_failed")
        self.assertEqual(too_large["sources"][0]["error"]["code"], "official_response_too_large")
        self.assertEqual(too_large["sources"][0]["last_valid_run_id"], baseline["id"])
        self.assertIsNone(too_large["sources"][0]["body_sha256"])
        provider.assert_called_once()
        with patch("london_office.official_watch._open", side_effect=TimeoutError("fixture timeout")) as provider:
            failed = self.watch.run(self.plan)
        self.assertEqual(failed["status"], "check_failed")
        self.assertEqual(failed["sources"][0]["last_valid_run_id"], baseline["id"])
        provider.assert_called_once()
        self.assertEqual(json.loads(self.budget.read_text(encoding="utf-8"))["request_starts"], 3)
        self.assertEqual(len(self.watch.view()["runs"]), 3)
        self.assertTrue(all("ZZZZZ" not in p.read_text(encoding="utf-8") for p in self.watch.directory.rglob("*.json")))

    def test_cli_preview_and_status_are_read_only_without_budget_or_network(self):
        plan_file = self.root / "plan.json"
        plan_file.write_text(json.dumps(self.plan), encoding="utf-8")
        missing_dir = self.root / "nonexistent-archive"
        before = self.budget.read_bytes()
        def cli(*arguments):
            return subprocess.run([sys.executable, "-m", "london_office.official_watch", *arguments],
                cwd=self.root, env={**os.environ, "SERPAPI_API_KEY": ""}, capture_output=True,
                text=True, encoding="utf-8", timeout=10)
        preview = cli("--plan", str(plan_file), "--preview", "--directory", str(missing_dir))
        self.assertEqual(preview.returncode, 0, preview.stderr)
        self.assertEqual(json.loads(preview.stdout)["sources"][0]["url"], SAVILLS)
        status = cli("--status", "--directory", str(missing_dir))
        self.assertEqual(status.returncode, 0, status.stderr)
        self.assertEqual(json.loads(status.stdout)["runs"], [])
        self.assertFalse(missing_dir.exists())
        self.assertEqual(self.budget.read_bytes(), before)

    def test_two_successful_sources_do_not_become_incomplete_when_only_one_has_a_new_link(self):
        first_crown = f'<h1>News</h1><a href="{CROWN_LINK}">Office announcement</a>'
        next_crown = first_crown + '<a href="/news/new-lead">New publication lead</a>'
        bodies = {CROWN: [first_crown, next_crown], SAVILLS: [self.html, self.html]}
        def fetch(request, timeout):
            return Response(bodies[request.full_url].pop(0), request.full_url)
        plan = {"schema_version": 1, "watch_ids": ["crown-estate-news", "savills-central-london"]}
        with patch("london_office.official_watch._open", side_effect=fetch):
            baseline = self.watch.run(plan)
            second = self.watch.run(plan)
        self.assertEqual(baseline["status"], "baseline_captured")
        self.assertEqual(second["status"], "new_publication_links")
        self.assertEqual([s["status"] for s in second["sources"]], ["new_publication_links", "no_new_publication_links"])
        self.assertEqual(second["new_publication_links"][0]["url"], CROWN + "/new-lead")
        self.assertFalse(second["formal_market_updated"])

    def test_redirect_status_or_changed_final_host_is_not_followed_or_accepted(self):
        redirect = Response(self.html, SAVILLS)
        redirect.status = 302
        with patch("london_office.official_watch._open", return_value=redirect) as provider:
            rejected = self.watch.run(self.plan)
        self.assertEqual(rejected["status"], "check_failed")
        self.assertEqual(rejected["sources"][0]["http_status"], 302)
        self.assertTrue(rejected["sources"][0]["request_started_at"])
        self.assertEqual(rejected["sources"][0]["error"]["code"], "official_http_error")
        provider.assert_called_once()
        wrong_host = Response(self.html, "https://evil.test/article")
        with patch("london_office.official_watch._open", return_value=wrong_host) as provider:
            rejected = self.watch.run(self.plan)
        self.assertEqual(rejected["status"], "check_failed")
        self.assertIsNone(rejected["sources"][0]["body_sha256"])
        provider.assert_called_once()

    def test_edition_hint_is_not_observation_month_or_publication_date(self):
        another = "https://www.savills.co.uk/research_articles/229130/395003-0"
        self.html = f'''<h2>Published December 2026</h2>
            <a href="{ARTICLE}">Central London Office Market Watch – September 2026 (August 2026 statistics, published October 2026)</a>
            <a href="{another}">Central London Office Market Watch: market outlook; updated October 2026</a>'''
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            result = self.watch.run(self.plan)
        self.assertEqual(result["status"], "baseline_captured")
        links = {item["url"]: item for item in result["sources"][0]["publication_links"]}
        self.assertEqual(links[ARTICLE]["edition"], "2026-09")
        self.assertIsNone(links[another]["edition"])
        self.assertTrue(all(item["published_at"] is None and item["observation_period"] is None for item in links.values()))

    def test_valid_index_over_100_unique_links_stays_within_body_bound_without_truncation(self):
        # Synthetic small index reproduces the real Crown page's observed cardinality:
        # 188 distinct links were rejected by an unrelated 100-link guard.
        html = '<h1>News</h1>' + ''.join(
            f'<a href="/news/synthetic-announcement-{number}">Synthetic announcement {number}</a>'
            for number in range(188))
        with patch("london_office.official_watch._open", return_value=Response(html, CROWN)):
            result = self.watch.run({"schema_version": 1, "watch_ids": ["crown-estate-news"]})
        self.assertEqual(result["status"], "baseline_captured")
        self.assertEqual(len(result["sources"][0]["publication_links"]), 188)
        self.assertLess(result["sources"][0]["body_bytes"], 5 * 1024 * 1024)
        self.assertEqual(result["new_publication_links"], [])

    def test_crown_index_without_news_article_links_fails_closed_not_no_new(self):
        plan = {"schema_version": 1, "watch_ids": ["crown-estate-news"]}
        with patch("london_office.official_watch._open", return_value=Response('<h1>News</h1><a href="/news">News home</a>', CROWN)):
            result = self.watch.run(plan)
        self.assertEqual(result["status"], "check_failed")
        self.assertEqual(result["sources"][0]["error"]["code"], "parse_unconfirmed")
        self.assertEqual(result["new_publication_links"], [])
        self.assertFalse(result["formal_market_updated"])

    def test_distinct_official_url_is_a_new_link_even_when_edition_hint_repeats(self):
        another = "https://www.savills.co.uk/research_articles/229130/395003-0"
        with patch("london_office.official_watch._open", side_effect=self.fetch):
            self.watch.run(self.plan)
            self.html += f'<a href="{another}">Central London Office Market Watch – September 2026</a>'
            result = self.watch.run(self.plan)
        self.assertEqual(result["status"], "new_publication_links")
        self.assertEqual(result["new_publication_links"][0]["url"], another)
        self.assertFalse(result["formal_market_updated"])
