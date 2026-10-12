"""Bundle public PoC source and Kimi materials. Never generate slides, upload or change permissions."""
from __future__ import annotations

import argparse
import hashlib
import json
import subprocess
import tempfile
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = {"london_office", "frontend", "data", "docs", "scripts", "skills", "tests"}
ROOT_FILES = {"README.md", "AGENTS.md", ".gitignore", "pyproject.toml", "uv.lock", "requirements.lock.txt", "GLOSSARY.md"}
FORBIDDEN = {".git", ".venv", ".auth", ".codex", "node_modules", ".pw-browsers", ".browser", "var", "raw", "dist", "__pycache__", "artifacts", "test-results", "playwright-report"}
# Non-code inputs are individually reviewed; arbitrary JSON/logs/receipts are never collected.
SNAPSHOT_FILES = {"data/README.md", "data/snapshot.json", "data/areas.geojson",
                  "frontend/package.json", "frontend/package-lock.json", "frontend/tsconfig.json",
                  "frontend/tests/fixtures/city-rent-recorded-run.json", ".github/workflows/portability.yml",
                  "presentation/README.md", "presentation/kimi-prompt-zh-CN.md", "presentation/kimi-prompt-en.md",
                  "presentation/kimi-update-zh-CN.md", "presentation/kimi-update-en.md",
                  "presentation/materials/map-zh-Hans.png", "presentation/materials/ai-answer-historical.png",
                  "presentation/materials/source-discovery-historical.png",
                  "presentation/materials/official-monitoring-desktop.png", "presentation/materials/official-monitoring-mobile.png"}
SOURCE_SUFFIXES = {".py", ".ts", ".mts", ".mjs", ".js", ".css", ".html", ".md"}
START_HERE = """# London Office Monitor — development snapshot

This ZIP supplies the runnable Python Agent PoC source, Kimi prompt and reviewed screenshot materials.
All finished presentations are made and modified only in Kimi, downloaded by the user to
artifacts/presentation/kimi-final/, and supplied separately from this code ZIP.
See presentation/README.md for the five genuine material images and their dated provenance.
New deck: presentation/kimi-prompt-zh-CN.md or presentation/kimi-prompt-en.md.
Revise your existing Kimi deck: presentation/kimi-update-zh-CN.md or presentation/kimi-update-en.md,
plus the two official-monitoring screenshots. The old deck must be uploaded to Kimi separately.
No PPTX, slide PDF or HTML deck is generated or bundled by this command.

## Added monitoring capabilities and limits

News & events now includes a read-only Official source monitoring card. Refresh status only
reads locally archived checks; it cannot search, call a model, trigger or install a schedule,
or update market values. This clean package has no archived monitor runs or UI configuration,
so not_configured is expected until the operator supplies their own authorised configuration.
OfficialWatch checks only two preset indexes: Savills Central London Office Market Watch
and The Crown Estate news. Optional native scheduling is bounded by runs, expiry and HTTP
budget, implemented only on macOS; Windows/Linux scheduling is unsupported. No task or
execution authorisation is installed, bundled, copied or renewed by unpacking this ZIP.
Official links are unverified leads, not automatic market publication. Separately, 12
source-verified 2026 facts were explicitly admitted (four UK macro and eight Savills August
office observations); research now has 132 records/21 sources/105 evidence items. Relevant
panels show Latest verified update alongside preserved history. The 11 map observations
and 2024/2025 YE selector remain unchanged. See presentation/README.md for current scope.

This is the current working-tree snapshot, including uncommitted/new public source files.
Packaging does not run product tests, revalidate a live model, or upload/share anything.
Verification remains Not yet verified for this snapshot, not inherited from older runs.
Historical UI images and reviewed replay fixtures are materials/test inputs, not fresh model evidence.
See README.md and docs/verification.md for dated evidence and limitations.
Historical market excerpts are not a live market feed; missing values are not zero.

## Run and interact without a model

Requires Python 3.12 or 3.13, uv, Node.js 22.12+ and npm. After unzipping, open a terminal
in london-office-monitor/ and run (the same commands work in Bash and PowerShell):

```text
uv sync --frozen --python 3.12
cd frontend
npm ci
npm run build
cd ..
uv run london-office serve --no-agent
```

Open http://127.0.0.1:8017 to explore market indicators, research, comparisons and sources.
Dependencies must be installed online. The online map needs OpenFreeMap access; on failure,
the app labels its fallback. No credentials, dependencies or prebuilt frontend are bundled.

## Enable the real AI Agent with your own account

Stop the no-agent server, then run:

```text
uv run london-office login
uv run london-office status
uv run london-office models
uv run london-office chat
```

Or use `uv run london-office serve` for web chat. Try asking:
"Compare City and West End prime rents between the two year-end reports."
Model availability depends on your account; see README.md to explicitly select a supported
model. No author account, API key, search budget receipt or personal configuration is included.
API-key billing and optional source discovery require your own explicit authorization.

## Offline business checks

```text
uv run python -m unittest discover -s tests -v
uv run london-office query --area city --metric prime_rent --period 2025-YE
```

Offline tests, real map/E2E checks and authenticated live-model execution are separate gates.
DELIVERY-MANIFEST.json records the source revision and exact bundled file hashes, not a pass certificate.
"""


def snapshot_sources() -> dict[str, bytes]:
    names = subprocess.check_output(
        ["git", "-C", str(ROOT), "ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    ).decode("utf-8").split("\0")
    files = {}
    for name in sorted(set(filter(None, names))):
        path = Path(name)
        if name in ROOT_FILES or name in SNAPSHOT_FILES:
            allowed = True
        else:
            allowed = (path.parts[0] in SOURCE_DIRS - {"data"} and path.suffix in SOURCE_SUFFIXES
                       and not any(part.startswith(".") for part in path.parts))
        if not allowed or set(path.parts) & FORBIDDEN:
            continue
        if path.is_absolute() or ".." in path.parts:
            raise ValueError(f"Unsafe delivery path: {name}")
        if any(ROOT.joinpath(*path.parts[:i]).is_symlink() for i in range(1, len(path.parts) + 1)):
            raise ValueError(f"Symlink not allowed in delivery: {name}")
        file = ROOT / path
        if not file.exists():  # Tracked files removed in the working tree are not in this snapshot.
            continue
        if not file.is_file():
            raise ValueError(f"Not a regular delivery file: {name}")
        files[name] = file.read_bytes()
    if not files:
        raise ValueError("No public project source files; refusing empty delivery")
    return files


def build_snapshot():
    sources = snapshot_sources()
    revision = subprocess.check_output(["git", "-C", str(ROOT), "rev-parse", "HEAD"], text=True).strip()
    created = datetime.now(timezone.utc)
    delivery = ROOT / "artifacts/delivery"
    for directory in (ROOT / "artifacts", delivery):
        if directory.is_symlink():
            raise ValueError(f"Symlink not allowed in delivery output: {directory.relative_to(ROOT)}")
    delivery.mkdir(parents=True, exist_ok=True)
    destination = delivery / f"london-office-monitor-{created.strftime('%Y%m%dT%H%M%S%fZ')}-snapshot"
    verification = {key: "Not yet verified" for key in ("offline_tests", "map_e2e", "live_model")}
    with tempfile.TemporaryDirectory(prefix=".snapshot-", dir=delivery) as directory:
        stage = Path(directory)
        files = {**sources, "START-HERE.md": START_HERE.encode("utf-8")}
        manifest = {
            "created_at": created.isoformat(), "delivery_kind": "development_snapshot",
            "git_revision": revision, "source_basis": "current working tree, including new public source files",
            "presentation_policy": "Kimi only; finished slides are supplied separately",
            "live_model_verified": False, "verification": verification,
            "verification_scope": "Not revalidated by packaging; older evidence is dated, not a current pass.",
            "exclusions": "Credentials, personal config, environments, generated frontend, browser profiles, raw reports, "
                          "original assessment attachments, budget receipts, runtime traces and old artifacts/ validation outputs "
                          "(reviewed replay fixtures remain as test inputs).",
            "files": [{"path": name, "bytes": len(body), "sha256": hashlib.sha256(body).hexdigest()}
                      for name, body in sorted(files.items())],
        }
        manifest_body = json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8")
        (stage / "DELIVERY-MANIFEST.json").write_bytes(manifest_body)
        (stage / "START-HERE.md").write_bytes(files["START-HERE.md"])
        with zipfile.ZipFile(stage / "london-office-monitor-poc.zip", "w", compression=zipfile.ZIP_DEFLATED) as archive:
            for name, body in sorted(files.items()):
                archive.writestr("london-office-monitor/" + name, body)
            archive.writestr("london-office-monitor/DELIVERY-MANIFEST.json", manifest_body)
        if sources != snapshot_sources():
            raise RuntimeError("Public source changed during packaging; no snapshot published. Rerun when edits stop.")
        if destination.exists():
            raise FileExistsError(f"Delivery already exists; refusing overwrite: {destination}")
        stage.rename(destination)
    print(json.dumps({"zip": str(destination / "london-office-monitor-poc.zip"),
                      "files": len(files), "delivery_kind": "development_snapshot",
                      "verification": verification}, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--snapshot", action="store_true",
                        help="Compatibility flag: default also bundles current public code and Kimi materials, not slides")
    parser.parse_args()
    build_snapshot()


if __name__ == "__main__":
    main()
