"""SDK fixture at the existing execution seam, not a live subscription/search test."""
import base64
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
from unittest.mock import Mock, patch
import unittest
from london_office.discovery import DiscoveryBudget
from london_office.runtime import AgentError, CodexAdapter, _Session
from london_office.research_intake import ResearchIntake
from london_office.market import Market
from london_office.settings import Settings


def stage_fixture(intake):
    text = "City office rent for 2026-Q3: Prime achieved rent is 110 GBP/sq ft."
    return intake.create_batch([{"id":"fixture-doc", "filename":"fixture.txt", "content_base64":base64.b64encode(text.encode()).decode(),
        "url":"https://example.test/synthetic", "publisher":"Synthetic fixture publisher", "title":"Synthetic only",
        "published_at":None, "usage_note":"SDK seam regression fixture, not market evidence"}],
        [{"id":"fixture-fact", "document_id":"fixture-doc", "topic_ids":["rents"], "kind":"reported_statistic", "metric":"prime_rent",
          "label":"Synthetic uploaded rent", "value":110, "unit":"GBP/sq ft", "source_geography":"City", "statistical_window":"2026-Q3",
          "definition":"Prime achieved rent", "denominator":None, "billing_period":None, "release_vintage":None,
          "quote":text, "context_quote":"", "section":"Synthetic line 1", "value_anchor":"110 GBP/sq ft"}])["batches"][0]


class RuntimeConsentTests(unittest.TestCase):
    def test_expiry_between_reservation_and_sdk_execution_blocks_the_turn(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            budget = root/"receipt.json"
            budget.write_text(json.dumps({"authorization":"Synthetic consent", "expires_at":(datetime.now(timezone.utc)+timedelta(minutes=5)).isoformat(),
                "codex_turn_start_cap":1,"codex_turn_starts":0,
                "codex_native_discovery_turn_start_cap":1,"codex_native_discovery_turn_starts":0,
                "serpapi_search_http_start_cap":1,"serpapi_search_http_starts":0,"jobs":{}}))
            adapter = CodexAdapter(Settings(discovery_budget_file=budget, discovery_dir=root/"pool", run_dir=root/"runs"))
            session = _Session("synthetic-session", SimpleNamespace(close=Mock()), SimpleNamespace(turn=Mock()), root/"trace.jsonl")
            def setup(**kwargs):
                DiscoveryBudget(budget).change(lambda data:data.update(expires_at=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat()))
                return session
            with patch.object(adapter, "_new_session", side_effect=setup):
                with self.assertRaises(AgentError) as failure:
                    adapter.discover("Synthetic source request", topic_ids=["rents"])
                self.assertEqual(failure.exception.code, "discovery_authorization_expired")
            session.thread.turn.assert_not_called()
            session.codex.close.assert_called_once()
            self.assertEqual(DiscoveryBudget(budget).inspect()["codex_turn_starts"],1)
            self.assertEqual(adapter._discoveries,{})

    def test_web_discovery_binds_its_grant_and_does_not_require_a_process_restart(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            adapter = CodexAdapter(Settings(discovery_dir=root/"pool", research_dir=root/"research", run_dir=root/"runs"))
            grant = adapter.authorization.authorize(google_cap=1, model_turn_cap=1, valid_for_minutes=30, request_id="synthetic-user-action")
            receipt = DiscoveryBudget(adapter.authorization.resolve(grant["authorization_id"]))
            with patch.object(adapter, "_new_session", side_effect=AgentError("fixture_stop", "Synthetic SDK boundary; no external calls.")) as sdk:
                with self.assertRaises(AgentError) as failure:
                    adapter.discover("Synthetic unbound request", topic_ids=["rents"])
                self.assertEqual(failure.exception.code, "discovery_authorization_required")
                sdk.assert_not_called()
                self.assertEqual(receipt.inspect()["codex_turn_starts"], 0)
                adapter._turns = adapter.settings.max_turns
                with self.assertRaises(AgentError) as failure:
                    adapter.discover("Synthetic explicitly bound request", topic_ids=["rents"], authorization_id=grant["authorization_id"])
                self.assertEqual(failure.exception.code, "fixture_stop")
                self.assertEqual(receipt.inspect()["codex_turn_starts"], 1)
                self.assertEqual(adapter._turns, adapter.settings.max_turns)
                sdk.assert_called_once()

    def test_pending_content_does_not_retire_a_session_but_admission_does(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            adapter = CodexAdapter(Settings(research_dir=root/"research", run_dir=root/"runs"))
            session = _Session("synthetic-session", SimpleNamespace(close=Mock()), SimpleNamespace(turn=Mock()), root/"trace.jsonl",
                research_revision=adapter._research_revision())
            intake = ResearchIntake(root/"research")
            batch = stage_fixture(intake)
            self.assertEqual(session.research_revision, adapter._research_revision())
            intake.authorize_batch(batch["id"], batch["content_revision"])
            adapter._sessions[session.id] = session
            with self.assertRaises(AgentError) as failure:
                adapter.ask("Synthetic explicit continuation", session_id=session.id)
            self.assertEqual(failure.exception.code, "research_changed")
            session.thread.turn.assert_not_called()
            session.codex.close.assert_called_once()
            self.assertEqual(adapter._turns, 0)
            self.assertEqual(adapter._sessions, {})

    def test_admission_during_an_sdk_fixture_turn_rejects_the_mixed_revision_answer(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            adapter = CodexAdapter(Settings(research_dir=root/"research", run_dir=root/"runs"))
            intake = ResearchIntake(root/"research")
            batch = stage_fixture(intake)
            trace = root/"trace.jsonl"
            arguments = {"area":"city", "metric":"prime_rent", "period":"2025-YE"}
            output = Market(research_dir=root/"research").query(**arguments)
            payload = {"answer":"Historical source evidence only.", "fact_ids":["city-prime-2025"], "calculation_ids":[],
                "source_ids":["savills-2025-q4"], "warnings":[]}
            def sdk_turn(*args, **kwargs):
                trace.write_text(json.dumps({"name":"market_query", "arguments":arguments, "ok":True, "output":output})+"\n")
                intake.authorize_batch(batch["id"], batch["content_revision"])
                result = SimpleNamespace(status=SimpleNamespace(value="completed"), final_response=json.dumps(payload), usage=None)
                return SimpleNamespace(run=lambda: result)
            session = _Session("synthetic-session", SimpleNamespace(close=Mock()), SimpleNamespace(turn=Mock(side_effect=sdk_turn)), trace,
                research_revision=adapter._research_revision())
            adapter._sessions[session.id] = session
            with self.assertRaises(AgentError) as failure:
                adapter.ask("Synthetic explicit question", session_id=session.id)
            self.assertEqual(failure.exception.code, "research_changed")
            session.thread.turn.assert_called_once()
            self.assertFalse((root/"runs"/"turns.jsonl").exists())
            adapter.close()


if __name__ == "__main__": unittest.main()
