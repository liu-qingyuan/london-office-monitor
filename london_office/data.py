"""Source knowledge, snapshot normalization and read-only evidence checks.

Nothing in this Module depends on a model runtime or map styling. A source check
only checks an approved document; it neither discovers new reports nor edits data.
"""
from __future__ import annotations

import copy
import hashlib
import json
import math
import re
from datetime import datetime, timezone
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
    def __init__(self, path: Path | None = None, geometry: Path | None = None):
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

    def _index(self, name):
        items = self._data[name]
        index = {item["id"]: item for item in items}
        if len(index) != len(items):
            raise ValueError(f"Duplicate IDs in {name}")
        return index

    def catalog(self) -> dict:
        return copy.deepcopy({key: self._data[key] for key in ["areas", "metrics", "periods", "limitations", "dataset"]})

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

    def geometry(self, area: str | None = None) -> dict:
        return {"type": "FeatureCollection", "features": copy.deepcopy([f for f in self._geometry["features"] if area is None or f["properties"]["area_id"] == area])}

    def source(self, source_id: str) -> dict:
        if source_id not in self._sources:
            raise ValueError(f"Unknown source: {source_id}")
        source = copy.deepcopy(self._sources[source_id])
        source["evidence"] = [copy.deepcopy(e) for e in self._evidence.values() if e["source_id"] == source_id]
        return source

    def verify(self, source_id: str) -> dict:
        """Fetch one allowlisted source with size/timeout limits and check exact excerpts.

        Does not overwrite a snapshot. Network failures propagate to the caller as
        explicit errors, not as missing market values. Remote text is untrusted data.
        """
        source = self.source(source_id)
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
