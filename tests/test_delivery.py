"""Delivery CLI checks in owned temporary repositories; no slide generation or model calls."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
import zipfile

from london_office.data import ROOT


class DeliveryTests(unittest.TestCase):
    def prepare_project(self, root):
        for name in ("scripts/package_delivery.py", "data/snapshot.json", "data/areas.geojson", ".gitignore",
                     "frontend/tests/fixtures/city-rent-recorded-run.json", "presentation/README.md",
                     "presentation/kimi-prompt-zh-CN.md", "presentation/kimi-prompt-en.md",
                     "presentation/kimi-update-zh-CN.md", "presentation/kimi-update-en.md"):
            destination = root / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(ROOT / name, destination)
        shutil.copytree(ROOT / "london_office", root / "london_office", ignore=shutil.ignore_patterns("__pycache__"))
        for name in ("map-zh-Hans.png", "ai-answer-historical.png", "source-discovery-historical.png",
                     "official-monitoring-desktop.png", "official-monitoring-mobile.png"):
            path = root / "presentation/materials" / name
            path.parent.mkdir(parents=True, exist_ok=True)
            # Byte-copy fixture only; not a screenshot, generated deck or product acceptance.
            path.write_bytes(b"synthetic approved-path packaging fixture")
        (root / "README.md").write_text("previous source\n", encoding="utf-8")
        (root / "docs").mkdir()
        (root / "docs/deleted.md").write_text("deleted source\n", encoding="utf-8")
        subprocess.run(["git", "init", "-q", "-b", "main", str(root)], check=True)
        subprocess.run(["git", "-C", str(root), "add", "README.md", "docs/deleted.md"], check=True)
        subprocess.run(["git", "-C", str(root), "-c", "user.name=Delivery test",
                        "-c", "user.email=delivery-test@example.invalid", "commit", "-qm", "fixture"], check=True)
        (root / "README.md").write_text("current uncommitted source\n", encoding="utf-8")
        (root / "docs/deleted.md").unlink()

    def run_delivery(self, root, *, snapshot=True):
        command = [sys.executable, str(root / "scripts/package_delivery.py")]
        if snapshot:
            command.append("--snapshot")
        return subprocess.run(command, cwd=root, env={**os.environ, "PYTHONPATH": str(root)},
                              capture_output=True, text=True, encoding="utf-8", timeout=10)

    def test_snapshot_contains_code_and_kimi_materials_without_a_generator_or_old_deck(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            source = root / "frontend/src/i18n/new.ts"
            source.parent.mkdir(parents=True)
            source.write_text("export const message = 'new untracked source';\n", encoding="utf-8")
            private = (".pi/remote-pi/config.json", ".env", "var/runs/receipt.json", "frontend/node_modules/private.js",
                       "frontend/dist/private.js", "frontend/.pw-browsers/private.js", "docs/private-report.pdf",
                       "docs/auth.json", "scripts/private-key.pem", "presentation/materials/unreviewed.png",
                       "presentation/materials/not-kimi.pptx", "presentation/materials/not-kimi.pdf",
                       "presentation/obsolete-generator.py", "presentation/obsolete-deck.html")
            for name in private:
                path = root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text("DO NOT SHIP", encoding="utf-8")
            reviewed = root / "artifacts/presentation/london-office-monitor.pptx"
            reviewed.parent.mkdir(parents=True)
            reviewed.write_bytes(b"frozen historical deck; do not modify")
            (root / "artifacts/live-verification.json").write_text('{"passed":true}', encoding="utf-8")
            result = self.run_delivery(root)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            output = json.loads(result.stdout)
            archive_path = Path(output["zip"])
            self.assertTrue(archive_path.is_file())
            self.assertNotIn("pptx", output)
            self.assertNotIn("html", output)
            self.assertEqual(reviewed.read_bytes(), b"frozen historical deck; do not modify")
            self.assertFalse((root / "presentation/build_slides.py").exists())
            self.assertFalse(any(path.suffix in {".pptx", ".pdf", ".html"} for path in archive_path.parent.iterdir()))
            with zipfile.ZipFile(archive_path) as archive:
                prefix = "london-office-monitor/"
                names = {name.removeprefix(prefix) for name in archive.namelist()}
                self.assertIn("frontend/src/i18n/new.ts", names)
                self.assertIn("london_office/cli.py", names)
                self.assertIn("frontend/tests/fixtures/city-rent-recorded-run.json", names)
                self.assertIn("presentation/kimi-prompt-zh-CN.md", names)
                self.assertIn("presentation/kimi-prompt-en.md", names)
                self.assertIn("presentation/kimi-update-zh-CN.md", names)
                self.assertIn("presentation/kimi-update-en.md", names)
                self.assertIn("presentation/materials/map-zh-Hans.png", names)
                self.assertIn("presentation/materials/official-monitoring-desktop.png", names)
                self.assertIn("presentation/materials/official-monitoring-mobile.png", names)
                self.assertEqual(archive.read(prefix + "README.md"), b"current uncommitted source\n")
                self.assertNotIn("docs/deleted.md", names)
                self.assertTrue(names.isdisjoint(private))
                self.assertFalse(any(name.startswith("artifacts/") for name in names))
                manifest = json.loads(archive.read(prefix + "DELIVERY-MANIFEST.json"))
                self.assertEqual(manifest["delivery_kind"], "development_snapshot")
                self.assertEqual(manifest["presentation_policy"], "Kimi only; finished slides are supplied separately")
                self.assertFalse(manifest["live_model_verified"])
                self.assertTrue(all(value == "Not yet verified" for value in manifest["verification"].values()))
                for entry in manifest["files"]:
                    body = archive.read(prefix + entry["path"])
                    self.assertEqual(entry["bytes"], len(body))
                    self.assertEqual(entry["sha256"], hashlib.sha256(body).hexdigest())
                guide = archive.read(prefix + "START-HERE.md").decode("utf-8")
                for required in ("serve --no-agent", "london-office login", "npm run build", "Kimi"):
                    self.assertIn(required, guide)

    def test_default_command_also_bundles_code_without_requiring_a_ppt(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            result = self.run_delivery(root, snapshot=False)
            self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
            self.assertTrue(Path(json.loads(result.stdout)["zip"]).is_file())

    def test_source_change_during_zip_write_does_not_publish_a_mixed_snapshot(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            # Instrument only the child interpreter's standard ZIP writer; no production hook.
            (root / "sitecustomize.py").write_text('''import zipfile
from pathlib import Path
original = zipfile.ZipFile.writestr
changed = False
def mutate(self, *args, **kwargs):
    global changed
    if not changed:
        Path("README.md").write_text("changed during ZIP write", encoding="utf-8")
        changed = True
    return original(self, *args, **kwargs)
zipfile.ZipFile.writestr = mutate
''', encoding="utf-8")
            result = self.run_delivery(root)
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Public source changed during packaging", result.stderr)
            self.assertEqual(list((root / "artifacts/delivery").iterdir()), [])

    @unittest.skipIf(os.name == "nt", "Unprivileged Windows CI may not support symlink creation")
    def test_failed_attempt_preserves_previous_snapshot_without_publishing_another(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            first = self.run_delivery(root)
            self.assertEqual(first.returncode, 0, first.stdout + first.stderr)
            first_zip = Path(json.loads(first.stdout)["zip"])
            original = first_zip.read_bytes()
            (root / "scripts/linked.py").symlink_to(root / "README.md")
            failed = self.run_delivery(root)
            self.assertNotEqual(failed.returncode, 0)
            self.assertEqual(first_zip.read_bytes(), original)
            self.assertEqual([path.resolve() for path in (root / "artifacts/delivery").iterdir()],
                             [first_zip.parent.resolve()])

    @unittest.skipIf(os.name == "nt", "Unprivileged Windows CI may not support symlink creation")
    def test_delivery_directory_symlink_is_rejected_without_writing_to_its_target(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            target = root / "private-output-fixture"
            target.mkdir()
            (root / "artifacts").symlink_to(target, target_is_directory=True)
            failed = self.run_delivery(root)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("Symlink not allowed", failed.stderr)
            self.assertEqual(list(target.iterdir()), [])

    @unittest.skipIf(os.name == "nt", "Unprivileged Windows CI may not support symlink creation")
    def test_source_symlink_is_rejected_before_any_delivery_is_published(self):
        with tempfile.TemporaryDirectory(prefix="london-delivery-") as directory:
            root = Path(directory)
            self.prepare_project(root)
            (root / "scripts/linked.py").symlink_to(root / "README.md")
            failed = self.run_delivery(root)
            self.assertNotEqual(failed.returncode, 0)
            self.assertIn("Symlink not allowed", failed.stderr)
            self.assertFalse((root / "artifacts/delivery").exists())


if __name__ == "__main__":
    unittest.main()
