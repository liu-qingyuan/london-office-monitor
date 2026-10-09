"""Official Codex SDK Adapter: auth, threads, restricted MCP and result conversion.

No caller sees an SDK object. This is ONE implementation, not a runtime plugin
framework. Subscription credentials stay in a dedicated SDK-managed home.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field, ValidationError
from .data import ROOT
from .settings import Settings
from .tools import BusinessTools


class AgentError(Exception):
    def __init__(self, code: str, message: str):
        self.code, self.message = code, message
        super().__init__(message)


class _Answer(BaseModel):
    model_config = ConfigDict(extra="forbid")
    answer: str = Field(min_length=1, max_length=6000, description="Qualitative evidence interpretation only. No digits, amounts, dates, source IDs, spelled-out numerical amounts or numbered lists. Python fact/calculation/source cards supply all figures with their binding.")
    fact_ids: list[str]
    calculation_ids: list[str]
    source_ids: list[str]
    warnings: list[str] = Field(description="Qualitative warnings only; no figures or dates. Python already preserves reported and calculated values and missingness warnings.")


def sdk_config(settings: Settings):
    """Create config without reading personal auth/config or starting a runtime."""
    from openai_codex import CodexConfig
    settings.validate()
    # The SDK MERGES env into os.environ. Deleting keys from a copied dict would
    # not clear inherited API keys; explicit empty values are required here.
    env = {"CODEX_HOME": str(settings.codex_home.expanduser().resolve()),
        "OPENAI_API_KEY": "", "CODEX_API_KEY": ""}
    if settings.auth_mode == "api-key":
        key = os.environ.get("LONDON_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not key:
            raise AgentError("api_key_required", "API-key mode is separately billed. Set your own OPENAI_API_KEY explicitly.")
        env["OPENAI_API_KEY"] = key
    return CodexConfig(cwd=str(ROOT), env=env, config_overrides=(
        'model_provider="openai"', 'web_search="disabled"',
        'features.shell_tool=false', 'features.collab=false',
        'features.multi_agent=false', 'features.multi_agent_v2=false',
        'features.view_image=false', 'features.browser_use=false', 'features.computer_use=false',
        # 0.162.0 routes even direct MCP calls through this internal host. Disabling
        # it leaves inventory connected but rejects tool routing. No model code tool.
        'features.js_repl=false', 'features.code_mode=false', 'features.code_mode_host=true',
        'features.apps=false', 'features.plugins=false', 'features.memories=false', 'features.memory_tool=false',
        'skills={include_instructions=false,bundled={enabled=false}}',
        'project_doc_max_bytes=0', 'cli_auth_credentials_store="file"',
    ))


def _numeric_prose(text: str) -> bool:
    # Prose cannot assign a tool's scalar to another subject. Only Python cards
    # may display quantities. This is not a semantic proof of AI interpretation.
    # Preserve the missing-is-not-zero principle; it asserts no observed quantity.
    text = re.sub(r"不(?:代表|意味着)(?:租金|空置率|观察值|数值)?(?:为|是)?零", "缺失值不可用", text)
    text = re.sub(r"(?:not|does not mean|is not equivalent to)\s+(?:a\s+)?zero", "missing", text, flags=re.IGNORECASE)
    english = r"\b(?:zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion|trillion)\b"
    chinese = "零〇一二两三四五六七八九十百千万亿壹贰叁肆伍陆柒捌玖拾佰仟"
    pattern = rf"\d|{english}|[{chinese}]{{2,}}|百分之[{chinese}]|[{chinese}]+\s*(?:英镑|磅|%|％|个百分点|基点|倍)|(?:租金|空置率|增长率|价格)\s*(?:为|是|约|达到|达|=)\s*[{chinese}]"
    return re.search(pattern, text, re.IGNORECASE) is not None


def grounded_answer(payload: dict, events: list[dict]) -> dict:
    """Validate the external model answer and construct facts from Python outputs.

    Offline contract tests can exercise this Seam; they are not model evidence.
    Prose is qualitative; numeric facts/labels come only from Python objects.
    This verifies bindings and citations, not every qualitative semantic assertion.
    """
    try:
        answer = _Answer.model_validate(payload)
    except ValidationError as error:
        raise AgentError("invalid_answer", "The model did not return the agreed answer schema.") from error
    successful = [e for e in events if e.get("ok")]
    if not any(e["name"] in {"market_query", "market_brief", "compare_periods"} for e in successful):
        raise AgentError("no_business_tool", "No successful Python market tool executed in this turn; no answer accepted.")
    outputs = [e["output"] for e in successful]
    collect = lambda key: {item["id"]: item for out in outputs for item in out.get(key, [])}
    facts, calculations, sources, evidence, notes = (collect(k) for k in ["observations", "comparisons", "sources", "evidence", "notes"])
    if not set(answer.fact_ids) <= facts.keys() or not set(answer.calculation_ids) <= calculations.keys() or not set(answer.source_ids) <= sources.keys():
        raise AgentError("invalid_citation", "The model referenced a fact, calculation or source outside this turn's tool evidence.")
    selected_facts = [facts[key] for key in dict.fromkeys(answer.fact_ids)]
    selected_calculations = [calculations[key] for key in dict.fromkeys(answer.calculation_ids)]
    required_sources = {f["source_id"] for f in selected_facts if f.get("source_id")}
    required_sources.update(s for c in selected_calculations for s in c["source_ids"])
    if not required_sources <= set(answer.source_ids):
        raise AgentError("missing_citation", "Selected observations/calculations require all original source citations, including baselines.")
    if not answer.fact_ids and not answer.calculation_ids:
        raise AgentError("no_selected_evidence", "The answer must identify the Python facts or calculations supporting it.")
    if _numeric_prose(answer.answer + " " + " ".join(answer.warnings)):
        raise AgentError("unsupported_number", "Model prose must remain qualitative. Figures, dates and their area/metric/source bindings are displayed only from Python fact/calculation/source objects; no answer accepted.")
    warnings = [w for out in outputs for w in out.get("warnings", [])] + answer.warnings
    warnings.append("Historical report snapshots, not a live market feed. Interpretation is AI-generated; verified numeric facts and calculations are shown separately.")
    selected_sources = [sources[key] for key in dict.fromkeys(answer.source_ids)]
    return {"answer": answer.answer, "facts": selected_facts, "calculations": selected_calculations,
        "sources": selected_sources,
        "evidence": [e for e in evidence.values() if e["source_id"] in answer.source_ids],
        "notes": [n for n in notes.values() if n["source_id"] in answer.source_ids],
        "warnings": list(dict.fromkeys(warnings)),
        "tool_calls": [{"name": e["name"], "arguments": e["arguments"], "ok": e["ok"]} for e in events]}


@dataclass
class _Session:
    id: str
    codex: object
    thread: object
    trace: Path
    lock: threading.Lock = field(default_factory=threading.Lock)


class CodexAdapter:
    def __init__(self, settings: Settings | None = None):
        self.settings = settings or Settings.from_env()
        self.settings.validate()
        self._sessions: dict[str, _Session] = {}
        self._lock = threading.Lock()
        self._turns = 0
        self._data_hash = hashlib.sha256((ROOT / "data/snapshot.json").read_bytes()).hexdigest()

    def _open(self):
        from openai_codex import Codex
        home = self.settings.codex_home.expanduser().resolve()
        home.mkdir(parents=True, exist_ok=True, mode=0o700)
        try:
            codex = Codex(config=sdk_config(self.settings))
            if self.settings.auth_mode == "api-key":
                key = os.environ.get("LONDON_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
                codex.login_api_key(key)
            return codex
        except AgentError:
            raise
        except Exception as error:
            raise AgentError("runtime_start_failed", "The pinned Codex runtime could not start. Check the project installation and dedicated home permissions.") from error

    def _check_account(self, codex):
        account = codex.account().account
        if account is None:
            raise AgentError("login_required", "Run `uv run london-office login` in this project and sign in with your own Codex/ChatGPT account.")
        account = getattr(account, "root", account)
        actual = getattr(account, "type", None)
        expected = "chatgpt" if self.settings.auth_mode == "subscription" else "apiKey"
        if actual != expected:
            raise AgentError("auth_mode_mismatch", "Authentication mode differs from the explicitly configured mode; no automatic API-key fallback is allowed.")
        return {"authenticated": True, "auth_mode": self.settings.auth_mode}

    def status(self) -> dict:
        with self._open() as codex:
            try:
                return self._check_account(codex)
            except AgentError as error:
                if error.code == "login_required":
                    return {"authenticated": False, "auth_mode": self.settings.auth_mode}
                raise

    def models(self) -> list[str]:
        with self._open() as codex:
            self._check_account(codex)
            return [m.model for m in codex.models().data]

    def login(self, *, device: bool = False):
        """Perform the SDK's login ceremony; never inspect or copy credential files."""
        with self._open() as codex:
            if self.settings.auth_mode == "api-key":
                print("API-key mode explicitly selected; subsequent model use is separately billed.", flush=True)
                return self._check_account(codex)
            handle = codex.login_chatgpt_device_code() if device else codex.login_chatgpt()
            if device:
                print(f"Open: {handle.verification_url}\nDevice code: {handle.user_code}", flush=True)
            else:
                print(f"Open this SDK login URL in your own browser:\n{handle.auth_url}", flush=True)
            completed = handle.wait()
            if not completed.success:
                raise AgentError("login_failed", "SDK login did not complete successfully. No credentials were copied.")
            return self._check_account(codex)

    def _new_session(self) -> _Session:
        from openai_codex import Sandbox, ApprovalMode
        codex = self._open()
        try:
            self._check_account(codex)
            available = {m.model: m for m in codex.models().data}
            if self.settings.model not in available:
                raise AgentError("model_unavailable", "Configured model is not available to this account. Run `uv run london-office models` and set LONDON_MODEL explicitly.")
            identifier = str(uuid4())
            self.settings.run_dir.mkdir(parents=True, exist_ok=True)
            trace = self.settings.run_dir / f"{identifier}.tools.jsonl"
            instructions = "You are an evidence-led London OFFICE commercial real estate assistant.\n" + "\n".join((ROOT / path).read_text() for path in ["skills/market-monitor/SKILL.md", "skills/evidence-check/SKILL.md"])
            names = [t["name"] for t in BusinessTools().list_tools()]
            thread = codex.thread_start(model=self.settings.model, cwd=str(ROOT), ephemeral=True,
                sandbox=Sandbox.read_only, approval_mode=ApprovalMode.deny_all,
                base_instructions=instructions,
                config={"mcp_servers": {"london_office": {"command": sys.executable,
                    "args": ["-m", "london_office.mcp_server", "--trace", str(trace)],
                    "enabled": True, "enabled_tools": names,
                    "tools": {name: {"approval_mode": "approve"} for name in names}}}})
            return _Session(identifier, codex, thread, trace)
        except Exception:
            codex.close()
            raise

    def ask(self, question: str, *, session_id: str | None = None, context: dict | None = None) -> dict:
        if not self.settings.agent_enabled:
            raise AgentError("agent_disabled", "Agent is disabled for this offline run. No model response has been simulated.")
        if not question.strip() or len(question) > 2000:
            raise AgentError("invalid_question", "Question must contain 1–2000 characters.")
        if hashlib.sha256((ROOT / "data/snapshot.json").read_bytes()).hexdigest() != self._data_hash:
            raise AgentError("snapshot_changed", "Snapshot changed after startup. Restart to keep map and tool results consistent.")
        if context:
            allowed = {"area_id", "metric", "period"}
            if not context.keys() <= allowed:
                raise AgentError("invalid_context", "Unknown map context field.")
            from .market import Market
            try:
                Market().query(**{("area" if k == "area_id" else k): v for k, v in context.items()})
            except ValueError as error:
                raise AgentError("invalid_context", str(error)) from error
        with self._lock:
            if self._turns >= self.settings.max_turns:
                raise AgentError("turn_budget_exhausted", "Configured per-process turn limit reached; no API fallback or automatic retry performed.")
            if session_id:
                session = self._sessions.get(session_id)
                if session is None:
                    raise AgentError("unknown_session", "Session does not exist or server restarted. Start a new conversation.")
            else:
                session = self._new_session()
                self._sessions[session.id] = session
            if not session.lock.acquire(blocking=False):
                raise AgentError("session_busy", "A turn is already running in this session.")
            self._turns += 1
        run_id = str(uuid4())
        start = len(session.trace.read_text().splitlines()) if session.trace.exists() else 0
        expired = threading.Event()
        handle = None

        def timeout():
            expired.set()
            session.codex.close()

        timer = threading.Timer(self.settings.turn_timeout_s, timeout)
        timer.daemon = True
        timer.start()
        try:
            prompt = question
            if context:
                prompt += "\nMap context (selection only, not evidence; explicit question takes priority): " + json.dumps(context)
            handle = session.thread.turn(prompt, effort="low", output_schema=_Answer.model_json_schema())
            result = handle.run()
            if str(result.status.value) != "completed":
                raise AgentError("turn_incomplete", "Codex did not complete the turn; no answer accepted.")
            events = [json.loads(line) for line in session.trace.read_text().splitlines()[start:]] if session.trace.exists() else []
            text = (result.final_response or "").strip()
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            try:
                payload = json.loads(text)
            except json.JSONDecodeError as error:
                raise AgentError("invalid_answer", "Codex returned invalid structured answer JSON.") from error
            try:
                converted = grounded_answer(payload, events)
            except AgentError as error:
                # Keep rejected raw domain output for diagnosis; never return it as
                # a verified answer or include local runtime traces in the bundle.
                with (self.settings.run_dir / "rejected-turns.jsonl").open("a") as file:
                    file.write(json.dumps({"run_id":run_id,"session_id":session.id,
                        "question":question,"context":context,"raw_answer":payload,
                        "error":{"code":error.code,"message":error.message},
                        "tool_events":events},ensure_ascii=False) + "\n")
                raise
            response = {"schema_version": 1, "session_id": session.id, "run_id": run_id, "status": "completed", **converted}
            usage = result.usage.model_dump(mode="json") if result.usage else None
            with (self.settings.run_dir / "turns.jsonl").open("a") as file:
                file.write(json.dumps({"run_id": run_id, "session_id": session.id,
                    "model": self.settings.model, "question": question, "context": context,
                    "answer": response, "usage": usage, "tool_events": events}, ensure_ascii=False) + "\n")
            return response
        except AgentError:
            raise
        except Exception as error:
            if expired.is_set():
                raise AgentError("turn_timeout", "The turn exceeded its configured timeout and the dedicated runtime was closed.") from error
            raise AgentError("runtime_error", "Codex could not finish the turn. No model answer was accepted; check login, account availability and the local tool trace.") from error
        finally:
            timer.cancel()
            if expired.is_set():
                with self._lock:
                    self._sessions.pop(session.id, None)
            session.lock.release()

    def close(self):
        for session in self._sessions.values():
            session.codex.close()
        self._sessions.clear()
