"""Offline ResearchIntake Interface checks; all uploads and snapshots are synthetic fixtures."""
import base64
import json
import hashlib
import tempfile
import unittest
from pathlib import Path

from london_office.data import ROOT, Snapshot
from london_office.research_intake import ResearchIntake, ResearchIntakeError


URL = "https://example.test/office-market-2025"
TEXT = "City office vacancy rate for 2025 year-end was 7.5% of all office stock."
QUOTE = TEXT


def document(text=TEXT, **overrides):
    return {"id": "doc-one", "filename": "user-office-report.txt",
            "content_base64": base64.b64encode(text.encode()).decode(), "url": URL,
            "publisher": "Example publisher (synthetic)", "title": "Synthetic office report",
            "published_at": "2026-01-20", "usage_note": "Synthetic fixture, not actual market research",
            **overrides}


def candidate(**overrides):
    return {"id": "fact-one", "document_id": "doc-one", "topic_ids": ["vacancy"],
            "kind": "reported_statistic", "metric": "vacancy_rate", "label": "City office vacancy rate",
            "value": 7.5, "unit": "%", "source_geography": "City",
            "statistical_window": "2025 year-end", "definition": "office vacancy rate",
            "denominator": "all office stock", "billing_period": None, "release_vintage": None,
            "quote": QUOTE, "context_quote": "", "section": "Office vacancy rate",
            "value_anchor": "7.5%", **overrides}


class IntakeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.baseline = self.root / "synthetic-snapshot.json"
        baseline = json.loads((ROOT / "data/snapshot.json").read_text(encoding="utf-8"))
        research = baseline["research"]
        for key in ("records", "sources", "evidence", "comparisons", "exclusions"):
            research[key] = []
        self.baseline.write_text(json.dumps(baseline), encoding="utf-8")
        self.directory = self.root / "intake"
        self.intake = ResearchIntake(self.directory, self.baseline)

    def seed_baseline(self, value=8.2):
        baseline = json.loads(self.baseline.read_text(encoding="utf-8"))
        baseline["research"]["sources"] = [{"id": "synthetic-baseline-source", "publisher": "Synthetic publisher",
            "title": "Synthetic historical study", "url": "https://example.test/historical", "published_at": None,
            "report_period": "2025 year-end", "retrieved_at": "2026-02-01T00:00:00Z",
            "verification_status": "archived_source_evidence_not_live", "usage_note": "Synthetic only"}]
        baseline["research"]["evidence"] = [{"id": "synthetic-baseline-evidence", "source_id": "synthetic-baseline-source",
            "section": "Historical vacancy", "quote": f"City office vacancy rate for 2025 year-end was {value}% of all office stock."}]
        baseline["research"]["records"] = [{"id": "synthetic-baseline-record", "topic_ids": ["vacancy"],
            "kind": "reported_statistic", "metric": "vacancy_rate", "label": "Synthetic City vacancy", "value": value,
            "unit": "%", "display_value": f"{value}%", "status": "available", "source_geography": "City",
            "statistical_window": "2025 year-end", "release_vintage": None, "forecast_as_of": None,
            "target_window": None, "definition": "office vacancy rate", "denominator": "all office stock",
            "source_ids": ["synthetic-baseline-source"], "evidence_ids": ["synthetic-baseline-evidence"],
            "caveats": [], "map_binding": None, "reference_observation_ids": [], "billing_period": None}]
        self.baseline.write_text(json.dumps(baseline), encoding="utf-8")

    def test_staging_preserves_real_uploaded_bytes_without_publishing_until_authorized(self):
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        item = batch["candidates"][0]
        self.assertEqual(staged["data_kind"], "research_candidate_batches")
        self.assertEqual(item["assessment"]["status"], "eligible")
        self.assertEqual(item["state"], "unapproved")
        captured = next((self.directory / "documents").iterdir())
        self.assertEqual(captured.read_bytes(), TEXT.encode())
        self.assertEqual(captured.stem, hashlib.sha256(TEXT.encode()).hexdigest())
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])
        self.assertNotIn("content_base64", json.dumps(staged))
        accepted = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(accepted["batches"][0]["candidates"][0]["state"], "accepted")
        state = json.loads((self.directory / "state.json").read_text())
        self.assertEqual(len(state["accepted"]["records"]), 1)
        self.assertEqual(state["accepted"]["records"][0]["value"], 7.5)
        self.assertEqual(state["accepted"]["sources"][0]["verification_status"], "user_supplied_document_excerpt_not_live")
        self.assertEqual(state["accepted"]["evidence"][0]["content_basis"], "user_supplied_document")
        self.assertIn("document_sha256", state["accepted"]["evidence"][0])
        self.assertEqual(ResearchIntake(self.directory, self.baseline).view(), accepted)
        research = Snapshot(self.baseline, research_dir=self.directory).research()
        self.assertEqual(next(row for row in research["records"] if row["id"] == item["id"])["value"], 7.5)

    def test_input_rejects_client_paths_verification_flags_and_oversize_bytes(self):
        unsafe = [([document(filename="../../another-project/report.txt")], [candidate()], "invalid_document"),
                  ([document(online_verified=True)], [candidate()], "invalid_document"),
                  ([document(url="https://example.test:invalid/office")], [candidate()], "invalid_document"),
                  ([document()], [candidate(verified=True)], "invalid_candidate"),
                  ([document(content_base64=base64.b64encode(b"x" * 5_000_001).decode())], [candidate()], "invalid_document")]
        for docs, rows, code in unsafe:
            with self.subTest(code=code, extra=list(docs[0])[-1]):
                with self.assertRaises(ResearchIntakeError) as error:
                    self.intake.create_batch(docs, rows)
                self.assertEqual(error.exception.code, code)
        self.assertFalse((self.directory / "state.json").exists())

    def test_total_original_bytes_are_bounded_before_any_archive_write(self):
        for size, accepted in ((2_500_000, True), (2_500_001, False)):
            with self.subTest(total=2_500_000 + size):
                intake = ResearchIntake(self.root / str(size), self.baseline)
                first = document(TEXT + " " * (2_500_000 - len(TEXT)))
                second = document(TEXT + " " * (size - len(TEXT)), id="doc-two")
                if accepted:
                    self.assertEqual(intake.create_batch([first, second], [candidate()])["batches"][0]["candidates"][0]["assessment"]["status"], "eligible")
                else:
                    with self.assertRaises(ResearchIntakeError) as error:
                        intake.create_batch([first, second], [candidate()])
                    self.assertEqual(error.exception.code, "invalid_input")
                    self.assertFalse(intake.directory.exists())

    def test_http_intake_prime_achieved_gbp_anchor_is_eligible(self):
        text = "City office rent for 2026-Q3: Prime achieved rent is 110 GBP/sq ft."
        staged = self.intake.create_batch([document(text)], [candidate(
            topic_ids=["rents"], metric="prime_rent", label="Prime achieved rent", value=110,
            unit="GBP/sq ft", source_geography="City", statistical_window="2026-Q3",
            definition="Prime achieved rent", denominator=None, billing_period=None,
            quote=text, context_quote="", value_anchor="110 GBP/sq ft")])
        batch = staged["batches"][0]
        self.assertEqual(batch["candidates"][0]["assessment"]["status"], "eligible")

    def test_quoted_prime_rent_currency_unit_and_billing_unknown_are_honest(self):
        text = "City average prime rent for 2025 year-end was £98.60 per sq ft."
        staged = self.intake.create_batch([document(text)], [candidate(
            metric="prime_rent", label="City average prime rent", value=98.6, unit="GBP/sq ft",
            definition="average prime rent", denominator=None, billing_period=None,
            quote=text, value_anchor="£98.60 per sq ft")])
        batch = staged["batches"][0]
        self.assertEqual(batch["candidates"][0]["assessment"]["status"], "eligible")
        self.intake.authorize_batch(batch["id"], batch["content_revision"])
        accepted = json.loads((self.directory / "state.json").read_text())["accepted"]["records"][0]
        self.assertIsNone(accepted["billing_period"])
        self.assertEqual(accepted["unit"], "GBP/sq ft")

    def test_combined_geography_in_one_quote_is_not_auto_misattributed_to_one_area(self):
        text = "City and West End office vacancy rate for 2025 year-end was 7.5% of all office stock."
        staged = self.intake.create_batch([document(text)], [candidate(quote=text)])
        item = staged["batches"][0]["candidates"][0]
        self.assertEqual(item["assessment"]["status"], "needs_confirmation")
        self.assertIn("geography_ambiguous", [r["code"] for r in item["assessment"]["reasons"]])

    def test_geography_substrings_and_qualified_london_are_not_auto_bound(self):
        cases = [("UK office capacity for 2025 year-end: office vacancy rate was 7.5% of all office stock.", "City"),
                 ("Central London office vacancy rate for 2025 year-end was 7.5% of all office stock.", "London")]
        for text, geography in cases:
            with self.subTest(geography=geography):
                staged = self.intake.create_batch([document(text)], [candidate(quote=text, source_geography=geography)])
                self.assertEqual(staged["batches"][0]["candidates"][0]["assessment"]["status"], "needs_confirmation")

    def test_matching_excerpt_cannot_support_a_different_numeric_value(self):
        staged = self.intake.create_batch([document()], [candidate(value=8.2)])
        item = staged["batches"][0]["candidates"][0]
        self.assertEqual(item["assessment"]["status"], "blocked")
        self.assertIn("value_not_supported", [reason["code"] for reason in item["assessment"]["reasons"]])

    def test_forecast_text_cannot_be_disguised_as_reported_actual_scalar(self):
        for wording in ("was forecast to be", "will reach", "is projected at"):
            text = f"City office vacancy rate for 2025 year-end {wording} 7.5% of all office stock."
            with self.subTest(wording=wording):
                staged = self.intake.create_batch([document(text)], [candidate(quote=text)])
                self.assertEqual(staged["batches"][0]["candidates"][0]["assessment"]["status"], "blocked")

    def test_forecast_heading_and_unquoted_predicate_cannot_release_actual_value(self):
        cases = [("Forecast. " + TEXT, candidate(section="Forecast")),
                 ("Forecast. " + TEXT, candidate()),
                 ("Forecast\n" + TEXT, candidate()),
                 (TEXT[:-1] + " (forecast).", candidate(quote=TEXT[:-1]))]
        for text, row in cases:
            with self.subTest(text=text, section=row["section"]):
                staged = self.intake.create_batch([document(text)], [row])
                batch = staged["batches"][0]
                item = batch["candidates"][0]
                self.assertEqual(item["assessment"]["status"], "blocked")
                self.intake.authorize_batch(batch["id"], batch["content_revision"])
                with self.assertRaises(ResearchIntakeError) as error:
                    self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "Do not reinterpret a forecast as an actual")
                self.assertEqual(error.exception.code, "candidate_not_eligible")
        unrelated = self.intake.create_batch([document(TEXT + " Forecast. Vacancy might change in 2027.")], [candidate()])
        self.assertEqual(unrelated["batches"][0]["candidates"][0]["assessment"]["status"], "eligible")
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])

    def test_two_same_unit_values_and_unbound_definition_require_confirmation(self):
        text = ("City office vacancy rate for 2025 year-end was 7.5% of all office stock; "
                "West End office vacancy rate for 2025 year-end was 8.2% of all office stock.")
        staged = self.intake.create_batch([document(text)], [candidate(quote=text)])
        item = staged["batches"][0]["candidates"][0]
        self.assertEqual(item["assessment"]["status"], "needs_confirmation")
        self.assertIn("multiple_value_bindings", [r["code"] for r in item["assessment"]["reasons"]])
        changed = self.intake.create_batch([document()], [candidate(definition="Grade A tower vacancy rate")])
        self.assertEqual(changed["batches"][0]["candidates"][0]["assessment"]["status"], "needs_confirmation")

    def test_mutating_staged_content_without_new_batch_cannot_reuse_approved_revision(self):
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        state_path = self.directory / "state.json"
        state = json.loads(state_path.read_text())
        state["batches"][batch["id"]]["candidates"][0]["input"]["definition"] = "altered definition"
        state_path.write_text(json.dumps(state))
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(error.exception.code, "invalid_intake_state")

    def test_staged_candidate_ids_cannot_be_written_as_admitted_conflicts(self):
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        path = self.directory / "state.json"
        state = json.loads(path.read_text())
        state["conflicts"] = [{"record_ids": [batch["candidates"][0]["id"], "unaccepted-other"], "reason": "Untrue"}]
        path.write_text(json.dumps(state))
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.view()
        self.assertEqual(error.exception.code, "invalid_intake_state")

    def test_damaged_state_and_tampered_captured_bytes_fail_closed(self):
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        state_path = self.directory / "state.json"
        saved = state_path.read_bytes()
        state_path.write_bytes(b'{"schema_version":1,"batches":')
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.view()
        self.assertEqual(error.exception.code, "invalid_intake_state")
        state_path.write_bytes(saved)
        captured = next((self.directory / "documents").iterdir())
        captured.write_bytes(b"Substituted document with the wrong hash.")
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(error.exception.code, "invalid_document_state")
        self.assertEqual(json.loads(state_path.read_text())["accepted"]["records"], [])

    def test_html_script_text_cannot_become_local_source_evidence(self):
        markup = "<main>City vacancy not reported.</main><script>City office vacancy rate for 2025 year-end was 7.5% of all office stock.</script>"
        staged = self.intake.create_batch([document(markup, filename="synthetic.html")], [candidate()])
        self.assertEqual(staged["batches"][0]["candidates"][0]["assessment"]["status"], "blocked")

    def test_unknown_required_field_remains_visible_but_cannot_publish_invalid_research(self):
        staged = self.intake.create_batch([document()], [candidate(source_geography="")])
        batch = staged["batches"][0]
        item = batch["candidates"][0]
        self.assertEqual(item["assessment"]["status"], "needs_confirmation")
        self.intake.authorize_batch(batch["id"], batch["content_revision"])
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "Trust my source")
        self.assertEqual(error.exception.code, "candidate_not_eligible")
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])

    def test_uploaded_document_not_pasted_quote_is_the_acceptance_guard(self):
        false_quote = "City office vacancy rate for 2025 year-end was 12% of all office stock."
        staged = self.intake.create_batch([document()], [candidate(value=12, quote=false_quote, value_anchor="12%")])
        batch = staged["batches"][0]
        item = batch["candidates"][0]
        self.assertEqual(item["assessment"]["status"], "blocked")
        self.assertIn("excerpt_not_in_document", [r["code"] for r in item["assessment"]["reasons"]])
        self.assertNotEqual(item["evidence"][0]["verification_basis"], "matched_local_document")
        authorized = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(authorized["batches"][0]["candidates"][0]["state"], "blocked")
        with self.assertRaises(ResearchIntakeError) as raised:
            self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "I approve")
        self.assertEqual(raised.exception.code, "candidate_not_eligible")
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])

    def test_old_fact_conflicts_only_after_human_accept_and_different_window_stays_independent(self):
        self.seed_baseline(8.2)
        newer = "City office vacancy rate for 2026 year-end was 9.0% of all office stock."
        staged = self.intake.create_batch(
            [document(), document(newer, id="doc-two", filename="future.txt")],
            [candidate(), candidate(id="fact-two", document_id="doc-two", value=9.0,
                                    quote=newer, value_anchor="9.0%", statistical_window="2026 year-end")])
        batch = staged["batches"][0]
        pending, eligible = batch["candidates"]
        self.assertEqual(pending["assessment"]["status"], "needs_confirmation")
        self.assertIn("synthetic-baseline-record", pending["assessment"]["reasons"][-1]["related_record_ids"])
        self.assertEqual(eligible["assessment"]["status"], "eligible")
        authorized = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual([r["state"] for r in authorized["batches"][0]["candidates"]],
                         ["awaiting_confirmation", "accepted"])
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["conflicts"], [])
        self.intake.decide(batch["id"], pending["id"], batch["content_revision"], "accept", "Keep both original reports")
        state = json.loads((self.directory / "state.json").read_text())
        accepted = state["accepted"]
        self.assertEqual(state["conflicts"], [{"record_ids": ["synthetic-baseline-record", pending["id"]],
                                               "reason": state["conflicts"][0]["reason"]}])
        self.assertEqual(len(accepted["records"]), 2)
        self.assertNotIn("quality_status", next(r for r in accepted["records"] if r["statistical_window"] == "2026 year-end"))
        merged = {row["id"]: row for row in Snapshot(self.baseline, research_dir=self.directory).research()["records"]}
        self.assertEqual(merged["synthetic-baseline-record"]["quality_status"], "conflict")
        self.assertEqual(merged[pending["id"]]["quality_status"], "conflict")

    def test_different_unit_does_not_become_same_definition_conflict(self):
        self.seed_baseline(8.2)
        baseline = json.loads(self.baseline.read_text())
        baseline["research"]["records"][0]["unit"] = "percentage points"
        baseline["research"]["evidence"][0]["quote"] = (
            "City office vacancy rate for 2025 year-end was 8.2 percentage points of all office stock.")
        self.baseline.write_text(json.dumps(baseline))
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        self.assertEqual(batch["candidates"][0]["assessment"]["status"], "eligible")
        self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["conflicts"], [])

    def test_duplicate_old_fact_is_not_added_and_stale_revision_is_rejected(self):
        self.seed_baseline(7.5)
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        self.assertEqual(batch["candidates"][0]["assessment"]["status"], "duplicate")
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.authorize_batch(batch["id"], "not-the-content-revision")
        self.assertEqual(error.exception.code, "stale_content_revision")
        authorized = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual(authorized["batches"][0]["candidates"][0]["state"], "duplicate")
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])
        self.assertEqual(ResearchIntake(self.directory, self.baseline).authorize_batch(batch["id"], batch["content_revision"]), authorized)

    def test_same_batch_identical_facts_publish_once(self):
        staged = self.intake.create_batch([document()], [candidate(), candidate(id="second-client-candidate")])
        batch = staged["batches"][0]
        self.assertEqual([item["assessment"]["status"] for item in batch["candidates"]], ["eligible", "duplicate"])
        authorized = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual([item["state"] for item in authorized["batches"][0]["candidates"]], ["accepted", "duplicate"])
        self.assertEqual(len(json.loads((self.directory / "state.json").read_text())["accepted"]["records"]), 1)

    def test_replayed_human_decision_does_not_duplicate_records_or_increment_revision(self):
        self.seed_baseline(8.2)
        staged = self.intake.create_batch([document()], [candidate()])
        batch = staged["batches"][0]
        item = batch["candidates"][0]
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "yes")
        self.assertEqual(error.exception.code, "batch_not_authorized")
        self.intake.authorize_batch(batch["id"], batch["content_revision"])
        with self.assertRaises(ResearchIntakeError) as error:
            self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "")
        self.assertEqual(error.exception.code, "reason_required")
        accepted = self.intake.decide(batch["id"], item["id"], batch["content_revision"], "accept", "Reviewed source discrepancy")
        reopened = ResearchIntake(self.directory, self.baseline)
        self.assertEqual(reopened.decide(batch["id"], item["id"], batch["content_revision"], "accept", "Reviewed source discrepancy"), accepted)
        self.assertEqual(len(json.loads((self.directory / "state.json").read_text())["accepted"]["records"]), 1)

    def test_same_batch_conflict_never_auto_accepts_first_and_preserves_both_reported_values(self):
        other_text = "City office vacancy rate for 2025 year-end was 8.2% of all office stock."
        first = candidate()
        second = candidate(id="fact-two", document_id="doc-two", value=8.2,
                           quote=other_text, value_anchor="8.2%")
        staged = self.intake.create_batch(
            [document(), document(other_text, id="doc-two", filename="second.txt")],
            [first, second])
        batch = staged["batches"][0]
        self.assertEqual([x["assessment"]["status"] for x in batch["candidates"]],
                         ["needs_confirmation", "needs_confirmation"])
        authorized = self.intake.authorize_batch(batch["id"], batch["content_revision"])
        self.assertEqual([x["state"] for x in authorized["batches"][0]["candidates"]],
                         ["awaiting_confirmation", "awaiting_confirmation"])
        self.assertEqual(json.loads((self.directory / "state.json").read_text())["accepted"]["records"], [])
        a, b = [x["id"] for x in batch["candidates"]]
        self.intake.decide(batch["id"], a, batch["content_revision"], "accept", "Reviewed first value")
        result = self.intake.decide(batch["id"], b, batch["content_revision"], "accept", "Keep the second report")
        state = json.loads((self.directory / "state.json").read_text())
        records = state["accepted"]
        self.assertEqual({r["value"] for r in records["records"]}, {7.5, 8.2})
        self.assertEqual(state["conflicts"][0]["record_ids"], [a, b])
        self.assertEqual({r["quality_status"] for r in records["records"]}, {"conflict"})
        self.assertEqual({r["record"]["quality_status"] for r in result["batches"][0]["candidates"] if r["state"] == "accepted"},
                         {"conflict"})


if __name__ == "__main__":
    unittest.main()
