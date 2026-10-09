"""Build a curated local ZIP. Does not upload, publish or change permissions."""
from __future__ import annotations

import hashlib
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE_DIRS = {"london_office", "frontend", "data", "docs", "presentation", "scripts", "skills", "tests"}
ROOT_FILES = {"README.md", ".gitignore", "pyproject.toml", "uv.lock", "requirements.lock.txt", "GLOSSARY.md"}
FORBIDDEN = {".git", ".venv", ".auth", ".codex", "node_modules", ".pw-browsers", ".browser", "var", "raw", "dist", "__pycache__"}
ARTIFACTS = [
    "artifacts/presentation/london-office-monitor.pptx",
    "artifacts/presentation/london-office-monitor.pdf",
    "artifacts/presentation/london-office-monitor.html",
    "artifacts/presentation/verification.json",
    "artifacts/london-map.png",
    "artifacts/source-verification.json",
    "artifacts/live-smoke.json",
    "artifacts/live-ui.json",
    "artifacts/live-verification.json",
    "artifacts/live-agent-1.png",
    "artifacts/live-agent-2.png",
    "artifacts/dashboard-live.png",
    "artifacts/playwright-results/results.json",
    "artifacts/clean-environment.json",
]


def main():
    tracked = subprocess.check_output(["git", "-C", str(ROOT), "ls-files", "-z"], text=True).split("\0")
    paths = []
    for name in filter(None, tracked):
        path = Path(name)
        if set(path.parts) & FORBIDDEN or path.name.startswith(".env") or "auth" in path.name.lower() and path.suffix == ".json":
            raise ValueError(f"Unsafe tracked delivery path: {name}")
        if name in ROOT_FILES or path.parts[0] in SOURCE_DIRS:
            paths.append(name)
    if not paths:
        raise ValueError("No project source files staged/tracked; refusing empty delivery")
    for name in ARTIFACTS:
        if not (ROOT / name).is_file():
            raise FileNotFoundError(f"Required reviewed artifact is not ready: {name}")
        paths.append(name)
    output = ROOT / "artifacts/delivery/london-office-monitor-poc.zip"
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = {"created_at":datetime.now(timezone.utc).isoformat(),
        "live_model_verified":json.loads((ROOT/"artifacts/live-verification.json").read_text()).get("passed", False),
        "exclusions":"Credentials, personal config, environments, browser profiles, raw reports, original assessment attachments, runtime traces and unrelated files are not included.", "files":[]}
    with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(set(paths)):
            file = ROOT / name
            if file.is_symlink():
                raise ValueError(f"Symlink not allowed in delivery: {name}")
            body = file.read_bytes()
            manifest["files"].append({"path":name,"bytes":len(body),"sha256":hashlib.sha256(body).hexdigest()})
            archive.writestr("london-office-monitor/" + name, body)
        archive.writestr("london-office-monitor/DELIVERY-MANIFEST.json", json.dumps(manifest,ensure_ascii=False,indent=2))
    print(json.dumps({"zip":str(output),"files":len(manifest["files"]),"live_model_verified":manifest["live_model_verified"]},ensure_ascii=False,indent=2))


if __name__ == "__main__":
    main()
