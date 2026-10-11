"""Data's source-candidate archive, separate from the formal Market snapshot.

Reading never performs a search. Topic/context associations record user intent,
not verified document coverage. Original URL occurrences survive deduplication.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from uuid import uuid4
from .data import ROOT

TOPICS = {
    "rents": "Prime and Grade A rents",
    "vacancy": "Vacancy and availability",
    "leasing": "Leasing take-up and activity",
    "supply": "Development, refurbishment and pre-lets",
    "submarkets": "Submarket dynamics",
    "macro": "Interest rates, economy and employment",
    "demand": "Flight to quality, ESG and hybrid working",
    "news": "Emerging news and events",
}


class SourcePool:
    def __init__(self, directory: Path | None = None):
        self.directory = directory or ROOT / "var/discovery"

    def record(self, run: dict, occurrences: list[dict]) -> dict:
        """Persist one completed/failed/not-executed discovery without overwriting it.

        Accepts primitive business metadata, not SDK objects or market values.
        Coordinates and statistical coverage remain unverified in this first step.
        """
        identifier = run.get("id")
        if not isinstance(identifier, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", identifier):
            raise ValueError("Invalid discovery run identifier")
        if run.get("provider") not in {"serpapi_google", "codex_native"}:
            raise ValueError("Unknown discovery provider")
        if run.get("status") not in {"completed_metadata_only", "completed_no_candidates", "failed", "not_executed"}:
            raise ValueError("Invalid discovery execution status")
        topics = run.get("topic_ids")
        if not isinstance(topics, list) or not topics or any(topic not in TOPICS for topic in topics):
            raise ValueError("Discovery requires known business topic IDs")
        normalized = []
        for occurrence in occurrences:
            url = occurrence.get("url")
            if not isinstance(url, str) or urlsplit(url).scheme not in {"http", "https"} or not urlsplit(url).hostname:
                raise ValueError("Source candidate URL must be HTTP/HTTPS, not a tool command")
            item = {key: occurrence.get(key) for key in ["url", "title", "snippet", "date_hint", "provider_path", "provider_position", "provider_query", "ref_id", "thread_id", "turn_id", "tool_item_id"]}
            normalized.append(item)
        record = {"schema_version": 1, "data_kind": "source_candidate_run",
            "recorded_at": datetime.now(timezone.utc).isoformat(),
            "run": {key: run.get(key) for key in ["id", "provider", "query", "topic_ids", "intent_context", "status", "started_at", "completed_at", "elapsed_seconds", "error"]},
            "occurrences": normalized}
        text = json.dumps(record, ensure_ascii=False, indent=2)
        directory = self.directory / "records"
        directory.mkdir(parents=True, exist_ok=True)
        temporary = directory / f"{identifier}.{uuid4().hex}.pending"
        try:
            with temporary.open("x", encoding="utf-8") as file:
                file.write(text + "\n")
            # Atomic visibility plus no replacement: concurrent UI reads see only
            # complete immutable records, never a half-written JSON document.
            os.link(temporary, directory / f"{identifier}.json")
        finally:
            temporary.unlink(missing_ok=True)
        return self.view()

    def view(self) -> dict:
        """Read all archived candidates and execution states; never search/infer facts."""
        records = []
        for path in sorted((self.directory / "records").glob("*.json")):
            record = json.loads(path.read_text(encoding="utf-8"))
            if record.get("schema_version") != 1 or record.get("data_kind") != "source_candidate_run":
                raise ValueError("Invalid source-candidate archive; do not treat unreadable data as empty")
            records.append(record)
        records.sort(key=lambda item: item["recorded_at"])
        runs = [record["run"] for record in records]
        candidates = {}
        occurrence_count = 0
        for record in records:
            run = record["run"]
            for item in record["occurrences"]:
                url = item["url"]
                occurrence_count += 1
                if url not in candidates:
                    candidates[url] = {"id": "source-" + hashlib.sha256(url.encode()).hexdigest(),
                        "url": url, "title": item.get("title"), "snippet": item.get("snippet"),
                        "date_hint": item.get("date_hint"), "content_basis": "search_metadata",
                        "verification_status": "unverified_search_metadata",
                        "source_geography": {"status": "not_verified", "granularity": None},
                        "requested_topics": [], "occurrences": []}
                candidate = candidates[url]
                candidate["requested_topics"] = list(dict.fromkeys(candidate["requested_topics"] + run["topic_ids"]))
                candidate["occurrences"].append({**item, "run_id": run["id"], "provider": run["provider"], "query": item.get("provider_query") or run["query"], "topic_ids": run["topic_ids"]})
        topics = []
        for key, label in TOPICS.items():
            relevant = [run for run in runs if key in run["topic_ids"]]
            completed = [run for run in relevant if run["status"] in {"completed_metadata_only", "completed_no_candidates"}]
            source_count = sum(key in candidate["requested_topics"] for candidate in candidates.values())
            if not relevant:
                status = "not_searched"
            elif completed:
                status = "metadata_unavailable" if not source_count else ("metadata_collected" if len(completed) == len(relevant) else "partial")
            elif any(run["status"] == "failed" for run in relevant):
                status = "failed"
            else:
                status = "not_executed"
            topics.append({"id": key, "label": label, "status": status,
                "source_count": source_count, "completed_searches": len(completed)})
        return {"schema_version": 1, "data_kind": "source_candidates", "topics": topics,
            "candidates": list(candidates.values()), "runs": runs,
            "source_count": len(candidates), "occurrence_count": occurrence_count,
            "warnings": ["Search metadata is a source lead, not verified evidence or a market observation.",
                         "Search topics and selected areas are intent, not proven source coverage.",
                         "Metadata date hints are not verified publication dates. Exact-URL deduplication retains every occurrence."]}
