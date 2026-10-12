"""Read-only public status of the bounded official watcher and its native schedule.

This is a display projection of archived publication leads, not market observations.
No watcher run, schedule write action, receipt read, model or source request occurs here.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .data import ROOT
from .monitor_schedule import Schedule, ScheduleError, _load
from .official_watch import OfficialWatch, SOURCES, _approved_link

_VALID = {"baseline_captured", "new_publication_links", "no_new_publication_links"}
_OFFICE = re.compile(r"\b(?:london|office|west[ -]?end|st[ .-]?james|hanover|spring[ -]?gardens|piccadilly|haymarket|regent[ -]?street|commercial[ -]?property|workplace)\b", re.I)
_JOBS = re.compile(r"\b(?:jobs?|careers?|recruit(?:ment|ing|er|ers)?|hiring)\b", re.I)
_SERIES = "central london office market watch"
_LABELS = {"savills-central-london": "Savills Central London Office Market Watch",
           "crown-estate-news": "The Crown Estate news"}
_SCHEDULE_FIELDS = ("interval_seconds", "max_runs", "run_starts", "remaining_runs", "expires_at")


def _empty(state: str) -> dict:
    return {"schema_version": 1, "data_kind": "monitoring_status", "status": state,
            "last_checked_at": None,
            "schedule": {"state": "not_configured" if state == "not_configured" else "unknown",
                         **{key: None for key in _SCHEDULE_FIELDS}},
            "filter": {"mode": "official_office_keywords", "ai_used": False, "omitted_links": 0},
            "sources": [], "formal_market_updated": False, "warnings": []}


def _show_link(watch_id: str, link: dict) -> bool:
    if not isinstance(link, dict) or not isinstance(link.get("url"), str) or not isinstance(link.get("title"), str):
        return False
    url, title = link["url"], link["title"]
    if not title.strip() or watch_id not in SOURCES or _approved_link(url, SOURCES[watch_id], watch_id) != url:
        return False
    words = unquote(urlsplit(url).path) + " " + title
    if _JOBS.search(words):
        return False
    if watch_id == "savills-central-london":
        return _SERIES in title.casefold()
    return bool(_OFFICE.search(words))


def _schedule(config: Path, result: dict) -> None:
    if sys.platform != "darwin":
        result["schedule"]["state"] = "unsupported"
        return
    try:
        native = Schedule.status(config)  # Only this task's actual launchctl print; never plist inference.
    except (ScheduleError, OSError, ValueError):
        result["warnings"].append("Native schedule status could not be read; running state is unknown.")
        return
    result["schedule"].update({key: native.get(key) for key in _SCHEDULE_FIELDS})
    if native.get("status") == "not_installed" and native.get("native_loaded") is False:
        state = "stopped"
    elif native.get("status") == "installed" and native.get("native_loaded") is True:
        if native.get("remaining_runs") == 0:
            state = "exhausted"
        elif native.get("expired") is True:
            state = "expired"
        else:
            state = "running"
    else:
        state = "unknown"
        result["warnings"].append("Native schedule ownership or loaded state could not be confirmed.")
    result["schedule"]["state"] = state


def monitoring_status(directory: Path = ROOT / "var" / "monitoring") -> dict:
    """Project archived official checks and the current native label into a path-free DTO."""
    result = _empty("not_configured")
    ui = Path(directory) / "ui-config.json"
    if not ui.exists():
        return result
    result["status"] = "unavailable"
    result["schedule"]["state"] = "unknown"
    try:
        if ui.is_symlink() or not ui.is_file() or ui.stat().st_size > 65_536:
            raise ValueError("Invalid UI config")
        config = json.loads(ui.read_text(encoding="utf-8"))
        if (not isinstance(config, dict) or set(config) != {"schema_version", "schedule_config"}
                or type(config["schema_version"]) is not int or config["schema_version"] != 1
                or not isinstance(config["schedule_config"], str)):
            raise ValueError("Invalid UI config schema")
        task = _load(config["schedule_config"], require_inputs=False)  # Validates repository paths; no receipt/plan read.
    except (OSError, ValueError, UnicodeError, TypeError, ScheduleError):
        result["warnings"].append("Monitoring UI configuration could not be read or validated.")
        return result
    result["schedule"].update(interval_seconds=task.interval_seconds, max_runs=task.max_runs,
                              expires_at=task.expires_at.isoformat())
    _schedule(task.path, result)
    try:
        runs = OfficialWatch(task.run_dir / "official").view()["runs"]
        if not isinstance(runs, list):
            raise ValueError("Invalid official runs")
        latest: dict[str, dict] = {}
        valid: dict[str, dict] = {}
        for run in runs:
            present = set()
            for source in run["sources"]:
                watch_id = source["watch_id"]
                if watch_id not in SOURCES:
                    result["warnings"].append("Unknown official watch ID in archive; skipped.")
                    continue
                present.add(watch_id)
                latest[watch_id] = source
                if source["status"] in _VALID:
                    valid[watch_id] = source
            # A started-only archive has no source rows yet. Do not hide its
            # incomplete latest attempt behind an older successful source row.
            for watch_id in run["watch_ids"]:
                if watch_id in SOURCES and watch_id not in present:
                    latest[watch_id] = {"status": "check_incomplete"}
        checked = []
        for watch_id in SOURCES:
            if watch_id not in latest:
                continue
            current = latest[watch_id]
            last = valid.get(watch_id)
            links = last["publication_links"] if last else []
            new_urls = {link["url"] for link in last["new_publication_links"]} if last else set()
            displayed = [{"url": link["url"], "title": link["title"], "edition": link.get("edition"),
                          "published_at": None, "observation_period": None,
                          "is_new": link["url"] in new_urls}
                         for link in links if _show_link(watch_id, link)]
            result["filter"]["omitted_links"] += len(links) - len(displayed)
            timestamp = last["checked_at"] if last else None
            if timestamp:
                checked.append(timestamp)
            raw_status = current["status"]
            status = raw_status if raw_status in _VALID | {"check_failed", "not_checked", "check_incomplete"} else "unknown"
            if status not in _VALID:
                # Archive errors may contain private local details; only show bounded status/code.
                error = current.get("error") or {}
                code = error.get("code") if isinstance(error, dict) else None
                reason = code if isinstance(code, str) and re.fullmatch(r"[a-z_]{1,60}", code) else "unknown_error"
                result["warnings"].append(f"{watch_id}: latest check {status} ({reason}); showing last valid links if available.")
            result["sources"].append({"id": watch_id, "label": _LABELS[watch_id], "status": status,
                                      "checked_at": timestamp, "index_url": SOURCES[watch_id],
                                      "new_link_count": sum(link["is_new"] for link in displayed), "links": displayed})
        result["last_checked_at"] = max(checked, default=None)
        result["status"] = "available"
        if not runs:
            result["warnings"].append("No official checks are archived yet; no source coverage is established.")
    except (OSError, ValueError, TypeError, KeyError, UnicodeError):
        result["status"] = "unavailable"
        result["last_checked_at"] = None
        result["sources"] = []
        result["filter"]["omitted_links"] = 0
        result["warnings"].append("Official watch archive could not be read; no absence of new links is inferred.")
    return result
