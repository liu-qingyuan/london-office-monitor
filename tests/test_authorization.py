"""Offline consent contracts; no key lookup, SDK account or external request."""
import json
from datetime import datetime, timedelta, timezone
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import unittest

from london_office.discovery import DiscoveryBudget, DiscoveryError, GoogleDiscovery
from london_office.source_pool import SourcePool


def receipt(*, expires_at=None):
    return {"authorization": "Synthetic test consent only", "authorized_at": datetime.now(timezone.utc).isoformat(),
        "expires_at": expires_at or (datetime.now(timezone.utc) + timedelta(minutes=5)).isoformat(),
        "serpapi_search_http_start_cap": 2, "serpapi_search_http_starts": 0, "account_http_starts": 0,
        "codex_turn_start_cap": 2, "codex_turn_starts": 0,
        "codex_native_discovery_turn_start_cap": 2, "codex_native_discovery_turn_starts": 0,
        "codex_market_validation_turn_start_cap": 0, "codex_market_validation_turn_starts": 0, "jobs": {}}


class ExpiryTests(unittest.TestCase):
    def test_expired_receipt_blocks_model_account_and_search_starts(self):
        with TemporaryDirectory() as directory:
            path = Path(directory) / "budget.json"
            original = receipt(expires_at=(datetime.now(timezone.utc)-timedelta(seconds=1)).isoformat())
            path.write_text(json.dumps(original), encoding="utf-8")
            budget = DiscoveryBudget(path)
            for operation in (lambda: budget.start_turn("native_discovery", "fixture", "Fixture"),
                              lambda: budget.start("account", "fixture", "Fixture"),
                              lambda: budget.start("search", "fixture", "Fixture"),
                              lambda: budget.google_attempt("fixture")):
                with self.assertRaises(DiscoveryError) as failure:
                    operation()
                self.assertEqual(failure.exception.code, "discovery_authorization_expired")
            self.assertEqual(json.loads(path.read_text(encoding="utf-8")), original)
            with patch("london_office.discovery._key") as key, patch("london_office.discovery._open") as network:
                with self.assertRaises(DiscoveryError):
                    GoogleDiscovery(SourcePool(Path(directory)/"pool"), path).search("Fixture", topic_ids=["rents"])
                key.assert_not_called()
                network.assert_not_called()


class WebAuthorizationTests(unittest.TestCase):
    def test_user_grant_is_finite_durable_and_idempotent_without_resetting_legacy(self):
        from london_office.authorization import DiscoveryAuthorization
        with TemporaryDirectory() as directory:
            root = Path(directory)
            legacy = root / "legacy.json"
            old = receipt()
            old["serpapi_search_http_starts"] = 2
            old["codex_turn_starts"] = 2
            legacy.write_text(json.dumps(old), encoding="utf-8")
            original = legacy.read_bytes()
            grants = DiscoveryAuthorization(root/"web", legacy)
            self.assertEqual(grants.status()["status"], "exhausted")
            self.assertEqual(list(root.glob("web/*")), [])
            status = grants.authorize(google_cap=2, model_turn_cap=1, valid_for_minutes=5, request_id="fixture-action")
            self.assertEqual(status["status"], "active")
            self.assertEqual(status["google"]["remaining"], 2)
            deadline = datetime.fromisoformat(status["expires_at"])
            self.assertGreater(deadline, datetime.now(timezone.utc))
            budget = DiscoveryBudget(grants.resolve(status["authorization_id"]))
            budget.start_turn("native_discovery", "fixture-model", "Fixture")
            budget.start("search", "fixture-google", "Fixture")
            replay = DiscoveryAuthorization(root/"web", legacy).authorize(google_cap=2, model_turn_cap=1,
                valid_for_minutes=5, request_id="fixture-action")
            self.assertEqual(replay["authorization_id"], status["authorization_id"])
            self.assertEqual(replay["model_turns"]["starts"], 1)
            self.assertEqual(replay["google"]["starts"], 1)
            self.assertEqual(replay["status"], "exhausted")
            self.assertEqual(legacy.read_bytes(), original)
            self.assertEqual(budget.inspect()["codex_market_validation_turn_start_cap"], 0)


if __name__ == "__main__":
    unittest.main()
