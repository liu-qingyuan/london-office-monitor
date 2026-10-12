"""Explicit user-owned discovery grants; no model tool can create or renew one."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import re
from uuid import uuid4
from .discovery import DiscoveryBudget, DiscoveryError
from .storage import file_lock, atomic_json


class DiscoveryAuthorization:
    def __init__(self, directory: Path, legacy_receipt: Path | None = None):
        self.directory, self.legacy_receipt = directory, legacy_receipt

    def _index(self):
        path = self.directory / "active.json"
        if not path.exists():
            return {"schema_version": 1, "active_id": None, "requests": {}}
        if path.is_symlink():
            raise DiscoveryError("invalid_discovery_budget", "Authorization index cannot be a symbolic link.")
        try:
            index = json.loads(path.read_text(encoding="utf-8"))
            if index["schema_version"] != 1 or not isinstance(index["requests"], dict):
                raise ValueError("Unknown index")
            if index["active_id"] is not None:
                self._grant_path(index["active_id"])
            return index
        except (ValueError, KeyError, TypeError, OSError) as error:
            raise DiscoveryError("invalid_discovery_budget", "Authorization index is unavailable; no fallback or renewal.") from error

    def _grant_path(self, identifier):
        if not isinstance(identifier, str) or not re.fullmatch(r"grant-[a-f0-9]{32}", identifier):
            raise DiscoveryError("invalid_discovery_authorization", "Unknown authorization identifier; file paths are not accepted.")
        return self.directory / (identifier + ".json")

    def resolve(self, authorization_id: str | None = None) -> Path | None:
        if self.directory.is_symlink():
            raise DiscoveryError("invalid_discovery_budget", "Authorization directory cannot be a symbolic link.")
        if authorization_id == "legacy":
            if self.legacy_receipt is None:
                raise DiscoveryError("discovery_authorization_required", "No legacy authorization was configured.")
            return self.legacy_receipt
        if authorization_id is not None:
            path = self._grant_path(authorization_id)
            if not path.is_file() or path.is_symlink():
                raise DiscoveryError("discovery_authorization_required", "The requested authorization is unavailable.")
            return path
        identifier = self._index()["active_id"]
        return self._grant_path(identifier) if identifier else self.legacy_receipt

    @staticmethod
    def _counts(data, cap_key, starts_key):
        cap, starts = data.get(cap_key), data.get(starts_key)
        if not all(type(value) is int and value >= 0 for value in (cap, starts)) or starts > cap:
            raise DiscoveryError("invalid_discovery_budget", "Authorization counts are invalid; no execution.")
        return {"cap": cap, "starts": starts, "remaining": cap - starts}

    def status(self, authorization_id: str | None = None):
        result = {"schema_version": 1, "status": "not_configured", "authorization_id": None,
            "authorization_source": None, "authorized_at": None, "expires_at": None,
            "google": {"cap": 0, "starts": 0, "remaining": 0},
            "model_turns": {"cap": 0, "starts": 0, "remaining": 0}, "warnings": [
                "Subscription caller turns do not cap internal native HTTP requests, tokens or monetary cost."]}
        try:
            path = self.resolve(authorization_id)
            if path is None:
                return result
            budget = DiscoveryBudget(path)
            data = budget.inspect()
            source = "web" if data.get("authorization_source") == "web" else "legacy"
            identifier = data.get("authorization_id") if source == "web" else "legacy"
            if source == "web" and self._grant_path(identifier) != path:
                raise DiscoveryError("invalid_discovery_budget", "Authorization identity does not match its receipt.")
            google = self._counts(data, "serpapi_search_http_start_cap", "serpapi_search_http_starts")
            model = self._counts(data, "codex_turn_start_cap", "codex_turn_starts")
            role = self._counts({"cap": data.get("codex_native_discovery_turn_start_cap", 2),
                "starts": data.get("codex_native_discovery_turn_starts", 0)}, "cap", "starts")
            model["remaining"] = min(model["remaining"], role["remaining"])
            result.update(authorization_id=identifier, authorization_source=source,
                authorized_at=data.get("authorized_at"), expires_at=data.get("expires_at"), google=google, model_turns=model)
            try:
                budget._validity(data)
            except DiscoveryError as error:
                if error.code != "discovery_authorization_expired":
                    raise
                result["status"] = "expired"
                return result
            result["status"] = "active" if google["remaining"] > 0 and model["remaining"] > 0 else "exhausted"
            if result["expires_at"] is None:
                result["warnings"].append("Legacy receipt has no recorded expiry; no lifetime or renewed allowance has been inferred.")
        except (DiscoveryError, OSError, ValueError) as error:
            result["status"] = "invalid"
            result["warnings"].append(error.message if isinstance(error, DiscoveryError) else "Authorization state is unavailable; no execution.")
        return result

    def authorize(self, *, google_cap: int, model_turn_cap: int, valid_for_minutes: int, request_id: str):
        if (not all(type(value) is int for value in (google_cap, model_turn_cap, valid_for_minutes))
                or not 1 <= google_cap <= 100 or not 1 <= model_turn_cap <= 100 or not 1 <= valid_for_minutes <= 1440
                or not isinstance(request_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", request_id)):
            raise DiscoveryError("invalid_discovery_authorization", "Explicit positive finite limits and a user-action request ID are required.")
        if self.directory.is_symlink():
            raise DiscoveryError("invalid_discovery_budget", "Authorization directory cannot be a symbolic link.")
        self.directory.mkdir(parents=True, exist_ok=True)
        parameters = {"google_cap": google_cap, "model_turn_cap": model_turn_cap, "valid_for_minutes": valid_for_minutes}
        with file_lock(self.directory / "authorization.lock"):
            index = self._index()
            prior = index["requests"].get(request_id)
            if prior:
                if prior.get("parameters") != parameters:
                    raise DiscoveryError("authorization_request_conflict", "This user-action ID already approved different limits; no new grant created.")
                identifier = prior["authorization_id"]
            else:
                identifier = "grant-" + uuid4().hex
                now = datetime.now(timezone.utc)
                receipt = {"schema_version": 1, "authorization_id": identifier, "authorization_source": "web",
                    "authorization": "Local user explicitly approved finite free-quota Google starts and subscription discovery caller turns. No paid fallback, renewal, market validation or research publication.",
                    "authorized_at": now.isoformat(), "expires_at": (now+timedelta(minutes=valid_for_minutes)).isoformat(),
                    "serpapi_search_http_start_cap": google_cap, "serpapi_search_http_starts": 0, "account_http_starts": 0,
                    "codex_turn_start_cap": model_turn_cap, "codex_turn_starts": 0,
                    "codex_native_discovery_turn_start_cap": model_turn_cap, "codex_native_discovery_turn_starts": 0,
                    "codex_market_validation_turn_start_cap": 0, "codex_market_validation_turn_starts": 0, "jobs": {}}
                path = self._grant_path(identifier)
                if path.exists():
                    raise DiscoveryError("invalid_discovery_budget", "Grant identity collision; no receipt replaced.")
                atomic_json(path, receipt)
                index["requests"][request_id] = {"authorization_id": identifier, "parameters": parameters}
                index["active_id"] = identifier
                atomic_json(self.directory / "active.json", index)
        return self.status(identifier)
