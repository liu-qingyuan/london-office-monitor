"""One bounded source-candidate check; never verify or publish market facts."""
from __future__ import annotations

import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4
from .discovery import DiscoveryBudget, DiscoveryError, GoogleDiscovery, _receipt_lock
from .source_pool import SourcePool, TOPICS


def _now():
    return datetime.now(timezone.utc)


def _save(path: Path, value: dict):
    """Publish a complete immutable file, like the existing SourcePool archive."""
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + "." + uuid4().hex + ".pending")
    try:
        with temporary.open("x", encoding="utf-8") as file:
            json.dump(value, file, ensure_ascii=False, indent=2)
            file.write("\n")
        os.link(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _metadata(candidate: dict, run_id: str | None = None):
    occurrence = next(o for o in reversed(candidate["occurrences"]) if run_id is None or o["run_id"] == run_id)
    return tuple(occurrence.get(key) for key in ("title", "snippet", "date_hint"))


class _MonitoringBudget(DiscoveryBudget):
    """Guard the original budget Seam before every account/search HTTP start."""
    def __init__(self, path: Path | None, plan_sha256: str):
        super().__init__(path)
        self.plan_sha256 = plan_sha256

    def change(self, action):
        def authorized(data):
            grant = data.get("source_monitoring")
            if not isinstance(grant, dict) or grant.get("purpose") != "source_candidates_only" or grant.get("plan_sha256") != self.plan_sha256:
                raise DiscoveryError("monitoring_authorization_required", "A fresh source-candidate monitoring grant bound to this plan is required; historical receipts are not renewed.")
            try:
                start = datetime.fromisoformat(grant["authorized_at"])
                expiry = datetime.fromisoformat(grant["expires_at"])
                if start.tzinfo is None or expiry.tzinfo is None or start >= expiry:
                    raise ValueError
            except (KeyError, TypeError, ValueError):
                raise DiscoveryError("invalid_monitoring_authorization", "Monitoring authorization needs explicit timezone-aware start and expiry.") from None
            if not start <= _now() < expiry:
                raise DiscoveryError("monitoring_authorization_expired", "Monitoring grant is not currently valid; no renewal or request retry.")
            for cap, count in ((grant.get("run_start_cap"), grant.get("run_starts")),
                               (data.get("serpapi_search_http_start_cap"), data.get("serpapi_search_http_starts"))):
                if not all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in (cap, count)) or count > cap:
                    raise DiscoveryError("invalid_monitoring_authorization", "Explicit finite monitoring and Google start caps/counts are required.")
            action(data)
        return super().change(authorized)


class SourceMonitor:
    def __init__(self, pool: SourcePool, budget_file: Path | None = None):
        self.pool, self.budget_file = pool, budget_file
        self.directory = pool.directory / "monitoring"

    @staticmethod
    def preview(plan: dict) -> dict:
        """Validate a single explicit search plan without I/O or authorization."""
        if (not isinstance(plan, dict) or set(plan) != {"schema_version", "query", "topic_ids"}
                or type(plan["schema_version"]) is not int or plan["schema_version"] != 1):
            raise DiscoveryError("invalid_monitoring_plan", "Use a v1 plan with only query and topic_ids.")
        query, topics = plan["query"], plan["topic_ids"]
        if not isinstance(query, str) or not query.strip() or len(query) > 500:
            raise DiscoveryError("invalid_monitoring_plan", "Plan query must contain 1–500 characters.")
        if not isinstance(topics, list) or not 1 <= len(topics) <= len(TOPICS) or any(not isinstance(t, str) or t not in TOPICS for t in topics):
            raise DiscoveryError("invalid_monitoring_plan", "Plan must select known discovery topic IDs.")
        canonical = {"schema_version": 1, "query": query.strip(), "topic_ids": sorted(set(topics))}
        digest = hashlib.sha256(json.dumps(canonical, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
        return {"plan": canonical, "plan_sha256": digest, "searches_per_run": 1,
                "publication_check_status": "not_checked", "formal_market_updated": False}

    def run(self, plan: dict) -> dict:
        """One Google metadata attempt, using new plan-bound finite authorization.

        New/changed candidates stay unverified. A failed or interrupted check
        retains previous valid metadata and never edits the Market snapshot.
        Run starts also cap failed account/quota checks; starts are never refunded.
        """
        preview = self.preview(plan)
        plan, digest = preview["plan"], preview["plan_sha256"]
        budget = _MonitoringBudget(self.budget_file, digest)
        self.pool.directory.mkdir(parents=True, exist_ok=True)
        # Manual and future scheduled invocations share this process-safe lock.
        with _receipt_lock(self.pool.directory / "monitoring.lock"):
            def reserve(data):
                grant = data["source_monitoring"]
                if grant["run_starts"] >= grant["run_start_cap"]:
                    raise DiscoveryError("monitor_run_budget_exhausted", "Authorized monitoring starts exhausted; no automatic renewal.")
                grant["run_starts"] += 1
            budget.change(reserve)
            previous = [r for r in self.view()["runs"] if r["plan_sha256"] == digest and r["status"] in {"pending_verification", "no_new_candidates"}]
            last_valid = previous[-1]["source_run_id"] if previous else None
            before = {c["id"]: c for c in self.pool.view()["candidates"]}
            identifier = "monitor-" + uuid4().hex
            result = {"schema_version": 1, "data_kind": "source_candidate_monitor_run", "id": identifier,
                "plan_sha256": digest, "query": plan["query"], "topic_ids": plan["topic_ids"],
                "started_at": _now().isoformat(), "completed_at": None, "checked_at": None,
                "status": "check_incomplete", "source_run_id": None, "discovery_status": None,
                "last_valid_source_run_id": last_valid, "previous_valid_source_run_id": last_valid,
                "candidate_ids": [], "new_candidate_ids": [], "metadata_changed_candidate_ids": [],
                "metadata_evidence": None, "error": None,
                "publication_check_status": "not_checked", "formal_market_updated": False,
                "warnings": ["A candidate check is not a source-content or publication check; no new candidates does not prove no new publication.",
                             "Changed metadata or response hashes do not establish a new market observation, revision or event."]}
            directory = self.directory / identifier
            _save(directory / "started.json", result)
            discovery = GoogleDiscovery(self.pool, self.budget_file, request_id=identifier)
            discovery.budget = budget  # Same private I/O/budget Seam, with monitoring grant guard.
            try:
                output = discovery.search(plan["query"], topic_ids=plan["topic_ids"],
                    context={"monitoring_run_id": identifier, "plan_sha256": digest})
                source_run = output["run"]["id"]
                candidates = output["candidates"]
                new = [c["id"] for c in candidates if c["id"] not in before]
                changed = [c["id"] for c in candidates if c["id"] in before and _metadata(c, source_run) != _metadata(before[c["id"]])]
                result.update(status="pending_verification" if new or changed else "no_new_candidates",
                    source_run_id=source_run, discovery_status=output["status"], last_valid_source_run_id=source_run,
                    checked_at=output["run"]["completed_at"], candidate_ids=[c["id"] for c in candidates],
                    new_candidate_ids=new, metadata_changed_candidate_ids=changed)
            except DiscoveryError as error:
                blocked = error.code in {"search_budget_exhausted", "discovery_authorization_required", "invalid_discovery_budget",
                                        "monitoring_authorization_required", "monitoring_authorization_expired", "invalid_monitoring_authorization"}
                result.update(status="not_checked" if blocked else "check_failed", error={"code": error.code, "message": error.message})
                captured = [r for r in self.pool.view()["runs"] if (r.get("intent_context") or {}).get("monitoring_run_id") == identifier]
                if captured:
                    result.update(source_run_id=captured[-1]["id"], discovery_status=captured[-1]["status"])
            if result["source_run_id"]:
                evidence = Path("evidence") / result["source_run_id"] / "search-response.json"
                response = self.pool.directory / evidence
                if response.exists():
                    result["metadata_evidence"] = {"path": evidence.as_posix(), "sha256": hashlib.sha256(response.read_bytes()).hexdigest()}
                elif result["checked_at"]:
                    raise ValueError("Completed monitoring metadata has no bound response evidence")
            result["completed_at"] = _now().isoformat()
            _save(directory / "result.json", result)
            return result

    def view(self) -> dict:
        """Read completed/incomplete monitoring records; never search or infer facts."""
        runs = []
        for path in self.directory.glob("*/started.json"):
            completed = path.parent / "result.json"
            record = json.loads((completed if completed.exists() else path).read_text(encoding="utf-8"))
            if record.get("schema_version") != 1 or record.get("data_kind") != "source_candidate_monitor_run":
                raise ValueError("Invalid monitoring archive; do not treat unreadable history as empty")
            runs.append(record)
        runs.sort(key=lambda r: (r["started_at"], r["id"]))
        topics = []
        for key, label in TOPICS.items():
            relevant = [r for r in runs if key in r["topic_ids"]]
            last = relevant[-1] if relevant else {}
            topics.append({"id": key, "label": label, "status": last.get("status", "not_checked"),
                "checked_at": last.get("checked_at"), "last_valid_source_run_id": last.get("last_valid_source_run_id"),
                "publication_check_status": "not_checked"})
        return {"schema_version": 1, "data_kind": "source_candidate_monitoring", "runs": runs, "topics": topics,
                "publication_check_status": "not_checked", "formal_market_updated": False}


def main():
    """Package-local CLI; no server, model session or unattended task is started."""
    import argparse
    from .settings import Settings
    parser = argparse.ArgumentParser(description="One bounded source-candidate check, not a formal market update.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--preview", action="store_true", help="Validate a plan and print its authorization fingerprint; no search")
    mode.add_argument("--status", action="store_true", help="Read monitoring history without checking sources")
    parser.add_argument("--plan", type=Path, help="Explicit single-query JSON plan")
    parser.add_argument("--budget-file", type=Path, help="Fresh operator-authorized monitoring receipt; never created/reset")
    args = parser.parse_args()
    try:
        if args.status:
            if args.plan or args.budget_file:
                raise DiscoveryError("invalid_monitoring_command", "Status is read-only; do not supply a plan or budget.")
            result = SourceMonitor(SourcePool(Settings.from_env().discovery_dir)).view()
        else:
            if not args.plan or args.plan.suffix.lower() != ".json" or args.plan.stat().st_size > 65_536:
                raise DiscoveryError("invalid_monitoring_plan", "Supply a single-query JSON plan of at most 64 KiB.")
            plan = json.loads(args.plan.read_text(encoding="utf-8"))
            if args.preview:
                if args.budget_file:
                    raise DiscoveryError("invalid_monitoring_command", "Preview does not use a budget receipt.")
                result = SourceMonitor.preview(plan)
            else:
                result = SourceMonitor(SourcePool(Settings.from_env().discovery_dir), args.budget_file).run(plan)
        print(json.dumps(result, ensure_ascii=False, indent=2), flush=True)
        return 0 if result.get("status") not in {"not_checked", "check_failed", "check_incomplete"} else 1
    except DiscoveryError as error:
        print(json.dumps({"status": "error", "error": {"code": error.code, "message": error.message}}, ensure_ascii=False), flush=True)
        return 1
    except (ValueError, OSError) as error:
        print(json.dumps({"status": "error", "error": {"code": "monitoring_failed", "message": str(error)}}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
