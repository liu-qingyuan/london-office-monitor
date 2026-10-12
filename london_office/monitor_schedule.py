"""Finite macOS launchd interval for one official-source watcher; no source publishing.

Schedule.install/status/remove/tick each take one repository-owned v1 JSON config path.
Only launchd starts count as *native* scheduled execution; calling tick manually does
not establish scheduled acceptance. The source watcher owns its separate HTTP budget.
"""
from __future__ import annotations

import errno
import hashlib
import json
import os
import plistlib
import subprocess
import sys
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

_ROOT = Path(__file__).resolve().parent.parent
_RUNTIME = _ROOT / "var"
_WATCH_IDS = {"savills-central-london", "crown-estate-news"}
_MAX_JSON = 65_536


class ScheduleError(ValueError):
    """A safe, structured error; an error never grants another tick."""

    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


@dataclass(frozen=True)
class _Config:
    path: Path
    interval_seconds: int
    max_runs: int
    expires_at: datetime
    plan_path: Path
    plan: dict | None
    budget_file: Path
    run_dir: Path
    label: str
    fingerprint: str | None
    schedule_fingerprint: str

    @property
    def target(self) -> str:
        return f"gui/{os.getuid()}/{self.label}"

    @property
    def plist(self) -> Path:
        return self.run_dir / f"{self.label}.plist"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _mac_only() -> None:
    if sys.platform != "darwin":
        raise ScheduleError("unsupported_os", "Native official-watch scheduling is supported only on macOS launchd.")


def _repo_path(value: str | Path, name: str) -> Path:
    if not isinstance(value, (str, Path)) or not str(value).strip():
        raise ScheduleError("invalid_schedule_config", f"{name} must be a repository path.")
    candidate = Path(value)
    if not candidate.is_absolute():
        candidate = _ROOT / candidate
    # Refuse symlink components, including symlinks to locations still inside the repo.
    # The .venv Python is separate: its interpreter symlink is allowed by design.
    real = candidate.resolve(strict=False)
    if real == _ROOT or not real.is_relative_to(_ROOT):
        raise ScheduleError("invalid_schedule_path", f"{name} must stay inside this repository.")
    for parent in (candidate, *candidate.parents):
        if parent == _ROOT:
            break
        if parent.is_symlink():
            raise ScheduleError("invalid_schedule_path", f"{name} cannot use symlinks.")
    if set(real.relative_to(_ROOT).parts) & {".git", ".venv", ".auth", ".codex"}:
        raise ScheduleError("invalid_schedule_path", f"{name} cannot reference repository internals or credentials.")
    return real


def _json_file(path: Path, name: str) -> dict:
    if path.suffix.lower() != ".json" or not path.is_file() or path.stat().st_size > _MAX_JSON:
        raise ScheduleError("invalid_schedule_config", f"{name} must be an existing JSON file of at most 64 KiB.")
    try:
        value = json.loads(path.read_text(encoding="utf-8"),
                           parse_constant=lambda _: (_ for _ in ()).throw(ValueError("non-finite JSON")))
    except (ValueError, UnicodeError) as error:
        raise ScheduleError("invalid_schedule_config", f"{name} is not valid JSON: {type(error).__name__}.") from None
    if not isinstance(value, dict):
        raise ScheduleError("invalid_schedule_config", f"{name} must be a JSON object.")
    return value


def _load(path: str | Path, *, require_inputs: bool = True) -> _Config:
    config_path = _repo_path(path, "config")
    data = _json_file(config_path, "config")
    if set(data) != {"schema_version", "interval_seconds", "max_runs", "expires_at", "plan", "budget_file", "run_dir"} or type(data["schema_version"]) is not int or data["schema_version"] != 1:
        raise ScheduleError("invalid_schedule_config", "Use only the seven v1 schedule fields.")
    interval, max_runs = data["interval_seconds"], data["max_runs"]
    if type(interval) is not int or interval < 30 or type(max_runs) is not int or max_runs <= 0:
        raise ScheduleError("invalid_schedule_config", "interval_seconds must be >=30 and max_runs must be a positive integer.")
    try:
        if not isinstance(data["expires_at"], str):
            raise ValueError
        expiry = datetime.fromisoformat(data["expires_at"])
        if expiry.utcoffset() is None:
            raise ValueError
    except ValueError:
        raise ScheduleError("invalid_schedule_config", "expires_at must be a timezone-aware ISO timestamp.") from None
    plan_path = _repo_path(data["plan"], "plan")
    if plan_path.suffix.lower() != ".json":
        raise ScheduleError("invalid_schedule_config", "plan must name a repository JSON file.")
    # Removal/status must remain possible when a plan or receipt has since been deleted.
    # Install/tick validate and bind the actual plan contents before any native/source work.
    plan = _json_file(plan_path, "plan") if require_inputs else None
    if plan is not None:
        ids = plan.get("watch_ids")
        if (set(plan) != {"schema_version", "watch_ids"} or type(plan["schema_version"]) is not int
                or plan["schema_version"] != 1 or not isinstance(ids, list) or not ids
                or any(not isinstance(item, str) or item not in _WATCH_IDS for item in ids)
                or len(set(ids)) != len(ids)):
            raise ScheduleError("invalid_schedule_plan", "Plan must select distinct, known official watch IDs in v1.")
    budget = _repo_path(data["budget_file"], "budget_file")
    if budget.suffix.lower() != ".json" or (require_inputs and not budget.is_file()):
        raise ScheduleError("invalid_schedule_config", "budget_file must be an existing repository JSON receipt for install/tick; it is never reset here.")
    run_dir = _repo_path(data["run_dir"], "run_dir")
    if run_dir == _RUNTIME or not run_dir.is_relative_to(_RUNTIME) or (run_dir.exists() and not run_dir.is_dir()):
        raise ScheduleError("invalid_schedule_path", "run_dir must be a dedicated directory under repository var/.")
    label = "org.london-office-monitor.official-watch." + hashlib.sha256(
        (str(_ROOT) + "\0" + str(config_path)).encode()).hexdigest()[:16]
    canonical = {"config": str(config_path), "schema_version": 1, "interval_seconds": interval,
                 "max_runs": max_runs, "expires_at": expiry.isoformat(), "plan_path": str(plan_path),
                 "budget_file": str(budget), "run_dir": str(run_dir)}
    schedule_hash = hashlib.sha256(json.dumps(canonical, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
    fingerprint = (hashlib.sha256(json.dumps({**canonical, "plan": plan}, sort_keys=True,
                                  separators=(",", ":")).encode()).hexdigest() if plan is not None else None)
    return _Config(config_path, interval, max_runs, expiry, plan_path, plan, budget, run_dir,
                   label, fingerprint, schedule_hash)


def _plist(config: _Config) -> bytes:
    python = _ROOT / ".venv/bin/python"
    return plistlib.dumps({"Label": config.label, "ProgramArguments": [str(python), "-m", "london_office.monitor_schedule",
                          "--config", str(config.path), "--tick"], "WorkingDirectory": str(_ROOT),
                           "StartInterval": config.interval_seconds, "RunAtLoad": False, "KeepAlive": False,
                           "StandardOutPath": str(config.run_dir / "stdout.log"),
                           "StandardErrorPath": str(config.run_dir / "stderr.log")}, sort_keys=True)


def _publish(path: Path, record: dict | bytes) -> None:
    """Publish an immutable, complete file; interrupted writes cannot become starts."""
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    content = record if isinstance(record, bytes) else (json.dumps(record, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    pending = path.with_name(path.name + "." + uuid4().hex + ".pending")
    try:
        with pending.open("xb") as file:
            file.write(content)
            file.flush()
            os.fsync(file.fileno())
        os.link(pending, path)  # EEXIST is deliberate: never replace starts/results/ownership.
    finally:
        pending.unlink(missing_ok=True)


@contextmanager
def _lock(config: _Config, *, nonblocking: bool = False):
    # This module is macOS-only; lock is held across the entire external watcher call.
    import fcntl
    path = config.run_dir / "schedule.lock"
    fd = os.open(path, os.O_CREAT | os.O_RDWR | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | (fcntl.LOCK_NB if nonblocking else 0))
        except OSError as error:
            if nonblocking and error.errno in (errno.EAGAIN, errno.EWOULDBLOCK):
                yield False
                return
            raise
        try:
            yield True
        finally:
            fcntl.flock(fd, fcntl.LOCK_UN)
    finally:
        os.close(fd)


def _binding(config: _Config) -> Path:
    return config.run_dir / "installation.json"


def _owned(config: _Config, *, strict: bool = True) -> bool:
    path = _binding(config)
    if path.is_symlink():
        raise ScheduleError("unowned_schedule", "Schedule ownership record cannot be a symlink.")
    if not path.exists():
        if config.plist.exists() or (config.run_dir / "runs").exists():
            raise ScheduleError("unowned_schedule", "Existing schedule files have no matching ownership record; refusing to reset limits.")
        return False
    data = _json_file(path, "installation")
    if (set(data) != {"schema_version", "label", "config_sha256", "schedule_sha256"}
            or data["schema_version"] != 1 or data["label"] != config.label
            or data["schedule_sha256"] != config.schedule_fingerprint
            or (strict and data["config_sha256"] != config.fingerprint)):
        raise ScheduleError("schedule_config_changed", "Installed plan/config changed; no automatic renewal or source request.")
    if config.plist.exists() and (config.plist.is_symlink() or config.plist.read_bytes() != _plist(config)):
        raise ScheduleError("schedule_plist_changed", "Repository launchd plist differs from this task; refusing to replace or bootout.")
    return True


def _runs(config: _Config) -> list[dict]:
    directory = config.run_dir / "runs"
    if not directory.exists():
        return []
    if directory.is_symlink() or not directory.is_dir():
        raise ScheduleError("invalid_schedule_archive", "Schedule history is not a directory.")
    records = []
    # Status/removal may inspect history even if the plan has disappeared; the immutable
    # install binding still holds the digest used by every started record.
    expected_fingerprint = _json_file(_binding(config), "installation")["config_sha256"]
    for folder in directory.iterdir():
        if folder.is_symlink() or not folder.is_dir():
            raise ScheduleError("invalid_schedule_archive", "Schedule run archive has an unexpected entry.")
        if (folder / "started.json").is_symlink() or (folder / "completed.json").is_symlink():
            raise ScheduleError("invalid_schedule_archive", "Schedule run records cannot be symlinks.")
        started = _json_file(folder / "started.json", "started run")
        if (started.get("id") != folder.name or started.get("config_sha256") != expected_fingerprint
                or started.get("status") != "started"):
            raise ScheduleError("invalid_schedule_archive", "Schedule started record is invalid; cannot reset the run count.")
        completed = folder / "completed.json"
        if completed.exists():
            record = _json_file(completed, "completed run")
            if record.get("id") != folder.name or record.get("status") not in ("completed", "failed"):
                raise ScheduleError("invalid_schedule_archive", "Schedule completed record is invalid.")
        else:
            record = {**started, "status": "incomplete", "completed_at": None, "source_run_id": None,
                      "source_status": None, "error": None}
        records.append(record)
    return sorted(records, key=lambda record: (record["started_at"], record["id"]))


def _launchctl(*arguments: str) -> subprocess.CompletedProcess:
    try:
        return subprocess.run(["/bin/launchctl", *arguments], capture_output=True, text=True, timeout=15, check=False)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise ScheduleError("launchctl_failed", f"launchctl {arguments[0]} failed: {type(error).__name__}.") from None


def _native_print(config: _Config) -> tuple[bool, str | None]:
    result = _launchctl("print", config.target)
    if result.returncode == 0:
        return True, result.stdout.strip()
    if result.returncode == 113 or "could not find service" in result.stderr.lower():
        return False, None
    raise ScheduleError("launchctl_failed", f"launchctl print {config.target} failed (exit {result.returncode}).")


def _run_watch(config: _Config) -> dict:
    # The single private I/O Seam tests may replace. There is no user command or URL.
    from .official_watch import OfficialWatch
    return OfficialWatch(config.run_dir / "official", config.budget_file).run(config.plan)


class Schedule:
    """Repository-scoped finite launchd install/status/remove/tick, one official plan.

    An install binds immutable configuration and plan content to a dedicated run_dir.
    Each attempted tick publishes a started record before calling OfficialWatch; failed
    and interrupted attempts count. Editing the bound config cannot extend authorization.
    """

    @staticmethod
    def install(config: str | Path) -> dict:
        _mac_only()
        task = _load(config)
        if _now() >= task.expires_at:
            raise ScheduleError("schedule_expired", "Schedule has expired; no automatic renewal.")
        python = _ROOT / ".venv/bin/python"
        if not python.is_file() or not os.access(python, os.X_OK):
            raise ScheduleError("venv_unavailable", "Install the repository .venv Python before scheduling.")
        desired = _plist(task)
        if (task.run_dir.exists() and not _binding(task).exists()
                and any(child.name != "schedule.lock" for child in task.run_dir.iterdir())):
            raise ScheduleError("invalid_schedule_path", "run_dir must be dedicated and empty before first install.")
        task.run_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        with _lock(task):
            owned = _owned(task)
            if len(_runs(task)) >= task.max_runs:
                raise ScheduleError("schedule_exhausted", "All scheduled tick starts are used; no automatic renewal.")
            loaded, _ = _native_print(task)
            if loaded and not owned:
                raise ScheduleError("unowned_schedule", "This label is loaded without an ownership record; refusing to adopt it.")
            if not owned:
                if any(child.name != "schedule.lock" for child in task.run_dir.iterdir()):
                    raise ScheduleError("invalid_schedule_path", "run_dir must be dedicated and empty before first install.")
                _publish(_binding(task), {"schema_version": 1, "label": task.label,
                                          "config_sha256": task.fingerprint, "schedule_sha256": task.schedule_fingerprint})
            if not task.plist.exists():
                _publish(task.plist, desired)
            if not loaded:
                result = _launchctl("bootstrap", f"gui/{os.getuid()}", str(task.plist))
                if result.returncode:
                    raise ScheduleError("launchctl_failed", f"launchctl bootstrap failed (exit {result.returncode}); no tick was started.")
                confirmed, _ = _native_print(task)
                if not confirmed:
                    raise ScheduleError("launchctl_failed", "launchctl bootstrap succeeded but print did not find this task.")
        return {"schema_version": 1, "status": "already_installed" if loaded else "installed",
                "label": task.label, "native_target": task.target, "plist": str(task.plist)}

    @staticmethod
    def status(config: str | Path) -> dict:
        _mac_only()
        task = _load(config, require_inputs=False)
        owned = _owned(task, strict=False)
        records = _runs(task) if owned else []
        loaded, native_output = _native_print(task)  # Actual launchctl state, never a plist-only claim.
        remaining = max(task.max_runs - len(records), 0)
        return {"schema_version": 1, "status": "installed" if loaded and owned else
                "unowned_native_job" if loaded else "not_installed", "label": task.label,
                "native_target": task.target, "native_loaded": loaded, "native_print": native_output,
                "plist": str(task.plist), "interval_seconds": task.interval_seconds,
                "max_runs": task.max_runs, "expires_at": task.expires_at.isoformat(),
                "expired": _now() >= task.expires_at, "run_starts": len(records),
                "remaining_runs": remaining, "runs": records}

    @staticmethod
    def remove(config: str | Path) -> dict:
        _mac_only()
        task = _load(config, require_inputs=False)
        if not task.run_dir.exists():
            loaded, _ = _native_print(task)
            if loaded:
                raise ScheduleError("unowned_schedule", "Native job exists without this repository's ownership record.")
            return {"schema_version": 1, "status": "not_installed", "native_target": task.target}
        with _lock(task):
            owned = _owned(task, strict=False)
            loaded, _ = _native_print(task)
            if loaded and not owned:
                raise ScheduleError("unowned_schedule", "Native job exists without this repository's ownership record.")
            if loaded:
                result = _launchctl("bootout", task.target)  # Never bootout a domain or another label.
                if result.returncode:
                    raise ScheduleError("launchctl_failed", f"launchctl bootout failed (exit {result.returncode}); plist retained.")
            had_plist = task.plist.exists()
            if owned and had_plist:
                task.plist.unlink()
        return {"schema_version": 1, "status": "removed" if loaded or had_plist else "not_installed",
                "native_target": task.target, "run_starts": len(_runs(task)) if owned else 0}

    @staticmethod
    def tick(config: str | Path) -> dict:
        _mac_only()
        task = _load(config)  # Validate all paths/plan before lock, records or source requests.
        if not task.run_dir.is_dir():
            raise ScheduleError("schedule_not_installed", "Install this native schedule before ticking.")
        with _lock(task, nonblocking=True) as acquired:
            if not acquired:
                return {"schema_version": 1, "status": "skipped", "reason": "overlap", "native_target": task.target}
            if not _owned(task) or not task.plist.exists():
                raise ScheduleError("schedule_not_installed", "Install this native schedule before ticking.")
            records = _runs(task)
            if len(records) >= task.max_runs:
                return {"schema_version": 1, "status": "skipped", "reason": "exhausted", "native_target": task.target,
                        "run_starts": len(records)}
            started_at = _now()  # The timestamp being recorded is the one checked for lifetime.
            if started_at >= task.expires_at:
                return {"schema_version": 1, "status": "skipped", "reason": "expired", "native_target": task.target,
                        "run_starts": len(records)}
            identifier = "schedule-" + uuid4().hex
            started = {"schema_version": 1, "id": identifier, "status": "started",
                       "config_sha256": task.fingerprint, "started_at": started_at.isoformat()}
            folder = task.run_dir / "runs" / identifier
            _publish(folder / "started.json", started)
            finished = {**started, "status": "failed", "completed_at": None, "source_run_id": None,
                        "source_status": None, "error": None}
            try:
                output = _run_watch(task)
                if not isinstance(output, dict):
                    raise ScheduleError("invalid_watch_result", "Official watch did not return a run record.")
                finished["source_run_id"] = output.get("id") or output.get("run_id")
                finished["source_status"] = output.get("status")
                if not isinstance(finished["source_run_id"], str) or not finished["source_run_id"]:
                    raise ScheduleError("invalid_watch_result", "Official watch did not provide its actual run ID.")
                if finished["source_status"] not in {"baseline_captured", "new_publication_links", "no_new_publication_links",
                                                     "check_failed", "not_checked", "check_incomplete"}:
                    raise ScheduleError("invalid_watch_result", "Official watch returned an unknown check status.")
                if output.get("error") is not None or output.get("status") in {"error", "failed", "check_failed", "not_checked", "check_incomplete"}:
                    error = output.get("error")
                    problem = dict(error) if isinstance(error, dict) else {"code": "official_watch_failed", "message": "Official watch returned failure."}
                    sources = [{"watch_id": source.get("watch_id"), "error": source["error"]}
                               for source in output.get("sources", []) if isinstance(source, dict) and isinstance(source.get("error"), dict)]
                    if sources:
                        problem["sources"] = sources
                    finished["error"] = problem
                else:
                    finished["status"] = "completed"
            except Exception as error:
                # A typed watcher error exposes its safe message; unknown exceptions only
                # expose their class, never a possibly credential-bearing repr/string.
                code = getattr(error, "code", "official_watch_failed")
                message = getattr(error, "message", type(error).__name__)
                finished["error"] = {"code": code, "message": message}
            finished["completed_at"] = _now().isoformat()
            _publish(folder / "completed.json", finished)
            return finished


def main(argv: list[str] | None = None) -> int:
    import argparse
    parser = argparse.ArgumentParser(description="Finite macOS launchd interval for the fixed official watcher.")
    parser.add_argument("--config", type=Path, required=True, help="Repository-owned v1 JSON schedule config")
    mode = parser.add_mutually_exclusive_group(required=True)
    for name in ("install", "status", "remove", "tick"):
        mode.add_argument("--" + name, action="store_true")
    args = parser.parse_args(argv)
    try:
        action = next(name for name in ("install", "status", "remove", "tick") if getattr(args, name))
        result = getattr(Schedule, action)(args.config)
    except ScheduleError as error:
        result = {"schema_version": 1, "status": "error", "error": {"code": error.code, "message": error.message}}
    except OSError as error:
        result = {"schema_version": 1, "status": "error", "error": {"code": "schedule_io_failed", "message": type(error).__name__}}
    print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
    return 1 if result["status"] in {"error", "failed"} else 0


if __name__ == "__main__":
    raise SystemExit(main())
