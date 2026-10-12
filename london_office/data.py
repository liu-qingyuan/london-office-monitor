"""Source knowledge, snapshot normalization and read-only evidence checks.

Nothing in this Module depends on a model runtime or map styling. A source check
only checks an approved document; it neither discovers new reports nor edits data.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import os
import re
from datetime import datetime, timezone
from decimal import Decimal
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, HTTPRedirectHandler, build_opener

ROOT = Path(__file__).resolve().parent.parent
ALLOWED_SOURCE_HOSTS = frozenset({"www.savills.co.uk"})


def _approved_url(url: str):
    parsed = urlparse(url)
    if parsed.scheme != "https" or parsed.hostname not in ALLOWED_SOURCE_HOSTS or parsed.username or parsed.password or parsed.port not in {None, 443}:
        raise ValueError("Source URL is outside the approved official HTTPS allowlist")


class _SourceRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        # Check BEFORE following a redirect, not after contacting an arbitrary host.
        _approved_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _quoted_value(row: dict, quote: str) -> float | None:
    """Parse only the approved Savills excerpt forms; don't infer source definitions."""
    quote = normalize_text(quote)
    if row["metric"] in {"prime_rent", "grade_a_rent"}:
        match = re.search(re.escape(row["source_area"]) + r"[^£]*£([\d,]+(?:\.\d+)?)", quote, re.IGNORECASE)
        return float(match.group(1).replace(",", "")) if match else None
    both = re.search(r"Both the City and West End.*?vacancy rates reaching ([\d.]+)% and ([\d.]+)%, respectively", quote, re.IGNORECASE)
    if both and row["source_area"] in {"City", "West End"}:
        return float(both.group(1 if row["source_area"] == "City" else 2))
    match = re.search(re.escape(row["source_area"]) + r".*?([\d.]+)%", quote, re.IGNORECASE)
    return float(match.group(1)) if match else None


def _excerpt_numbers(text: str) -> set[Decimal]:
    """Literal/scaled quoted numbers, not a proof of the surrounding interpretation."""
    values = set()
    pattern = r"(?<![\w.])([+\-−]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?)\s*(million|thousand|m|k)?(?!\w)"
    for match in re.finditer(pattern, text, re.IGNORECASE):
        number = Decimal(match[1].replace(",", "").replace("−", "-"))
        values.add(number)
        scale = {"million": 1_000_000, "m": 1_000_000, "thousand": 1_000, "k": 1_000}.get((match[2] or "").lower(), 1)
        values.add(number * scale)
    words = {"zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
             "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10}
    for word, number in words.items():
        if re.search(r"\b" + word + r"\b", text, re.IGNORECASE):
            values.add(Decimal(number))
    return values


class _Text(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style", "noscript"}:
            self.ignored += 1
        if not self.ignored:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style", "noscript"} and self.ignored:
            self.ignored -= 1
        if not self.ignored:
            self.parts.append(" ")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def normalize_text(text: str) -> str:
    """Normalize whitespace only; don't turn different numeric evidence into a match."""
    return " ".join(text.split())


def html_text(html: str) -> str:
    parser = _Text()
    parser.feed(html)
    return normalize_text("".join(parser.parts))


def read_document(path: Path) -> str:
    """Extract a user-supplied local report; this does not validate it as market data."""
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader
        return "\n".join(page.extract_text() or "" for page in PdfReader(path).pages)
    text = path.read_text(encoding="utf-8")
    return html_text(text) if path.suffix.lower() in {".html", ".htm"} else text


class Snapshot:
    """Load a versioned snapshot; reject broken references and non-finite values.

    Returned data are copies. Observation candidates are normalized, but selection,
    comparison and ambiguity resolution belong to the Market Module.
    """
    def __init__(self, path: Path | None = None, geometry: Path | None = None, *, research_dir: Path | None = None):
        self._research_dir = research_dir if research_dir is not None else (Path(os.environ.get("LONDON_RESEARCH_DIR", str(ROOT / "var/research"))) if path is None else None)
        self._data = json.loads((path or ROOT / "data/snapshot.json").read_text())
        self._geometry = json.loads((geometry or ROOT / "data/areas.geojson").read_text())
        if self._data.get("schema_version") != 1:
            raise ValueError("Unsupported snapshot schema_version")
        self._areas = self._index("areas")
        self._metrics = self._index("metrics")
        self._periods = self._index("periods")
        self._sources = self._index("sources")
        self._evidence = self._index("evidence")
        self._index("observations")
        self._index("notes")
        self._research = self._data.get("research", {})
        self._research_sources = {}
        self._research_evidence = {}
        if self._research:
            self._research_sources, self._research_evidence = self._validate_research(self._research)
        if self._geometry.get("type") != "FeatureCollection":
            raise ValueError("Geometry must be a FeatureCollection")
        for feature in self._geometry["features"]:
            props = feature["properties"]
            if props["area_id"] not in self._areas or props.get("geometry_status") != "illustrative":
                raise ValueError("Geometry must identify a known illustrative selection area")
        for item in self._evidence.values():
            if item["source_id"] not in self._sources or not item["quote"].strip():
                raise ValueError("Invalid evidence source or empty excerpt")
        for row in self._data["observations"]:
            if row["area_id"] not in self._areas or row["metric"] not in self._metrics or row["period"] not in self._periods:
                raise ValueError("Observation references an unknown area, metric or period")
            if row["source_id"] not in self._sources or row["evidence_id"] not in self._evidence:
                raise ValueError("Observation requires known source and evidence")
            if self._evidence[row["evidence_id"]]["source_id"] != row["source_id"]:
                raise ValueError("Observation and evidence refer to different sources")
            if self._sources[row["source_id"]]["report_period"] != row["period"]:
                raise ValueError("Observation and source refer to different periods")
            value = row["value"]
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value) or value < 0:
                raise ValueError("Observation value must be a finite non-negative number")
            if row["metric"] == "vacancy_rate" and value > 100:
                raise ValueError("Vacancy rate must lie between zero and 100")
            if self._data["dataset"]["data_kind"] == "historical_market":
                quote = self._evidence[row["evidence_id"]]["quote"]
                if _quoted_value(row, quote) != value:
                    raise ValueError(f"Observation {row['id']} value does not match its cited excerpt")
        for note in self._data["notes"]:
            if note["source_id"] not in self._sources or note["evidence_id"] not in self._evidence:
                raise ValueError("Report event requires known source and evidence")
            if self._evidence[note["evidence_id"]]["source_id"] != note["source_id"]:
                raise ValueError("Report event and evidence refer to different sources")
            if note["period"] not in self._periods or not set(note["area_ids"]) <= self._areas.keys():
                raise ValueError("Report event references unknown geography or period")

    def _validate_research(self, data):
        """Validate admitted context without mutating a shared snapshot or map observations."""
        if data.get("data_kind") != "historical_research" or data.get("publication_status") != "admitted_with_caveats" or data.get("is_live") is not False:
            raise ValueError("Research must be explicitly admitted historical context, not a live feed")
        def index(key):
            rows = data[key]
            result = {row["id"]: row for row in rows}
            if len(result) != len(rows):
                raise ValueError(f"Duplicate IDs in research {key}")
            return result
        topics = index("topics")
        sources = index("sources")
        evidence = index("evidence")
        records = index("records")
        index("comparisons")
        index("exclusions")
        for source in sources.values():
            parsed = urlparse(source["url"])
            if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
                raise ValueError("Admitted research source requires a public HTTPS URL")
            if source["id"] in self._sources and any(source[k] != self._sources[source["id"]][k] for k in ("url", "published_at")):
                raise ValueError("Research source alias differs from the original source")
        for item in evidence.values():
            if item["source_id"] not in sources or not item["quote"].strip() or len(item["quote"]) > 600:
                raise ValueError("Research requires known sources and bounded short excerpts")
        for row in records.values():
            if not row["topic_ids"] or not set(row["topic_ids"]) <= topics.keys():
                raise ValueError("Research references an unknown dimension")
            if row.get("map_binding") is not None or not row["source_geography"] or not row["statistical_window"]:
                raise ValueError("Research needs source geography/window, with no inferred map binding")
            value = row["value"]
            status = row["status"]
            if status == "available":
                if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                    raise ValueError("Available research value must be finite")
                if not row["evidence_ids"]:
                    raise ValueError("Available research value requires source evidence")
            elif status in {"missing", "approximate", "event"}:
                if value is not None:
                    raise ValueError("Missing, approximate and event scalars must not manufacture a number")
            else:
                raise ValueError("Unknown research status")
            if not row["source_ids"] or not set(row["source_ids"]) <= sources.keys() or not set(row["evidence_ids"]) <= evidence.keys():
                raise ValueError("Research requires known source and evidence IDs")
            excerpt_sources = {evidence[e]["source_id"] for e in row["evidence_ids"]}
            if not excerpt_sources <= set(row["source_ids"]):
                raise ValueError("Research evidence and source bindings differ")
            if status != "missing" and excerpt_sources != set(row["source_ids"]):
                raise ValueError("Every cited research source requires its own bound excerpt")
            if status == "available" and Decimal(str(value)) not in set().union(*(_excerpt_numbers(evidence[e]["quote"]) for e in row["evidence_ids"])):
                raise ValueError(f"research value {row['id']} is not present in its bound source excerpt")
            if not set(row["reference_observation_ids"]) <= {o["id"] for o in self._data["observations"]}:
                raise ValueError("Research references an unknown original observation")
            if row["kind"] == "forecast" and row["forecast_as_of"] is not None:
                raise ValueError("This intake does not establish exact forecast as-of dates")
            if status == "event":
                if not row["evidence_ids"] or row["event"]["occurred_on"] is not None:
                    raise ValueError("Historical events require evidence; no exact signing day is established")
                for q in row["event"]["quantities"]:
                    if isinstance(q["value"], bool) or not isinstance(q["value"], (int, float)) or not math.isfinite(q["value"]) or not q["unit"]:
                        raise ValueError("Event quantity requires a finite value and its own unit")
        for comparison in data["comparisons"]:
            if comparison["previous_id"] not in records or comparison["current_id"] not in records:
                raise ValueError("Research comparison requires admitted baseline and current records")
            for key, known in (("source_ids", sources), ("evidence_ids", evidence)):
                if not set(comparison[key]) <= known.keys():
                    raise ValueError("Research comparison references unknown evidence")
        return sources, evidence

    def _index(self, name):
        items = self._data[name]
        index = {item["id"]: item for item in items}
        if len(index) != len(items):
            raise ValueError(f"Duplicate IDs in {name}")
        return index

    def catalog(self) -> dict:
        return copy.deepcopy({**{key: self._data[key] for key in ["areas", "metrics", "periods", "limitations", "dataset"]},
                              "research_topics": self._research.get("topics", [])})

    def records(self, area: str, metric: str, period: str) -> list[dict]:
        definition = self._metrics[metric]
        results = []
        for row in self._data["observations"]:
            if (row["area_id"], row["metric"], row["period"]) != (area, metric, period):
                continue
            results.append({**copy.deepcopy(row), "status": "available",
                "definition": definition["definition"],
                "billing_period": definition["billing_period"],
                "data_kind": self._data["dataset"]["data_kind"],
                "spatial_granularity": "submarket"})
        return results

    def references(self, evidence_ids: list[str]) -> tuple[list[dict], list[dict]]:
        evidence = [copy.deepcopy(self._evidence[key]) for key in dict.fromkeys(evidence_ids)]
        sources = [copy.deepcopy(self._sources[key]) for key in dict.fromkeys(e["source_id"] for e in evidence)]
        return sources, evidence

    def notes(self, period: str, area: str | None = None) -> list[dict]:
        return copy.deepcopy([n for n in self._data["notes"] if n["period"] == period and (area is None or area in n["area_ids"])])

    def research(self, *, include_overlay: bool = True) -> dict:
        """Read one complete accepted revision; staged material is never market evidence."""
        result = copy.deepcopy(self._research)
        if not include_overlay or self._research_dir is None:
            return result
        path = self._research_dir / "state.json"
        if not path.exists():
            return result
        try:
            if path.is_symlink() or self._research_dir.is_symlink():
                raise ValueError("Linked intake state")
            state = json.loads(path.read_text(encoding="utf-8"))
            if state["schema_version"] != 1 or state["data_kind"] != "research_intake_state" or type(state["revision"]) is not int or state["revision"] < 0:
                raise ValueError("Invalid intake revision")
            accepted = state["accepted"]
            for key in ("records", "sources", "evidence"):
                existing = {item["id"]: item for item in result[key]}
                for item in accepted[key]:
                    if item["id"] in existing:
                        if existing[item["id"]] != item:
                            raise ValueError("Accepted intake cannot overwrite prior records or provenance")
                    else:
                        result[key].append(item)
                        existing[item["id"]] = item
            result["intake_revision"] = state["revision"]
            known = {item["id"]: item for item in result["records"]}
            for conflict in state.get("conflicts", []):
                identifiers = conflict["record_ids"]
                if not set(identifiers) <= known.keys():
                    raise ValueError("Unknown conflicting record")
                for identifier in identifiers:
                    record = known[identifier]
                    record["quality_status"] = "conflict"
                    record["conflict_record_ids"] = [other for other in identifiers if other != identifier]
                    note = "Conflicting source-reported values retained separately; no single consensus value or automatic comparison."
                    if note not in record["caveats"]:
                        record["caveats"].append(note)
            for topic in result["topics"]:
                topic["record_count"] = sum(topic["id"] in record["topic_ids"] for record in result["records"])
            self._validate_research(result)
        except (OSError, ValueError, KeyError, TypeError) as error:
            raise ValueError("Accepted research state is invalid or unavailable; existing research has not been silently substituted.") from error
        return result

    def geometry(self, area: str | None = None) -> dict:
        return {"type": "FeatureCollection", "features": copy.deepcopy([f for f in self._geometry["features"] if area is None or f["properties"]["area_id"] == area])}

    def source(self, source_id: str) -> dict:
        research = self.research()
        sources = {s["id"]: s for s in research.get("sources", [])}
        if source_id not in self._sources and source_id not in sources:
            raise ValueError(f"Unknown source: {source_id}")
        source = copy.deepcopy(self._sources.get(source_id, sources.get(source_id)))
        source["evidence"] = [copy.deepcopy(e) for e in [*self._evidence.values(), *research.get("evidence", [])] if e["source_id"] == source_id]
        return source

    def verify(self, source_id: str) -> dict:
        """Fetch one allowlisted source with size/timeout limits and check exact excerpts.

        Does not overwrite a snapshot. Network failures propagate to the caller as
        explicit errors, not as missing market values. Remote text is untrusted data.
        """
        if source_id not in self._sources:
            raise ValueError("Live verification remains limited to the original approved Savills documents; use source_details for admitted archived research.")
        source = copy.deepcopy(self._sources[source_id])
        source["evidence"] = [copy.deepcopy(e) for e in self._evidence.values() if e["source_id"] == source_id]
        _approved_url(source["url"])
        request = Request(source["url"], headers={"User-Agent": "LondonOfficeMonitor/0.1 (evidence verification)", "Accept": "text/html"})
        with build_opener(_SourceRedirects()).open(request, timeout=20) as response:
            _approved_url(response.geturl())
            body = response.read(5_000_001)
            charset = response.headers.get_content_charset() or "utf-8"
        if len(body) > 5_000_000:
            raise ValueError("Source exceeds the five-megabyte processing limit")
        text = html_text(body.decode(charset))
        checks = [{"evidence_id": e["id"], "matched": normalize_text(e["quote"]) in text} for e in source["evidence"]]
        return {"source_id": source_id, "url": source["url"],
            "checked_at": datetime.now(timezone.utc).isoformat(),
            "body_sha256": hashlib.sha256(body).hexdigest(),
            "status": "verified" if all(c["matched"] for c in checks) else "excerpt_mismatch",
            "checks": checks, "discovered_new_reports": False,
            "warnings": ["Checks approved historical excerpts only; does not certify freshness, methodology or a new report."]}
