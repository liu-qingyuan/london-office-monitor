"""Contract checks for the expressly admitted, source-scoped 2026 research increment."""
import unittest
from london_office.data import Snapshot
from london_office.market import Market


EXPECTED = {
    "monitor-macro-bank-rate-20260917": ("bank_rate", 3.75, "United Kingdom — country context only", "17 September 2026"),
    "monitor-macro-gdp-3month-202607": ("three_month_on_three_month_real_gdp_output_growth", 0.4, "United Kingdom — country context only", "July 2026"),
    "monitor-macro-lfs-employment-202605-07": ("lfs_employment_rate", 75.1, "United Kingdom — country context only", "May to July 2026"),
    "monitor-macro-lfs-unemployment-202605-07": ("lfs_unemployment_rate", 4.9, "United Kingdom — country context only", "May to July 2026"),
    "monitor-savills-city-grade-a-rent-202608": ("grade_a_rent", 86.26, "Savills City", "August 2026"),
    "monitor-savills-west-end-grade-a-rent-202608": ("grade_a_rent", 134.17, "Savills West End", "August 2026"),
    "monitor-savills-central-london-monthly-takeup-202608": ("monthly_take_up", 557416, "Savills Central London", "August 2026"),
    "monitor-savills-city-monthly-takeup-202608": ("monthly_take_up", 373298, "Savills City", "August 2026"),
    "monitor-savills-west-end-monthly-takeup-202608": ("monthly_take_up", 184118, "Savills West End", "August 2026"),
    "monitor-savills-central-london-ytd-takeup-202608": ("year_to_date_take_up", 6130000, "Savills Central London", "2026 YTD through August"),
    "monitor-savills-city-grade-a-takeup-share-202608": ("grade_a_take_up_share", 95, "Savills City", "August 2026"),
    "monitor-savills-central-london-professional-services-share-202608": ("professional_services_take_up_share", 31, "Savills Central London", "August 2026"),
}


class LatestDataTests(unittest.TestCase):
    def test_public_market_exposes_twelve_source_scoped_values_without_changing_map(self):
        market = Market()
        result = market.query(area="canary_wharf", period="2025-YE")
        research = result["research"]
        records = {row["id"]: row for row in research["records"]}
        self.assertEqual(len(research["records"]), 132)
        self.assertEqual(len([r for r in research["records"] if not r["id"].startswith("monitor-")]), 120)
        self.assertEqual(set(research["latest_update"]["record_ids"]), set(EXPECTED))
        self.assertEqual(len(research["comparisons"]), 3)
        self.assertEqual(len(research["exclusions"]), 7)
        self.assertEqual(len([r for r in records.values() if r["status"] == "event"]), 8)
        self.assertEqual(result["observations"][0]["status"], "missing")
        self.assertEqual(result["dataset"]["data_kind"], "historical_market")
        self.assertFalse(result["dataset"]["is_live"])
        self.assertEqual(research["data_kind"], "historical_research")
        self.assertFalse(research["is_live"])
        self.assertEqual(len(Snapshot()._data["observations"]), 11)
        self.assertEqual(research, market.brief()["research"])
        sources = {s["id"]: s for s in research["sources"]}
        evidence = {e["id"]: e for e in research["evidence"]}
        for id_, (metric, value, geography, window) in EXPECTED.items():
            with self.subTest(id=id_):
                row = records[id_]
                self.assertEqual((row["metric"], row["value"], row["status"]), (metric, value, "available"))
                self.assertEqual(row["map_binding"], None)
                self.assertEqual(row["reference_observation_ids"], [])
                self.assertEqual(row["source_geography"], geography)
                self.assertIn(window, row["statistical_window"])
                self.assertTrue(row["source_ids"] and row["evidence_ids"])
                self.assertEqual({evidence[e]["source_id"] for e in row["evidence_ids"]}, set(row["source_ids"]))
                self.assertTrue(all(len(evidence[e]["quote"]) < 600 for e in row["evidence_ids"]))
                self.assertTrue(all(sources[s]["url"].startswith("https://") for s in row["source_ids"]))
        self.assertEqual(records["monitor-savills-central-london-ytd-takeup-202608"]["display_value"], "6.13 million sq ft")
        self.assertEqual(records["monitor-savills-city-grade-a-takeup-share-202608"]["denominator"], "City take-up in August 2026")
        self.assertEqual(records["monitor-savills-central-london-professional-services-share-202608"]["denominator"], "Central London take-up in August 2026")
        self.assertEqual(records["monitor-savills-city-grade-a-rent-202608"]["billing_period"], None)
        self.assertIsNone(records["monitor-macro-lfs-unemployment-202605-07"]["denominator"])
        for topic in research["topics"]:
            self.assertEqual(topic["record_count"], sum(topic["id"] in row["topic_ids"] for row in records.values()))
        self.assertEqual(research, market.query(area="city", metric="grade_a_rent", period="2024-YE")["research"])

    def test_primary_and_latest_quotes_are_bound_to_actual_parent_urls(self):
        research = Market().brief()["research"]
        sources = {s["id"]: s for s in research["sources"]}
        evidence = {e["id"]: e for e in research["evidence"]}
        self.assertEqual(len(research["sources"]), 21)  # 14 old + 3 canonical + 3 latest + Savills
        self.assertEqual(len(research["evidence"]), 105)  # 87 old + 11 macro + 7 Savills
        for row in research["records"][-12:]:
            for e in row["evidence_ids"]:
                item = evidence[e]
                self.assertEqual(item["source_parent_url"], sources[item["source_id"]]["url"])
        self.assertEqual(research["latest_update"]["source_checked_at"], "2026-10-11T21:51:00.623552+00:00")
        self.assertEqual(len(research["latest_update"]["source_ids"]), 7)
        self.assertEqual(len(Snapshot()._data["sources"]), 2)


if __name__ == "__main__":
    unittest.main()
