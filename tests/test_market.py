"""Public Market Interface tests. Production data is historical, not synthetic."""
import json
import tempfile
import unittest
from pathlib import Path
from london_office.data import ROOT
from london_office.market import Market


class MarketTests(unittest.TestCase):
    def test_real_prime_rent_and_source(self):
        result = Market().query(area="city", metric="prime_rent", period="2025-YE")
        fact = result["observations"][0]
        self.assertEqual(fact["value"], 105.26)
        self.assertEqual(fact["data_kind"], "historical_market")
        self.assertEqual(fact["source_id"], "savills-2025-q4")
        self.assertIn("105.26", result["evidence"][0]["quote"])
        self.assertFalse(result["dataset"]["is_live"])

    def test_admitted_eight_dimensions_are_shared_without_borrowing_map_scope(self):
        market = Market()
        query = market.query(area="canary_wharf", period="2025-YE")
        research = query["research"]
        self.assertEqual({t["id"] for t in research["topics"]},
                         {"submarkets", "rents", "vacancy", "leasing", "supply", "macro", "demand", "news"})
        self.assertEqual(research["publication_status"], "admitted_with_caveats")
        self.assertFalse(research["is_live"])
        self.assertEqual(query["observations"][0]["status"], "missing")
        self.assertTrue(all(r["map_binding"] is None for r in research["records"]))
        self.assertEqual(research, market.brief(period="2025-YE", area="city")["research"])
        self.assertTrue(any(r["metric"] == "bank_rate" and r["value"] == 3.75 for r in research["records"]))
        self.assertTrue(any(r["metric"] == "annual_take_up" and r["value"] == 9430000 for r in research["records"]))
        self.assertEqual(len(research["exclusions"]), 7)

    def test_research_windows_forecasts_and_selected_python_changes_remain_distinct(self):
        research = Market().brief()["research"]
        records = research["records"]
        forecasts = [r for r in records if r["kind"] == "forecast"]
        self.assertTrue(forecasts)
        self.assertTrue(all(r["forecast_as_of"] is None for r in forecasts))
        unknown_horizon = next(r for r in forecasts if r["value"] == 24400000)
        self.assertIsNone(unknown_horizon["target_years"])
        starts = next(r for r in records if r["metric"] == "development_starts")
        self.assertIn("Not stated", starts["statistical_window"])
        approximation = next(r for r in records if r["status"] == "approximate")
        self.assertIsNone(approximation["value"])
        self.assertIn("around a third", approximation["display_value"])
        changes = {c["id"]:c for c in research["comparisons"]}
        self.assertEqual(changes["research-change-annual_take_up"]["change_value"], -6.63)
        self.assertEqual(changes["research-change-completed_development"]["change_value"], 20.0)
        self.assertEqual(changes["research-change-breeam_excellent_outstanding_take_up_share"]["change_value"], 5.0)
        self.assertEqual(changes["research-change-breeam_excellent_outstanding_take_up_share"]["change_unit"], "percentage points")
        events = [r for r in records if r["status"] == "event"]
        self.assertEqual(len(events), 8)
        self.assertTrue(all(r["event"]["occurred_on"] is None for r in events))
        self.assertEqual(sum(r["event"]["snapshot_disposition"] == "enrich_existing_note_only_no_additional_event_count" for r in events), 2)
        self.assertTrue(any("quarterly_not_year_end" in r["caveats"] for r in records))
        self.assertEqual(sum(r["kind"] == "country_context" for r in records), 17)
        latest_ids = set(research["latest_update"]["record_ids"])
        self.assertEqual(sum(r["kind"] == "country_context" and r["id"] not in latest_ids for r in records), 13)

    def test_corroborating_landlord_excerpt_retains_its_actual_source(self):
        market = Market()
        research = market.brief()["research"]
        landlord = next(s for s in research["sources"] if s["publisher"] == "The Crown Estate")
        evidence = market.source(landlord["id"])["evidence"]
        self.assertTrue(evidence, "Landlord announcement cannot be attributed to the retrospective Savills report")
        quote = next(e for e in evidence if e["section"] == "Original announcement / Ares Management pre-let paragraph")
        self.assertTrue(quote["quote"].startswith("The Crown Estate has pre-let"))
        event = next(r for r in research["records"] if r["id"] == "news-145")
        self.assertIn(quote["id"], event["evidence_ids"])
        self.assertEqual(landlord["published_at"], "2026-01-15")
        self.assertIsNone(event["event"]["occurred_on"])

    def test_research_never_widens_network_verification_scope(self):
        market = Market()
        source = next(s for s in market.brief()["research"]["sources"] if s["publisher"].startswith("Bank of England"))
        self.assertTrue(market.source(source["id"])["evidence"])
        with self.assertRaisesRegex(ValueError, "original approved Savills"):
            market.verify_source(source["id"])

    def test_west_end_reported_growth_is_not_silently_replaced(self):
        comparison = Market().compare(area="west_end", metric="prime_rent", previous_period="2024-YE", current_period="2025-YE")
        self.assertEqual(comparison["change_value"], 5.78)
        self.assertEqual(comparison["reported_change_pct"], 6.1)
        self.assertTrue(any("reported_growth_mismatch" in w for w in comparison["warnings"]))
        self.assertEqual(len(comparison["evidence_ids"]), 2)

    def test_city_growth_and_vacancy_have_different_units(self):
        rent = Market().compare(area="city", metric="prime_rent", previous_period="2024-YE", current_period="2025-YE")
        vacancy = Market().compare(area="city", metric="vacancy_rate", previous_period="2024-YE", current_period="2025-YE")
        self.assertEqual(rent["change_value"], 6.75)
        self.assertEqual(rent["change_unit"], "%")
        self.assertEqual(rent["warnings"], [])
        self.assertEqual(vacancy["change_value"], -0.9)
        self.assertEqual(vacancy["change_unit"], "percentage points")

    def test_missing_submarket_and_missing_baseline_are_not_zero(self):
        for area in ["canary_wharf", "midtown_fringe"]:
            result = Market().query(area=area)
            fact = result["observations"][0]
            self.assertEqual(fact["status"], "missing")
            self.assertIsNone(fact["value"])
            self.assertIsNone(fact["source_id"])
            self.assertEqual(result["notes"], [])
        comparison = Market().compare(area="west_end", metric="vacancy_rate", previous_period="2024-YE", current_period="2025-YE")
        self.assertIsNone(comparison["previous_value"])
        self.assertEqual(comparison["current_value"], 7.9)
        self.assertIsNone(comparison["change_value"])

    def test_definition_and_period_are_not_guessed(self):
        for kwargs in [{"metric":"prime_headline_rent"}, {"metric":"availability_rate"}, {"period":"2026-Q3"}, {"area":"docklands"}]:
            with self.assertRaises(ValueError):
                Market().query(**kwargs)

    def test_synthetic_conflict_fixture_never_selects_a_single_value(self):
        document = json.loads((ROOT / "data/snapshot.json").read_text())
        document["dataset"]["data_kind"] = "synthetic_fixture"
        row = dict(document["observations"][0], id="SYNTHETIC-CONFLICT", value=999)
        document["observations"].append(row)
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "synthetic.json"
            path.write_text(json.dumps(document))
            result = Market(path).query(area="city", period="2024-YE")
            fact = result["observations"][0]
            self.assertEqual(fact["status"], "conflict")
            self.assertEqual(fact["data_kind"], "synthetic_fixture")
            self.assertIsNone(fact["value"])
            self.assertEqual(len(fact["candidates"]), 2)

    def test_zero_baseline_fixture_has_undefined_percent_change(self):
        document = json.loads((ROOT / "data/snapshot.json").read_text())
        document["dataset"]["data_kind"] = "synthetic_fixture"
        document["observations"][0]["value"] = 0
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "synthetic-zero.json"
            path.write_text(json.dumps(document))
            result = Market(path).compare(area="city", metric="prime_rent", previous_period="2024-YE", current_period="2025-YE")
            self.assertEqual(result["status"], "zero_baseline")
            self.assertIsNone(result["change_value"])

    def test_grade_a_is_separate_and_has_its_own_evidence_conflict(self):
        result = Market().query(area="city", metric="grade_a_rent")
        self.assertEqual(result["observations"][0]["value"], 74.34)
        self.assertEqual(result["comparisons"][0]["change_value"], 5.43)
        self.assertTrue(result["comparisons"][0]["warnings"])

    def test_all_geometries_are_explicitly_illustrative(self):
        result = Market().query()
        self.assertEqual(len(result["geometry"]["features"]), 4)
        self.assertTrue(all(f["properties"]["geometry_status"] == "illustrative" for f in result["geometry"]["features"]))
        self.assertEqual([f["value"] for f in result["observations"]], [105.26, 166.61, None, None])

    def test_sources_and_catalog_are_not_mutable_backdoors(self):
        market = Market()
        catalog = market.catalog()
        catalog["metrics"][0]["unit"] = "NOT A UNIT"
        self.assertEqual(market.query()["unit"], "GBP/sq ft")
        with self.assertRaises(ValueError):
            market.source("https://example.com/not-an-approved-source")


if __name__ == "__main__":
    unittest.main()
