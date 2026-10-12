"""Bounded reads of two official publication indexes; never publish market observations."""
from __future__ import annotations

import hashlib
import json
import os
import re
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit, urlunsplit
from urllib.request import ProxyHandler, Request, build_opener
from uuid import uuid4

from .discovery import DiscoveryError, _NoRedirect, _receipt_lock
from .monitoring import _save


SOURCES = {
    "savills-central-london": "https://www.savills.co.uk/insight-and-opinion/research.aspx?rc=United%20Kingdom&p=Offices&t=&f=date&q=Central%20London%20Office%20Market%20Watch&page=1",
    "crown-estate-news": "https://www.thecrownestate.co.uk/news",
}
DEFAULT_DIRECTORY = Path("var/monitoring/official")
MAX_BODY_BYTES = 5 * 1024 * 1024
TIMEOUT_SECONDS = 20
_SERIES = "central london office market watch"
_MONTHS = {month.casefold(): i for i, month in enumerate((
    "January", "February", "March", "April", "May", "June", "July", "August",
    "September", "October", "November", "December"), 1)}
_EDITION_PREFIX = r"^\s*(?:[-–—:]\s*)?"
_MONTH = re.compile(_EDITION_PREFIX + r"(" + "|".join(_MONTHS) + r")\s+(20\d{2})\b", re.I)
_QUARTER = re.compile(_EDITION_PREFIX + r"Q([1-4])\s+(20\d{2})\b", re.I)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _open(request: Request, timeout: int):
    """One HTTP start. urllib's redirect handler refuses all 3xx follow-ups."""
    return build_opener(ProxyHandler(), _NoRedirect()).open(request, timeout=timeout)


def _approved_link(href: str, parent: str, watch_id: str) -> str | None:
    url = urljoin(parent, href)
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != urlsplit(parent).hostname
            or parsed.port is not None or parsed.username is not None or parsed.password is not None):
        return None
    path = parsed.path
    if watch_id == "savills-central-london":
        if not re.fullmatch(r"/research_articles/\d+/\d+-\d+/?", path):
            return None
    elif not re.fullmatch(r"/news/[^/]+/?", path, re.I):
        return None
    return urlunsplit(("https", parsed.netloc, path.rstrip("/"), "", ""))


def _edition(title: str) -> str | None:
    suffix = title.casefold().split(_SERIES, 1)[-1]
    month = _MONTH.match(suffix)
    if month:
        return f"{month.group(2)}-{_MONTHS[month.group(1).casefold()]:02d}"
    quarter = _QUARTER.match(suffix)
    return f"{quarter.group(2)}-Q{quarter.group(1)}" if quarter else None


class _Index(HTMLParser):
    def __init__(self, url: str, watch_id: str):
        super().__init__(convert_charrefs=True)
        self.url, self.watch_id = url, watch_id
        self.links: list[dict] = []
        self.headings: list[str] = []
        self._href: str | None = None
        self._text: list[str] = []
        self._heading: str | None = None
        self._heading_text: list[str] = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "a":
            self._href = attributes.get("href")
            self._text = []
        elif tag == "img" and self._href:
            self._text.append(attributes.get("alt") or "")
        if tag in {"h1", "h2", "h3"}:
            self._heading, self._heading_text = tag, []

    def handle_data(self, data):
        if self._href:
            self._text.append(data)
        if self._heading:
            self._heading_text.append(data)

    def handle_endtag(self, tag):
        if tag == "a":
            if self._href:
                title = " ".join(" ".join(self._text).split())[:200]
                url = _approved_link(self._href, self.url, self.watch_id)
                if url and title and (self.watch_id != "savills-central-london" or _SERIES in title.casefold()):
                    self.links.append({"url": url, "title": title,
                        "edition": _edition(title) if self.watch_id == "savills-central-london" else None,
                        "published_at": None, "observation_period": None})
            self._href, self._text = None, []
        if tag == self._heading:
            if len(self.headings) < 8:
                self.headings.append(" ".join(" ".join(self._heading_text).split())[:160])
            self._heading, self._heading_text = None, []


def _reserve(path: Path | None, url: str) -> None:
    if path is None or not path.is_file() or path.is_symlink():
        raise DiscoveryError("official_authorization_required", "An existing authorized official-read ledger is required.")
    with _receipt_lock(path.with_suffix(".lock")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (ValueError, UnicodeError) as error:
            raise DiscoveryError("invalid_official_budget", "Official-read ledger is unreadable; no request started.") from error
        if not isinstance(data, dict):
            raise DiscoveryError("invalid_official_budget", "Official-read ledger is malformed; no request started.")
        cap, count = data.get("request_start_cap"), data.get("request_starts")
        urls = data.get("urls")
        try:
            expiry = datetime.fromisoformat(data["expires_at"])
            valid = expiry.tzinfo is not None and expiry.utcoffset() is not None
        except (KeyError, ValueError, TypeError):
            valid = False
        if (not isinstance(data.get("authorization"), str) or not data["authorization"].strip()
                or type(cap) is not int or type(count) is not int or cap < 0 or not 0 <= count <= cap
                or not isinstance(urls, list) or len(urls) != count or not all(isinstance(u, str) for u in urls)
                or data.get("allow_explicit_repeat_reads") is not True or not valid):
            raise DiscoveryError("invalid_official_budget", "Official-read ledger is malformed; no request started.")
        if datetime.now(timezone.utc) >= expiry:
            raise DiscoveryError("official_budget_expired", "Official-read ledger has expired; no renewal.")
        if count >= cap:
            raise DiscoveryError("official_budget_exhausted", "Official-read HTTP starts exhausted; no retry.")
        data["request_starts"] = count + 1
        data["urls"].append(url)
        temporary = path.with_name(path.name + "." + uuid4().hex + ".tmp")
        try:
            with temporary.open("x", encoding="utf-8") as file:
                json.dump(data, file, ensure_ascii=False, indent=2)
                file.write("\n")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


class OfficialWatch:
    def __init__(self, directory: Path = DEFAULT_DIRECTORY, budget_file: Path | None = None):
        self.directory, self.budget_file = Path(directory), Path(budget_file) if budget_file is not None else None

    @staticmethod
    def preview(plan: dict) -> dict:
        if (not isinstance(plan, dict) or set(plan) != {"schema_version", "watch_ids"}
                or type(plan["schema_version"]) is not int or plan["schema_version"] != 1
                or not isinstance(plan["watch_ids"], list) or not 1 <= len(plan["watch_ids"]) <= len(SOURCES)
                or any(not isinstance(item, str) or item not in SOURCES for item in plan["watch_ids"])
                or len(set(plan["watch_ids"])) != len(plan["watch_ids"])):
            raise DiscoveryError("invalid_official_watch_plan", "Select one or two distinct known watch IDs in a v1 plan.")
        canonical = {"schema_version": 1, "watch_ids": sorted(plan["watch_ids"])}
        return {"plan": canonical, "sources": [{"watch_id": key, "url": SOURCES[key]} for key in canonical["watch_ids"]],
                "requests_per_run": len(canonical["watch_ids"]), "formal_market_updated": False}

    def view(self) -> dict:
        runs = []
        for started in (self.directory / "runs").glob("*/started.json"):
            completed = started.with_name("result.json")
            record = json.loads((completed if completed.exists() else started).read_text(encoding="utf-8"))
            if record.get("schema_version") != 1 or record.get("data_kind") != "official_source_monitor_run":
                raise ValueError("Invalid official-watch archive; history cannot be treated as empty")
            runs.append(record)
        runs.sort(key=lambda r: (r["started_at"], r["id"]))
        return {"schema_version": 1, "data_kind": "official_source_monitoring", "runs": runs,
                "formal_market_updated": False,
                "warnings": ["Only configured official index links were checked; no exhaustive or latest-market coverage is established."]}

    def run(self, plan: dict) -> dict:
        selected = self.preview(plan)["plan"]["watch_ids"]
        self.directory.mkdir(parents=True, exist_ok=True)
        with _receipt_lock(self.directory / "watch.lock"):
            history = self.view()["runs"]
            identifier = "official-" + uuid4().hex
            started = {"schema_version": 1, "data_kind": "official_source_monitor_run", "id": identifier,
                "started_at": _now(), "checked_at": None, "completed_at": None, "status": "check_incomplete",
                "watch_ids": selected, "sources": [], "new_publication_links": [], "formal_market_updated": False,
                "warnings": ["Publication links are unverified leads, not market facts, revisions or events; index checks are not exhaustive."]}
            directory = self.directory / "runs" / identifier
            _save(directory / "started.json", started)
            result = {**started, "sources": []}
            for watch_id in selected:
                url = SOURCES[watch_id]
                previous = [source for run in history for source in run["sources"]
                            if source["watch_id"] == watch_id and source["status"] in
                            {"baseline_captured", "new_publication_links", "no_new_publication_links"}]
                source = {"watch_id": watch_id, "url": url, "status": "check_incomplete", "checked_at": None,
                          "request_started_at": None, "http_status": None, "body_bytes": None, "body_sha256": None, "headings": [],
                          "publication_links": [], "new_publication_links": [], "error": None,
                          "last_valid_run_id": previous[-1]["run_id"] if previous else None}
                try:
                    _reserve(self.budget_file, url)
                    source["request_started_at"] = _now()
                    request = Request(url, headers={"Accept": "text/html", "User-Agent": "LondonOfficeMonitor/0.1"})
                    with _open(request, TIMEOUT_SECONDS) as response:
                        source["http_status"] = response.status
                        if response.geturl() != url or response.status != 200:
                            raise DiscoveryError("official_http_error", "Official index HTTP status or final URL was not approved.")
                        if "text/html" not in response.headers.get("Content-Type", "").lower():
                            raise DiscoveryError("official_content_type", "Official index is not HTML.")
                        raw = response.read(MAX_BODY_BYTES + 1)
                    source["body_bytes"] = len(raw)
                    if len(raw) > MAX_BODY_BYTES:
                        raise DiscoveryError("official_response_too_large", "Official index exceeds the 5 MB response limit.")
                    source["body_sha256"] = hashlib.sha256(raw).hexdigest()
                    parser = _Index(url, watch_id)
                    parser.feed(raw.decode("utf-8", errors="replace"))
                    parser.close()
                    source["headings"] = parser.headings
                    if not parser.links:
                        raise DiscoveryError("parse_unconfirmed", "Expected official publication links were not bound; no absence inferred.")
                    source["publication_links"] = list({link["url"]: link for link in parser.links}.values())
                    seen_urls = {link["url"] for old in previous for link in old["publication_links"]}
                    # A reused URL cannot prove a revision; a different URL is still a new link
                    # even if its displayed edition repeats. Neither is a market event.
                    new = [] if not previous else [link for link in source["publication_links"] if link["url"] not in seen_urls]
                    source["new_publication_links"] = new
                    source["checked_at"] = _now()
                    source["status"] = "baseline_captured" if not previous else "new_publication_links" if new else "no_new_publication_links"
                    source["last_valid_run_id"] = identifier
                except DiscoveryError as error:
                    source["status"] = "not_checked" if source["request_started_at"] is None else "check_failed"
                    source["error"] = {"code": error.code, "message": error.message}
                except HTTPError as error:
                    source["http_status"] = error.code
                    source["status"] = "check_failed"
                    source["error"] = {"code": "official_http_error", "message": "Official index HTTP request failed; no redirect or retry."}
                except (OSError, ValueError, UnicodeError):
                    source["status"] = "check_failed" if source["request_started_at"] else "not_checked"
                    source["error"] = {"code": "official_check_failed", "message": "Official index check failed; no retry."}
                source["run_id"] = identifier
                result["sources"].append(source)
                result["new_publication_links"].extend(source["new_publication_links"])
            statuses = {s["status"] for s in result["sources"]}
            if statuses <= {"baseline_captured", "new_publication_links", "no_new_publication_links"}:
                result["status"] = ("new_publication_links" if "new_publication_links" in statuses else
                                    "baseline_captured" if "baseline_captured" in statuses else "no_new_publication_links")
            else:
                result["status"] = next(iter(statuses)) if len(statuses) == 1 else "check_incomplete"
            checked = [s["checked_at"] for s in result["sources"] if s["checked_at"]]
            result["checked_at"] = max(checked) if checked else None
            result["completed_at"] = _now()
            _save(directory / "result.json", result)
            return result


def main(argv: list[str] | None = None) -> int:
    """Manual one-shot CLI. Preview/status never reserve budget or fetch sources."""
    import argparse
    parser = argparse.ArgumentParser(description="Bounded official-index publication leads; not market updates.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--preview", action="store_true", help="Validate a plan without a network request")
    mode.add_argument("--status", action="store_true", help="Read archived runs without a network request")
    parser.add_argument("--plan", type=Path, help="v1 watch_ids JSON plan")
    parser.add_argument("--budget-file", type=Path, help="Existing authorized official-read ledger")
    parser.add_argument("--directory", type=Path, default=DEFAULT_DIRECTORY, help="Archive directory")
    args = parser.parse_args(argv)
    try:
        if args.status:
            if args.plan or args.budget_file:
                raise DiscoveryError("invalid_official_watch_command", "Status does not accept a plan or budget.")
            output = OfficialWatch(args.directory).view()
        else:
            if args.plan is None or args.plan.suffix.lower() != ".json" or args.plan.stat().st_size > 65_536:
                raise DiscoveryError("invalid_official_watch_plan", "Supply a JSON plan of at most 64 KiB.")
            plan = json.loads(args.plan.read_text(encoding="utf-8"))
            if args.preview:
                if args.budget_file:
                    raise DiscoveryError("invalid_official_watch_command", "Preview does not use a budget ledger.")
                output = OfficialWatch.preview(plan)
            else:
                if args.budget_file is None:
                    raise DiscoveryError("official_authorization_required", "An existing official-read ledger must be supplied.")
                output = OfficialWatch(args.directory, args.budget_file).run(plan)
        print(json.dumps(output, ensure_ascii=False, indent=2), flush=True)
        return int(output.get("status") in {"not_checked", "check_failed", "check_incomplete"})
    except DiscoveryError as error:
        print(json.dumps({"status": "error", "error": {"code": error.code, "message": error.message}}, ensure_ascii=False), flush=True)
        return 1
    except (OSError, ValueError) as error:
        print(json.dumps({"status": "error", "error": {"code": "official_watch_failed", "message": str(error)}}, ensure_ascii=False), flush=True)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
