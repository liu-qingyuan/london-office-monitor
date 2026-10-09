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
