"""User-supplied research intake: immutable batches, evidence guards and explicit admission.

This Module does not fetch source URLs or infer facts from search metadata. Admission
requires a locally matched excerpt and an explicit authorization of this batch.
"""
from __future__ import annotations

import base64
import binascii
import copy
import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse
from uuid import uuid4

from .data import ROOT, Snapshot, normalize_text, read_document
from .storage import atomic_json, file_lock

_DOCUMENT_KEYS = frozenset({"id", "filename", "content_base64", "url", "publisher", "title", "published_at", "usage_note"})
_CANDIDATE_KEYS = frozenset({"id", "document_id", "topic_ids", "kind", "metric", "label", "value", "unit", "source_geography", "statistical_window", "definition", "denominator", "billing_period", "release_vintage", "quote", "context_quote", "section", "value_anchor"})
_REPORTED_KINDS = frozenset({"reported_statistic", "source_period_actual", "actual_flow", "stock"})
_CAVEAT = "User-supplied local document excerpt matched; publisher, URL, date and market interpretation were not independently verified online."
_CONFLICT_CAVEAT = "Conflicting same-definition reported values retained; no single value or automatic comparison selected."
_NUMBER = r"[+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?"


class ResearchIntakeError(ValueError):
    """Safe input/state error; ``code`` is suitable for an HTTP error response."""

    def __init__(self, code: str, message: str):
        self.code = code
        self.message = message
        super().__init__(message)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _text(value, field: str, *, nullable=False, max_length=600) -> str | None:
    if value is None and nullable:
        return None
    if not isinstance(value, str) or len(value) > max_length:
        raise ResearchIntakeError("invalid_input", f"{field} must be a bounded string.")
    return value.strip()


def _reason(code: str, message: str, ids=()) -> dict:
    return {"code": code, "message": message, "related_record_ids": list(dict.fromkeys(ids))}


def _identity(row: dict, *, definition=True) -> tuple:
    keys = ("metric", "kind", "source_geography", "statistical_window", "definition", "unit", "denominator", "billing_period")
    return tuple((row.get(key) or "").strip().casefold() if isinstance(row.get(key), str) else row.get(key)
                 for key in keys if definition or key != "definition")


def _value(row: dict) -> Decimal:
    return Decimal(str(row["value"]))


def _revision(batch_id: str, documents: list[dict], candidates: list[dict]) -> str:
    content = {"batch_id": batch_id, "documents": documents, "candidates": candidates}
    return hashlib.sha256(json.dumps(content, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")).hexdigest()


def _unit_pattern(unit: str) -> str | None:
    if unit == "%":
        return rf"(?<![\w.])(?P<number>{_NUMBER})\s*%(?!\w)"
    if unit == "GBP/sq ft":
        return rf"(?<![\w.])(?:£\s*(?P<pounds>{_NUMBER})\s*(?:per|/)\s*sq\s*ft|(?P<gbp>{_NUMBER})\s*GBP/sq\s*ft)(?!\w)"
    # Other units require a literal and adjacent unit, not a nearby arbitrary number.
    if not unit or len(unit) > 60 or not re.fullmatch(r"[A-Za-z][A-Za-z0-9 /%²-]*", unit):
        return None
    return rf"(?<![\w.])(?P<number>{_NUMBER})\s*(?P<scale>million|thousand|m|k)?\s*{re.escape(unit)}(?!\w)"


def _anchor_value(anchor: str, unit: str) -> Decimal | None:
    pattern = _unit_pattern(unit)
    if pattern is None:
        return None
    match = re.fullmatch(pattern, normalize_text(anchor), re.IGNORECASE)
    if not match:
        return None
    try:
        captured = match.groupdict()
        number = Decimal((captured.get("number") or captured.get("pounds") or captured.get("gbp")).replace(",", "").replace("−", "-"))
        scale = (match.groupdict().get("scale") or "").lower()
        return number * {"million": 1_000_000, "m": 1_000_000, "thousand": 1_000, "k": 1_000}.get(scale, 1)
    except (InvalidOperation, TypeError):
        return None


def _quoted_clause(quote: str, anchor: str) -> str:
    """Only words in the anchor's clause qualify as an automatic field binding."""
    start = normalize_text(quote).find(normalize_text(anchor))
    if start < 0:
        return ""
    quote = normalize_text(quote)
    separators = [m.start() for m in re.finditer(r";|(?<!\d)\.(?!\d)|[!?]", quote)]
    left = max((n for n in separators if n < start), default=-1) + 1
    right = min((n for n in separators if n >= start), default=len(quote))
    return quote[left:right].strip()


class ResearchIntake:
    """Stage uploaded bytes, inspect candidates, then authorize only one immutable batch.

    ``directory`` is a dedicated ignored local directory. Views never include whole
    documents; authorized scalar records enter only the separate accepted overlay.
    State and admission are one cross-process locked atomic JSON replacement.
    """

    def __init__(self, directory: Path, baseline_path: Path | None = None):
        self.directory = Path(directory)
        self.path = self.directory / "state.json"
        self.lock_path = self.directory / "state.lock"
        self.baseline_path = baseline_path or ROOT / "data/snapshot.json"

    def _baseline(self) -> list[dict]:
        research = Snapshot(self.baseline_path).research(include_overlay=False)
        return research.get("records", [])

    def _load(self) -> dict:
        if self.path.is_symlink() or self.directory.is_symlink():
            raise ResearchIntakeError("invalid_intake_state", "Linked intake state is not a dedicated local archive.")
        if not self.path.exists():
            return {"schema_version": 1, "data_kind": "research_intake_state", "revision": 0,
                    "batches": {}, "accepted": {"records": [], "sources": [], "evidence": []}, "conflicts": []}
        try:
            state = json.loads(self.path.read_text(encoding="utf-8"))
            if (not isinstance(state, dict) or set(state) != {"schema_version", "data_kind", "revision", "batches", "accepted", "conflicts"}
                or state["schema_version"] != 1 or state["data_kind"] != "research_intake_state"
                or type(state["revision"]) is not int or state["revision"] < 0
                or not isinstance(state["batches"], dict) or not isinstance(state["conflicts"], list)):
                raise ValueError("Invalid intake state header")
            accepted = state["accepted"]
            if (not isinstance(accepted, dict) or set(accepted) != {"records", "sources", "evidence"}
                or any(not isinstance(accepted[key], list) for key in accepted)):
                raise ValueError("Invalid accepted research")
            for identifier, batch in state["batches"].items():
                if (not isinstance(batch, dict) or batch.get("id") != identifier or not isinstance(batch.get("content_revision"), str)
                    or not isinstance(batch.get("documents"), list) or not isinstance(batch.get("candidates"), list)
                    or not isinstance(batch.get("created_at"), str) or batch.get("authorized_at") is not None and not isinstance(batch.get("authorized_at"), str)):
                    raise ValueError("Invalid batch")
                for item in batch["candidates"]:
                    if (not isinstance(item, dict) or not isinstance(item.get("id"), str) or
                        not isinstance(item.get("input"), dict) or not isinstance(item.get("record"), dict) or
                        not isinstance(item.get("sources"), list) or not isinstance(item.get("evidence"), list) or
                        item.get("state") not in {"unapproved", "accepted", "awaiting_confirmation", "blocked", "rejected", "duplicate"}):
                        raise ValueError("Invalid stored candidate")
                if batch["content_revision"] != _revision(identifier, batch["documents"], [item["input"] for item in batch["candidates"]]):
                    raise ValueError("Batch content changed without a new authorization revision")
            if state["conflicts"]:
                admitted_ids = {row["id"] for row in [*self._baseline(), *accepted["records"]]}
                for conflict in state["conflicts"]:
                    if not isinstance(conflict, dict) or not isinstance(conflict.get("record_ids"), list) or not isinstance(conflict.get("reason"), str):
                        raise ValueError("Malformed conflict")
                    ids = conflict["record_ids"]
                    if len(ids) < 2 or len(set(ids)) != len(ids) or not set(ids) <= admitted_ids:
                        raise ValueError("Only already admitted records can enter the conflict ledger")
            return state
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError, TypeError, KeyError) as exc:
            raise ResearchIntakeError("invalid_intake_state", "The intake state is incomplete or damaged; no data was replaced.") from exc

    def _document(self, raw: dict) -> tuple[dict, bytes]:
        if not isinstance(raw, dict) or set(raw) != _DOCUMENT_KEYS:
            raise ResearchIntakeError("invalid_document", "Document fields must exactly match the upload contract; paths and verification flags are not accepted.")
        identifier = _text(raw["id"], "document id", max_length=100)
        filename = _text(raw["filename"], "filename", max_length=180)
        if not identifier or not filename or filename in {".", ".."} or "/" in filename or "\\" in filename:
            raise ResearchIntakeError("invalid_document", "Use a document id and a filename, not a local path.")
        suffix = Path(filename).suffix.lower()
        if suffix not in {".pdf", ".html", ".htm", ".txt"}:
            raise ResearchIntakeError("invalid_document", "Only PDF, HTML, HTM and TXT uploads are supported.")
        url = _text(raw["url"], "url", max_length=2048)
        try:
            parsed = urlparse(url)
            valid_url = (parsed.scheme == "https" and bool(parsed.hostname) and not parsed.username
                         and not parsed.password and parsed.port in {None, 443})
        except ValueError:
            valid_url = False
        if not valid_url:
            raise ResearchIntakeError("invalid_document", "A public HTTPS parent URL is required; it is not online-verified.")
        metadata = {key: _text(raw[key], key, nullable=(key == "published_at"), max_length=500)
                    for key in ("publisher", "title", "published_at", "usage_note")}
        if not metadata["publisher"] or not metadata["title"]:
            raise ResearchIntakeError("invalid_document", "Publisher and title must be supplied as unverified user metadata.")
        date = metadata["published_at"]
        if date is not None and not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?", date):
            raise ResearchIntakeError("invalid_document", "published_at must be YYYY-MM, YYYY-MM-DD or null.")
        encoded = raw["content_base64"]
        if not isinstance(encoded, str) or len(encoded) > 6_666_672:
            raise ResearchIntakeError("invalid_document", "Upload exceeds the five-megabyte processing limit.")
        try:
            body = base64.b64decode(encoded, validate=True)
        except (binascii.Error, ValueError) as exc:
            raise ResearchIntakeError("invalid_document", "Upload must contain valid base64 bytes.") from exc
        if not body or len(body) > 5_000_000:
            raise ResearchIntakeError("invalid_document", "Upload must contain at most five megabytes of bytes.")
        digest = hashlib.sha256(body).hexdigest()
        return {"id": identifier, "filename": filename, "sha256": digest, "suffix": suffix, "url": url, **metadata}, body

    def _candidate(self, raw: dict, documents: dict) -> dict:
        if not isinstance(raw, dict) or set(raw) != _CANDIDATE_KEYS:
            raise ResearchIntakeError("invalid_candidate", "Candidate fields must exactly match the bounded research contract; verification flags are not accepted.")
        result = {}
        for key in _CANDIDATE_KEYS - {"topic_ids", "value"}:
            result[key] = _text(raw[key], key, nullable=key in {"denominator", "billing_period", "release_vintage"},
                                max_length=600 if key in {"quote", "context_quote"} else 300)
        if not result["id"] or not result["document_id"] or result["document_id"] not in documents:
            raise ResearchIntakeError("invalid_candidate", "Candidate requires an id and a document from this batch.")
        topics = raw["topic_ids"]
        if (not isinstance(topics, list) or not topics or len(topics) > 8 or
            any(not isinstance(topic, str) or not topic or len(topic) > 100 for topic in topics) or len(set(topics)) != len(topics)):
            raise ResearchIntakeError("invalid_candidate", "topic_ids must be a nonempty list of distinct topic ids.")
        result["topic_ids"] = topics[:]
        value = raw["value"]
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ResearchIntakeError("invalid_candidate", "A scalar reported value must be finite and numeric.")
        result["value"] = value
        return result

    def _store_document(self, info: dict, body: bytes):
        folder = self.directory / "documents"
        if folder.is_symlink():
            raise ResearchIntakeError("invalid_document_state", "Captured documents must use the dedicated local archive.")
        folder.mkdir(parents=True, exist_ok=True)
        path = folder / (info["sha256"] + info["suffix"])
        if path.exists():
            if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != info["sha256"]:
                raise ResearchIntakeError("invalid_document_state", "A captured document is damaged; no batch was published.")
            return
        temporary = folder / (uuid4().hex + ".tmp")
        try:
            with temporary.open("xb") as output:
                output.write(body)
                output.flush()
                os.fsync(output.fileno())
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)

    def _document_text(self, info: dict) -> str:
        path = self.directory / "documents" / (info["sha256"] + info["suffix"])
        try:
            if path.is_symlink() or hashlib.sha256(path.read_bytes()).hexdigest() != info["sha256"]:
                raise ValueError("Document bytes do not match the stored hash")
            text = read_document(path)
            if len(text) > 5_000_000:
                raise ValueError("Extracted text exceeds the processing limit")
            return normalize_text(text)
        except Exception as exc:
            # A missing, modified or unreadable captured document must not release a value.
            raise ResearchIntakeError("invalid_document_state", "Captured document cannot be read or matched; no data was accepted.") from exc

    def _item(self, batch_id: str, raw: dict, info: dict, now: str) -> dict:
        # Backend-owned, stable within this immutable batch, and bound to its client id.
        bound_id = hashlib.sha256(f"{batch_id}\0{raw['id']}".encode("utf-8")).hexdigest()[:24]
        identifier = f"intake-{batch_id}-{bound_id}"
        source_id, evidence_id = "source-" + identifier, "evidence-" + identifier
        source = {"id": source_id, "publisher": info["publisher"], "title": info["title"], "url": info["url"],
                  "published_at": info["published_at"], "publication_precision": ("day" if info["published_at"] and len(info["published_at"]) == 10 else "month" if info["published_at"] else None),
                  "report_period": raw["statistical_window"], "retrieved_at": now,
                  "verification_status": "user_supplied_document_excerpt_not_live", "usage_note": info["usage_note"]}
        evidence = {"id": evidence_id, "source_id": source_id, "section": raw["section"], "quote": raw["quote"],
                    "context_quote": raw["context_quote"], "source_parent_url": info["url"],
                    "document_sha256": info["sha256"], "content_basis": "user_supplied_document",
                    "verification_basis": "not_checked_local_document"}
        record = {"id": identifier, "topic_ids": raw["topic_ids"], "kind": raw["kind"], "metric": raw["metric"],
                  "label": raw["label"], "value": raw["value"], "unit": raw["unit"],
                  "display_value": raw["value_anchor"], "status": "available", "source_geography": raw["source_geography"],
                  "statistical_window": raw["statistical_window"], "release_vintage": raw["release_vintage"],
                  "forecast_as_of": None, "target_window": None, "definition": raw["definition"],
                  "denominator": raw["denominator"], "billing_period": raw["billing_period"],
                  "source_ids": [source_id], "evidence_ids": [evidence_id], "caveats": [_CAVEAT],
                  "map_binding": None, "reference_observation_ids": []}
        return {"id": identifier, "input": raw, "record": record, "sources": [source], "evidence": [evidence],
                "assessment": {"status": "blocked", "reasons": []}, "state": "unapproved"}

    def _grounding(self, item: dict, doc_text: str) -> tuple[str, list[dict]]:
        raw = item["input"]
        if raw["kind"] not in _REPORTED_KINDS:
            return "blocked", [_reason("unsupported_kind", "Only directly reported scalar statistics, stocks and actual flows are supported; no forecast or event extraction.")]
        quote, context, anchor = raw["quote"], raw["context_quote"], raw["value_anchor"]
        if not quote or normalize_text(quote) not in doc_text or context and normalize_text(context) not in doc_text:
            return "blocked", [_reason("excerpt_not_in_document", "The short quote/context must match the stored local document text, not only a submitted excerpt.")]
        pattern = _unit_pattern(raw["unit"])
        if not anchor or not pattern or _anchor_value(anchor, raw["unit"]) != _value(item["record"]):
            return "blocked", [_reason("value_not_supported", "The exact value anchor must support this number with its stated unit.")]
        matches = list(re.finditer(pattern, normalize_text(quote), re.IGNORECASE))
        anchored = [m for m in matches if normalize_text(m.group()) == normalize_text(anchor)]
        if not anchored:
            return "blocked", [_reason("value_not_in_quote", "The complete value and unit anchor must occur as an independent value in the matched short quote.")]
        reasons = []
        if len(matches) > 1:
            reasons.append(_reason("multiple_value_bindings", "More than one same-unit value occurs in the excerpt; confirm which fact the anchor describes."))
        original_clause = _quoted_clause(quote, anchor)
        quote_start = doc_text.find(normalize_text(quote))
        source_clause = _quoted_clause(doc_text[quote_start:], anchor)
        preceding = re.split(r";|(?<!\d)\.(?!\d)|[!?]", doc_text[:quote_start].rstrip(" .:;!?"))[-1][-160:]
        forecast_context = " ".join((original_clause, source_clause, preceding, raw["section"], context))
        if re.search(r"\b(?:forecast(?:ed|s)?|project(?:ed|ions?)|predict(?:ed|ions?)|anticipated|expected\s+to|will\s+(?:be|reach|rise|fall|increase|decrease))\b", forecast_context, re.IGNORECASE):
            return "blocked", [_reason("forecast_not_reported_actual", "A forecast or expected value is not a reported actual in this scalar intake.")]
        clause = original_clause.casefold()
        geography = re.escape(raw["source_geography"])
        if geography and re.search(
            rf"(?:\b{geography}\b\s+(?:and|or|&|/)\s+(?:[A-Z][\w-]*\s*){{1,3}}|"
            rf"\b(?:[A-Z][\w-]*\s+){{1,3}}(?:and|or|&|/)\s+{geography}\b)", original_clause, re.IGNORECASE
        ):
            reasons.append(_reason("geography_ambiguous", "A combined source geography cannot be assigned to one named part automatically."))
        if raw["source_geography"].casefold() == "london" and re.search(r"\b(?:central|greater|inner|outer)\s+london\b", clause):
            reasons.append(_reason("geography_ambiguous", "A qualified London reporting area cannot be assigned to unqualified London automatically."))
        for key in ("source_geography", "statistical_window", "definition", "unit", "denominator", "billing_period"):
            value = raw[key]
            if key == "unit":
                continue  # The exact numeric anchor has already bound the unit.
            if value is None and key in {"denominator", "billing_period"}:
                # Null is not a fabricated ratio/billing period. An unknown ratio basis
                # needs human review; absolute amounts do not acquire a denominator.
                if key == "denominator" and (raw["unit"] == "%" or "share" in raw["metric"].casefold()):
                    reasons.append(_reason("denominator_unknown", "The required population/ratio denominator is unknown."))
                continue
            if not value or not re.search(r"(?<![\w-])" + re.escape(normalize_text(value).casefold()) + r"(?![\w-])", clause):
                reasons.append(_reason("field_binding_uncertain", f"{key} is not unambiguously bound to the value in its excerpt clause."))
        metric_words = raw["metric"].replace("_", " ").casefold()
        metric_phrases = {metric_words}
        if raw["metric"] == "prime_rent":
            metric_phrases.add("prime achieved rent")
        if not any(phrase in clause or phrase in raw["definition"].casefold() for phrase in metric_phrases):
            reasons.append(_reason("metric_binding_uncertain", "The metric is not identified in the value clause or stated definition."))
        return ("needs_confirmation" if reasons else "eligible"), reasons

    def _assess(self, state: dict, batch: dict):
        baseline = self._baseline()
        accepted = state["accepted"]["records"]
        documents = {d["id"]: self._document_text(d) for d in batch["documents"]}
        grounded = {}
        for item in batch["candidates"]:
            status, reasons = self._grounding(item, documents[item["input"]["document_id"]])
            grounded[item["id"]] = status, reasons
            codes = {reason["code"] for reason in reasons}
            item["evidence"][0]["verification_basis"] = (
                "unmatched_local_document" if "excerpt_not_in_document" in codes else
                "not_checked_local_document" if "unsupported_kind" in codes else "matched_local_document"
            )
        for position, item in enumerate(batch["candidates"]):
            if item["state"] in {"accepted", "rejected"}:
                continue
            status, reasons = grounded[item["id"]]
            reasons = copy.deepcopy(reasons)
            if status != "blocked":
                row = item["record"]
                peers = [*baseline, *accepted]
                for other_pos, other in enumerate(batch["candidates"]):
                    if other_pos == position or grounded[other["id"]][0] == "blocked" or other["state"] == "rejected":
                        continue
                    peers.append(other["record"])
                same = [p for p in peers if _identity(p) == _identity(row)]
                conflicts = [p["id"] for p in same if _value(p) != _value(row)]
                duplicate = [p["id"] for p in same if _value(p) == _value(row)]
                definitions = [p["id"] for p in peers if _identity(p, definition=False) == _identity(row, definition=False)
                               and _identity(p) != _identity(row)]
                if conflicts:
                    status = "needs_confirmation"
                    reasons.append(_reason("true_conflict", "Different same-definition reported values must remain distinct; no automatic choice or comparison.", conflicts))
                if definitions:
                    status = "needs_confirmation"
                    reasons.append(_reason("definition_uncertain", "Definitions differ for otherwise similar facts; no automatic equivalence.", definitions))
                if duplicate and not conflicts and not definitions:
                    already = [p for p in [*baseline, *accepted] if p["id"] in duplicate]
                    previous = [p for p in batch["candidates"][:position] if p["id"] in duplicate and grounded[p["id"]][0] == "eligible"]
                    if already or (status == "eligible" and previous):
                        status = "duplicate"
                        reasons.append(_reason("duplicate_fact", "The same value and reporting identity is already present; no new record is added.", duplicate))
            item["assessment"] = {"status": status, "reasons": reasons}
            if batch["authorized_at"] is not None and item["state"] != "accepted":
                item["state"] = {"eligible": "awaiting_confirmation", "needs_confirmation": "awaiting_confirmation",
                                 "blocked": "blocked", "duplicate": "duplicate"}[status]

    def _accept(self, state: dict, item: dict):
        row = copy.deepcopy(item["record"])
        accepted = state["accepted"]
        peers = [*self._baseline(), *accepted["records"]]
        conflicts = [p["id"] for p in peers if _identity(p) == _identity(row) and _value(p) != _value(row)]
        if conflicts:
            row["quality_status"] = "conflict"
            row["conflict_record_ids"] = conflicts[:]
            row["caveats"].append(_CONFLICT_CAVEAT)
            for old in accepted["records"]:
                if old["id"] in conflicts:
                    old["quality_status"] = "conflict"
                    old["conflict_record_ids"] = list(dict.fromkeys([*old.get("conflict_record_ids", []), row["id"]]))
                    if _CONFLICT_CAVEAT not in old["caveats"]:
                        old["caveats"].append(_CONFLICT_CAVEAT)
                    for batch in state["batches"].values():
                        for previous in batch["candidates"]:
                            if previous["id"] == old["id"]:
                                previous["record"] = copy.deepcopy(old)
            state["conflicts"].append({"record_ids": [*conflicts, row["id"]], "reason": _CONFLICT_CAVEAT})
        item["record"] = copy.deepcopy(row)
        accepted["records"].append(row)
        accepted["sources"].extend(copy.deepcopy(item["sources"]))
        accepted["evidence"].extend(copy.deepcopy(item["evidence"]))
        item["state"] = "accepted"

    def _view(self, state: dict, batch_id: str | None = None) -> dict:
        if batch_id is not None and batch_id not in state["batches"]:
            raise ResearchIntakeError("unknown_batch", "Unknown research batch.")
        batches = [state["batches"][batch_id]] if batch_id is not None else state["batches"].values()
        return {"schema_version": 1, "data_kind": "research_candidate_batches", "revision": state["revision"],
                "batches": [{"id": b["id"], "content_revision": b["content_revision"], "created_at": b["created_at"],
                             "authorized_at": b["authorized_at"],
                             "candidates": [{key: copy.deepcopy(item[key]) for key in ("id", "record", "sources", "evidence", "assessment", "state")}
                                            for item in b["candidates"]]} for b in batches]}

    def create_batch(self, documents: list[dict], candidates: list[dict]) -> dict:
        """Capture actual bytes and stage immutable content; nothing is admitted yet."""
        if not isinstance(documents, list) or not documents or not isinstance(candidates, list) or not candidates or len(documents) > 20 or len(candidates) > 100:
            raise ResearchIntakeError("invalid_input", "Provide a bounded nonempty documents and candidates batch.")
        docs = []
        total_bytes = 0
        for doc in documents:
            info, body = self._document(doc)
            total_bytes += len(body)
            if total_bytes > 5_000_000:
                raise ResearchIntakeError("invalid_input", "The original bytes of the entire batch must total at most five megabytes.")
            docs.append((info, body))
        infos = {info["id"]: info for info, _ in docs}
        if len(infos) != len(docs):
            raise ResearchIntakeError("invalid_document", "Document ids must be unique within the batch.")
        rows = [self._candidate(c, infos) for c in candidates]
        if len({row["id"] for row in rows}) != len(rows):
            raise ResearchIntakeError("invalid_candidate", "Candidate ids must be unique within the batch.")
        known_topics = {topic["id"] for topic in Snapshot(self.baseline_path).research(include_overlay=False).get("topics", [])}
        if any(not set(row["topic_ids"]) <= known_topics for row in rows):
            raise ResearchIntakeError("invalid_candidate", "A candidate references an unknown research topic.")
        self.directory.mkdir(parents=True, exist_ok=True)
        with file_lock(self.lock_path):
            state = self._load()
            for info, body in docs:
                self._store_document(info, body)
            batch_id, now = uuid4().hex, _now()
            batch = {"id": batch_id, "created_at": now, "authorized_at": None,
                     "documents": [info for info, _ in docs],
                     "candidates": [self._item(batch_id, row, infos[row["document_id"]], now) for row in rows]}
            batch["content_revision"] = _revision(batch_id, batch["documents"], rows)
            self._assess(state, batch)
            state["batches"][batch_id] = batch
            state["revision"] += 1
            atomic_json(self.path, state)
            return self._view(state, batch_id)

    def view(self, batch_id: str | None = None) -> dict:
        """Read a batch or all batches without authorizing, searching or exposing bytes."""
        if not self.directory.exists():
            return self._view(self._load(), batch_id)
        with file_lock(self.lock_path):
            state = self._load()
            return self._view(state, batch_id)

    def _batch(self, state: dict, batch_id: str, content_revision: str) -> dict:
        batch = state["batches"].get(batch_id)
        if batch is None:
            raise ResearchIntakeError("unknown_batch", "Unknown research batch.")
        if not isinstance(content_revision, str) or content_revision != batch["content_revision"]:
            raise ResearchIntakeError("stale_content_revision", "The immutable batch content revision must match the authorization or decision.")
        return batch

    def authorize_batch(self, batch_id: str, content_revision: str) -> dict:
        """Approve this revision once; auto-admit only currently eligible evidence."""
        if not self.directory.exists():
            raise ResearchIntakeError("unknown_batch", "Unknown research batch.")
        with file_lock(self.lock_path):
            state = self._load()
            batch = self._batch(state, batch_id, content_revision)
            if batch["authorized_at"] is None:
                self._assess(state, batch)
                batch["authorized_at"] = _now()
                for item in batch["candidates"]:
                    status = item["assessment"]["status"]
                    if status == "eligible":
                        self._accept(state, item)
                    else:
                        item["state"] = {"needs_confirmation": "awaiting_confirmation", "blocked": "blocked", "duplicate": "duplicate"}[status]
                state["revision"] += 1
                atomic_json(self.path, state)
            return self._view(state, batch_id)

    def decide(self, batch_id: str, candidate_id: str, content_revision: str, decision: str, reason: str) -> dict:
        """Accept a reviewable fact or reject it; confirmation never replaces source bytes."""
        if decision not in {"accept", "reject"} or not isinstance(reason, str) or len(reason) > 600:
            raise ResearchIntakeError("invalid_decision", "Decision must be accept/reject with a bounded reason.")
        if not self.directory.exists():
            raise ResearchIntakeError("unknown_batch", "Unknown research batch.")
        with file_lock(self.lock_path):
            state = self._load()
            batch = self._batch(state, batch_id, content_revision)
            if batch["authorized_at"] is None:
                raise ResearchIntakeError("batch_not_authorized", "The current batch must be explicitly authorized before a decision.")
            item = next((row for row in batch["candidates"] if row["id"] == candidate_id), None)
            if item is None:
                raise ResearchIntakeError("unknown_candidate", "Candidate is not bound to this research batch.")
            if item["state"] == ("accepted" if decision == "accept" else "rejected"):
                return self._view(state, batch_id)
            if item["state"] in {"accepted", "rejected"}:
                raise ResearchIntakeError("invalid_decision", "A concluded candidate cannot be reversed in this immutable batch.")
            self._assess(state, batch)
            if decision == "accept":
                if not reason.strip():
                    raise ResearchIntakeError("reason_required", "A reason is required to manually accept a research candidate.")
                if item["assessment"]["status"] in {"blocked", "duplicate"} or any(
                    not item["record"][key] for key in ("metric", "kind", "label", "unit", "source_geography", "statistical_window", "definition")
                ):
                    raise ResearchIntakeError("candidate_not_eligible", "Missing evidence, required field identities, unsupported values and duplicate facts cannot be accepted by a decision; create a corrected batch.")
                self._accept(state, item)
                item["record"]["caveats"].append("Human decision: " + reason.strip())
                state["accepted"]["records"][-1]["caveats"].append("Human decision: " + reason.strip())
            else:
                item["state"] = "rejected"
            state["revision"] += 1
            atomic_json(self.path, state)
            return self._view(state, batch_id)
