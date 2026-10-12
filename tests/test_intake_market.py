"""Real Data/Market overlay seam with temporary synthetic accepted state, no publication."""
import copy
import json
from pathlib import Path
from tempfile import TemporaryDirectory
import unittest
from london_office.data import ROOT, Snapshot
from london_office.market import Market


class IntakeMarketTests(unittest.TestCase):
    def test_accepted_research_refreshes_existing_market_without_changing_map(self):
        with TemporaryDirectory() as directory:
            root = Path(directory)
            baseline = root/"snapshot.json"
            baseline.write_bytes((ROOT/"data/snapshot.json").read_bytes())
            market = Market(snapshot=baseline, research_dir=root/"intake")
            before = market.query()
            research = Snapshot(baseline).research()
            record = copy.deepcopy(next(r for r in research["records"] if r["status"] == "available"))
            record["id"] = "synthetic-overlay-record"
            original = baseline.read_bytes()
            (root/"intake").mkdir()
            (root/"intake/state.json").write_text(json.dumps({"schema_version":1,
                "data_kind":"research_intake_state", "revision":1,
                "accepted":{"records":[record],"sources":[],"evidence":[]},"conflicts":[]}), encoding="utf-8")
            after = market.query()
            self.assertEqual(len(after["research"]["records"]), len(before["research"]["records"])+1)
            self.assertEqual(after["research"]["intake_revision"], 1)
            self.assertEqual(after["observations"], before["observations"])
            self.assertEqual(after["geometry"], before["geometry"])
            self.assertEqual(baseline.read_bytes(), original)
            self.assertEqual(market.source(record["source_ids"][0])["id"], record["source_ids"][0])


if __name__ == "__main__":
    unittest.main()
