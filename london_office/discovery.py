"""Controlled Google discovery: finite consent, backend-only key, complete metadata.

This Module discovers Source Candidates, never updates formal market observations.
The external I/O Seam is private; callers use the same operation via CLI or MCP.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import unquote, unquote_plus, urlencode, urlsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
from uuid import uuid4
from .source_pool import SourcePool, TOPICS
from .storage import file_lock as _receipt_lock, atomic_json


class DiscoveryError(ValueError):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


def _now(): return datetime.now(timezone.utc).isoformat()


def _contains_credential(value, key: str) -> bool:
    """JSON escapes and URL-encoded credential echoes are still credentials."""
    if isinstance(value, str):
        return any(key in text for text in (value, unquote(value), unquote_plus(value)))
    if isinstance(value, dict):
        return any(_contains_credential(k, key) or _contains_credential(v, key) for k, v in value.items())
    if isinstance(value, list):
        return any(_contains_credential(item, key) for item in value)
    return False


def _key() -> str:
    key = os.environ.get("SERPAPI_API_KEY")
    if key:
        return key
    if sys.platform != "darwin":
        raise DiscoveryError("search_key_unavailable", "Set SERPAPI_API_KEY in the backend process; Keychain lookup is available only on macOS.")
    try:
        result = subprocess.run(["/usr/bin/security", "find-generic-password", "-a", "london-office-research-lab",
            "-s", "london-office-research-lab.serpapi", "-w"], capture_output=True, text=True, timeout=15)
    except (OSError, subprocess.TimeoutExpired) as error:
        raise DiscoveryError("search_key_unavailable", "Dedicated SerpAPI credential unavailable; no other credential lookup performed.") from error
    if result.returncode or not result.stdout.strip():
        raise DiscoveryError("search_key_unavailable", "Dedicated SerpAPI credential unavailable; no other credential lookup performed.")
    return result.stdout.strip()


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs): return None


def _open(request, timeout):
    proxy = os.environ.get("LONDON_SERPAPI_PROXY")
    handler = ProxyHandler() if proxy is None else ProxyHandler({"https": proxy} if proxy else {})
    return build_opener(handler, _NoRedirect()).open(request, timeout=timeout)


class DiscoveryBudget:
    """Persist starts before external execution; never create/reset authorization.

    This is a caller-turn/HTTP-start cap, not a token, fee or native HTTP meter.
    The budget file is operator configuration, never a model tool argument.
    """
    def __init__(self, path: Path | None):
        self.path = path

    def _read(self):
        if self.path is None or not self.path.is_file() or self.path.is_symlink():
            raise DiscoveryError("discovery_authorization_required", "An existing, explicitly authorized budget receipt is required; no automatic renewal.")
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, ValueError) as error:
            raise DiscoveryError("invalid_discovery_budget", "Authorization receipt is unreadable; no execution.") from error
        if not isinstance(data, dict) or not isinstance(data.get("authorization"), str) or not data["authorization"].strip():
            raise DiscoveryError("invalid_discovery_budget", "Discovery budget lacks explicit authorization.")
        return data

    @staticmethod
    def _validity(data):
        expiry = data.get("expires_at")
        if expiry is None:
            if data.get("authorization_source") == "web":
                raise DiscoveryError("invalid_discovery_budget", "Web authorization requires a finite expiry.")
            return  # Preserve legacy receipts, never invent a new lifetime for them.
        try:
            deadline = datetime.fromisoformat(expiry)
            if deadline.tzinfo is None:
                raise ValueError("Timezone required")
        except (TypeError, ValueError) as error:
            raise DiscoveryError("invalid_discovery_budget", "Authorization expiry must include a timezone.") from error
        if datetime.now(timezone.utc) >= deadline:
            raise DiscoveryError("discovery_authorization_expired", "Source-discovery authorization has expired; a new explicit approval is required.")

    def inspect(self):
        self._read()  # Missing configuration must not create a lock or authorization.
        with _receipt_lock(self.path.with_suffix(".lock")):
            return self._read()

    def ensure_active(self):
        data = self.inspect()
        self._validity(data)
        return data

    def change(self, action):
        self._read()
        with _receipt_lock(self.path.with_suffix(".lock")):
            data = self._read()
            action(data)
            atomic_json(self.path, data)
            return data

    def start(self, kind: str, identifier: str, query: str):
        if kind not in {"search", "account"}:
            raise DiscoveryError("invalid_discovery_budget", "Unknown Google execution role.")
        def reserve(data):
            self._validity(data)
            if kind == "search":
                cap, count = data.get("serpapi_search_http_start_cap"), data.get("serpapi_search_http_starts")
                if not all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in [cap, count]):
                    raise DiscoveryError("invalid_discovery_budget", "Unknown Google start cap/count; no execution.")
                if count >= cap:
                    raise DiscoveryError("search_budget_exhausted", "Authorized Google search starts exhausted; no retry or paid fallback.")
                data["serpapi_search_http_starts"] += 1
                data.setdefault("jobs", {})[identifier] = {"query": query, "status": "search_started", "started_at": _now()}
            else:
                data["account_http_starts"] = data.get("account_http_starts", 0) + 1
        return self.change(reserve)

    def start_turn(self, kind: str, identifier: str, question: str):
        if kind not in {"native_discovery", "market_validation"}:
            raise DiscoveryError("invalid_discovery_budget", "Unknown authorized model role.")
        def reserve(data):
            self._validity(data)
            cap, count = data.get("codex_turn_start_cap"), data.get("codex_turn_starts")
            role_key = "codex_" + kind + "_turn_starts"
            role_cap = data.get("codex_" + kind + "_turn_start_cap", 2 if kind == "native_discovery" else 1)
            role_count = data.get(role_key, 0)
            if not all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in [cap, count, role_cap, role_count]):
                raise DiscoveryError("invalid_discovery_budget", "Unknown model start cap/count; no execution.")
            if count >= cap or role_count >= role_cap:
                raise DiscoveryError("model_budget_exhausted", "Authorized model starts exhausted; no retry, renewal or API-key fallback.")
            data["codex_turn_starts"] += 1
            data[role_key] = role_count + 1
            data.setdefault("jobs", {})[identifier] = {"question": question, "role": kind, "status": "turn_starting", "started_at": _now()}
        return self.change(reserve)

    def google_attempt(self, request_id: str):
        def reserve(data):
            self._validity(data)
            attempts = data.setdefault("google_discovery_request_attempts", {})
            if attempts.get(request_id, 0):
                raise DiscoveryError("discovery_query_limit", "This explicit discovery request already attempted Google; no MCP reconnect retry.")
            attempts[request_id] = 1
        return self.change(reserve)


def _occurrences(payload: dict) -> list[dict]:
    records = []
    def walk(value, path):
        if isinstance(value, dict):
            for name in ["link", "url", "website", "source", "source_info_link", "read_more_link"]:
                url = value.get(name)
                if not isinstance(url, str): continue
                parsed = urlsplit(url)
                host = (parsed.hostname or "").lower()
                if parsed.scheme not in {"http", "https"} or not host: continue
                if host == "serpapi.com" or host.endswith(".serpapi.com"): continue
                if host.startswith("www.google.") and parsed.path in {"/search", "/url", "/search/about-this-result"}: continue
                records.append({"url": url, "title": value.get("title"),
                    "snippet": value.get("snippet") or value.get("description"),
                    "date_hint": value.get("date"), "provider_path": path + "/" + name,
                    "provider_position": value.get("position")})
            for name, child in value.items(): walk(child, path + "/" + name)
        elif isinstance(value, list):
            for index, child in enumerate(value): walk(child, path + "/" + str(index))
    walk(payload, "")
    return records


class GoogleDiscovery:
    def __init__(self, pool: SourcePool, budget_file: Path | None, *, request_id: str | None = None):
        self.pool, self.budget = pool, DiscoveryBudget(budget_file)
        self.request_id = request_id

    def search(self, query: str, *, topic_ids: list[str], context: dict | None = None) -> dict:
        """Explicit metadata search; retains raw evidence and all candidate occurrences.

        Free Plan must be confirmed. Failure/timeout consumes a started request,
        stays visible in the archive and never becomes a market missing/zero value.
        """
        if not isinstance(query, str) or not query.strip() or len(query) > 500:
            raise DiscoveryError("invalid_search_query", "Search query must contain 1–500 characters.")
        if not topic_ids or any(topic not in TOPICS for topic in topic_ids):
            raise DiscoveryError("invalid_search_topics", "Select known business dimensions.")
        identifier = "google-" + uuid4().hex
        run = {"id": identifier, "provider": "serpapi_google", "query": query,
            "topic_ids": list(dict.fromkeys(topic_ids)), "intent_context": context,
            "status": "not_executed", "started_at": _now()}
        directory = self.pool.directory / "evidence" / identifier
        directory.mkdir(parents=True, exist_ok=False)
        def save(name, value):
            with (directory / name).open("x", encoding="utf-8") as file: json.dump(value, file, ensure_ascii=False, indent=2)
        started = time.monotonic()
        key = None
        search_started = False
        try:
            # Check consent/cap before credential lookup or network I/O.
            state = self.budget.ensure_active()
            if state.get("serpapi_search_http_starts", 0) >= state.get("serpapi_search_http_start_cap", 0):
                raise DiscoveryError("search_budget_exhausted", "Authorized Google search starts exhausted; no automatic renewal.")
            if self.request_id:
                self.budget.google_attempt(self.request_id)
            key = _key()
            def fetch(kind, parameters):
                nonlocal search_started
                self.budget.start(kind, identifier, query)
                if kind == "search": search_started = True
                endpoint = "https://serpapi.com/account.json" if kind == "account" else "https://serpapi.com/search"
                save(kind + "-input.json", {"endpoint": endpoint, "parameters": parameters,
                    "api_key_intentionally_excluded": True, "timeout_seconds": 90, "started_at": _now()})
                begin = time.monotonic()
                execution = {"endpoint": endpoint, "started_at": _now(), "phase": "connect_or_response_headers"}
                try:
                    request = Request(endpoint + "?" + urlencode({**parameters, "api_key": key}),
                        headers={"Accept": "application/json", "User-Agent": "LondonOfficeMonitor/0.1"})
                    with _open(request, timeout=90) as response:
                        execution.update(http_status=response.status, seconds_to_headers=time.monotonic() - begin, phase="response_body")
                        raw = response.read(2 * 1024 * 1024 + 1)
                    if len(raw) > 2 * 1024 * 1024:
                        raise DiscoveryError("search_response_too_large", "Search metadata exceeds bounded capture; no body truncated into candidates.")
                    if execution["http_status"] != 200:
                        raise DiscoveryError("search_http_error", "Provider HTTP response was not successful; no automatic retry.")
                    payload = json.loads(raw)
                    if kind == "search":
                        if _contains_credential(payload, key):
                            raise DiscoveryError("credential_echo_refused", "Provider echoed the credential; response body not retained.")
                        with (directory / "search-response.json").open("xb") as file: file.write(raw)
                    if not isinstance(payload, dict) or payload.get("error"):
                        raise DiscoveryError("search_provider_error", "Provider did not return successful metadata; no source absence inferred.")
                    execution["phase"] = "completed"
                    return payload
                except HTTPError as error:
                    execution.update(http_status=error.code, error_type=type(error).__name__)
                    raise DiscoveryError("search_http_error", "Provider HTTP request failed; no retry or endpoint fallback.") from error
                finally:
                    execution.update(completed_at=_now(), elapsed_seconds=time.monotonic() - begin)
                    save(kind + "-execution.json", execution)
            account = fetch("account", {})
            quota = {name: account.get(name) for name in ["account_status", "plan_name", "plan_monthly_price", "total_searches_left", "this_hour_searches", "account_rate_limit_per_hour"]}
            if _contains_credential(quota, key):
                raise DiscoveryError("credential_echo_refused", "Provider echoed the credential in quota metadata; not retained.")
            save("quota-whitelist.json", quota)  # Raw account response contains key/email and is never retained.
            price = account.get("plan_monthly_price")
            available = [account.get(name) for name in ["total_searches_left", "this_hour_searches", "account_rate_limit_per_hour"]]
            if (account.get("account_status") != "Active" or isinstance(price, bool) or price != 0
                or "free" not in str(account.get("plan_name") or "").casefold()
                or not all(isinstance(x, int) and not isinstance(x, bool) and x >= 0 for x in available)
                or available[0] < 1 or available[2] - available[1] < 1):
                raise DiscoveryError("free_quota_unconfirmed", "Active Free Plan and available quota not confirmed; no search, upgrade or paid fallback.")
            parameters = {"engine": "google", "q": query, "start": 0, "google_domain": "google.co.uk",
                "hl": "en", "gl": "uk", "device": "desktop", "output": "json", "async": "false", "no_cache": "false"}
            payload = fetch("search", parameters)
            if (payload.get("search_metadata") or {}).get("status") != "Success":
                raise DiscoveryError("search_incomplete", "Provider search Success not confirmed; failure is not an empty market.")
            occurrences = _occurrences(payload)
            run.update(status="completed_metadata_only" if occurrences else "completed_no_candidates",
                completed_at=_now(), elapsed_seconds=time.monotonic() - started)
            view = self.pool.record(run, occurrences)
            self.budget.change(lambda data: data["jobs"][identifier].update(status=run["status"], completed_at=run["completed_at"]))
            return {"schema_version": 1, "status": run["status"], "run": run,
                "candidates": [source for source in view["candidates"] if any(item["run_id"] == identifier for item in source["occurrences"])],
                "returned_occurrences": len(occurrences), "warnings": view["warnings"]}
        except Exception as error:
            safe = error if isinstance(error, DiscoveryError) else DiscoveryError("google_discovery_failed", "Google discovery failed; see private execution evidence. No retry or simulated answer.")
            run.update(status="failed" if search_started else "not_executed", completed_at=_now(),
                elapsed_seconds=time.monotonic() - started, error={"code": safe.code, "message": safe.message})
            # Do not erase a completed record if a later receipt write failed.
            if not (self.pool.directory / "records" / f"{identifier}.json").exists(): self.pool.record(run, [])
            save("failure.json", {"error": run["error"], "error_type": type(error).__name__, "search_started": search_started})
            raise safe from error


class DiscoveryTools:
    """The explicit discovery profile exposes one controlled Google metadata tool.

    Ordinary BusinessTools remain the existing six; this profile cannot publish
    observations, run shell commands or fetch arbitrary source URLs.
    """
    def __init__(self, discovery: GoogleDiscovery, *, topic_ids: list[str], context: dict | None = None):
        self.discovery, self.topic_ids, self.context = discovery, topic_ids, context
        self._calls = 0

    @staticmethod
    def list_tools() -> list[dict]:
        return [{"name": "google_search_sources", "description": "Search Google for source candidates in the explicitly requested London office business dimensions. Returns unverified index metadata, not market facts. At most one Google call in this discovery turn; raw candidates are archived, not truncated or published.",
            "inputSchema": {"type": "object", "properties": {"query": {"type": "string", "minLength": 1, "maxLength": 500}}, "required": ["query"], "additionalProperties": False},
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": False, "openWorldHint": True}}]

    def call(self, name: str, arguments: dict) -> dict:
        if name != "google_search_sources" or not isinstance(arguments, dict) or set(arguments) != {"query"}:
            raise DiscoveryError("discovery_tool_not_allowed", "Only google_search_sources(query) is allowed in this profile.")
        if self._calls >= 1:
            raise DiscoveryError("discovery_query_limit", "This explicit discovery turn already attempted its one Google query; no automatic expansion or retry.")
        self._calls += 1
        return self.discovery.search(arguments["query"], topic_ids=self.topic_ids, context=self.context)
