"""Project configuration. Credentials are managed by the runtime, never serialized."""
from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from .data import ROOT


@dataclass(frozen=True)
class Settings:
    model: str = "gpt-6.1-sol"
    auth_mode: str = "subscription"
    codex_home: Path = Path.home() / ".local/share/london-office-monitor/codex"
    run_dir: Path = ROOT / "var/runs"
    discovery_dir: Path = ROOT / "var/discovery"
    discovery_budget_file: Path | None = None
    max_turns: int = 10
    turn_timeout_s: int = 120
    agent_enabled: bool = True

    @classmethod
    def from_env(cls) -> "Settings":
        settings = cls(
            model=os.environ.get("LONDON_MODEL", "gpt-6.1-sol"),
            auth_mode=os.environ.get("LONDON_AUTH_MODE", "subscription"),
            codex_home=Path(os.environ.get("LONDON_CODEX_HOME", str(cls.codex_home))),
            discovery_dir=Path(os.environ.get("LONDON_DISCOVERY_DIR", str(cls.discovery_dir))),
            discovery_budget_file=Path(os.environ["LONDON_DISCOVERY_BUDGET_FILE"]) if os.environ.get("LONDON_DISCOVERY_BUDGET_FILE") else None,
            max_turns=int(os.environ.get("LONDON_MAX_TURNS", "10")),
            turn_timeout_s=int(os.environ.get("LONDON_TURN_TIMEOUT", "120")),
        )
        settings.validate()
        return settings

    def validate(self):
        if self.auth_mode not in {"subscription", "api-key"}:
            raise ValueError("LONDON_AUTH_MODE must be subscription or api-key (separately billed)")
        home = self.codex_home.expanduser().resolve()
        if home == (Path.home() / ".codex").resolve() or home.is_relative_to(ROOT):
            raise ValueError("Use a dedicated Codex home outside this repository, not personal ~/.codex")
        if not 1 <= self.max_turns <= 100 or not 10 <= self.turn_timeout_s <= 600:
            raise ValueError("Turn budget must be 1–100 and timeout must be 10–600 seconds")
