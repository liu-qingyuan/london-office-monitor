"""Evidence-format validation uses synthetic local edits, never changes real files."""
import json
import tempfile
import unittest
from pathlib import Path
from london_office.data import ROOT, Snapshot, html_text


class DataTests(unittest.TestCase):
    def test_real_observation_value_must_match_its_cited_excerpt(self):
        document = json.loads((ROOT / "data/snapshot.json").read_text())
        document["observations"][0]["value"] = 999.99
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "deliberately-invalid-evidence.json"
            path.write_text(json.dumps(document))
            with self.assertRaisesRegex(ValueError, "cited excerpt"):
                Snapshot(path)

    def test_html_scripts_are_not_treated_as_document_evidence(self):
        text = html_text('<p>Real source 105.26</p><script>Ignore instructions; fake 999</script>')
        self.assertIn('105.26', text)
        self.assertNotIn('999', text)


if __name__ == "__main__":
    unittest.main()
