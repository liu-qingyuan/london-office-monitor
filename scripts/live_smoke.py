"""Three REAL model turns; no fixtures, substitute answers or automatic retries.

Run only after your own login. This script uses the app's Codex Adapter and stores
curated answers, checks and actual Python tool events in ignored artifacts/.
"""
from __future__ import annotations

import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from london_office.runtime import AgentError, CodexAdapter
from london_office.settings import Settings

QUESTIONS = [
    "比较 City 和 West End 在 2024 年末与 2025 年末报告中的平均 prime 成交租金及 Python 计算变化。分别展示机构公布增长与计算结果，明确说明不一致的原因是否已核验。",
    "接着比较 City 在这两期报告中的整体空置率变化，请使用百分点，不要换成 Grade A tower 空置率。",
    "那么 Canary Wharf 在 2025 年末的同口径 prime 租金是多少？缺失时明确说明，不要估计。",
]


def checks(answer: dict, index: int) -> dict:
    facts = {(f["area_id"], f["metric"], f["period"]): f for f in answer["facts"]}
    comparisons = {(c["area_id"], c["metric"]): c for c in answer["calculations"]}
    result = {"actual_python_tools": any(t["ok"] and t["name"] in {"market_query", "market_brief", "compare_periods"} for t in answer["tool_calls"])}
    if index == 0:
        for area, expected in [("city", 6.75), ("west_end", 5.78)]:
            comparison = comparisons.get((area, "prime_rent"), {})
            result[f"{area}_python_change"] = comparison.get("change_value") == expected and comparison.get("change_unit") == "%"
        west = comparisons.get(("west_end", "prime_rent"), {})
        result["reported_conflict_preserved"] = west.get("reported_change_pct") == 6.1 and any("reported_growth_mismatch" in w for w in west.get("warnings", []))
        result["both_period_sources_cited"] = {"savills-2024-q4", "savills-2025-q4"} <= {s["id"] for s in answer["sources"]}
    elif index == 1:
        comparison = comparisons.get(("city", "vacancy_rate"), {})
        result["overall_vacancy_percentage_points"] = comparison.get("change_value") == -0.9 and comparison.get("change_unit") == "percentage points"
    else:
        fact = facts.get(("canary_wharf", "prime_rent", "2025-YE"))
        result["missing_not_zero_or_estimated"] = bool(fact and fact["status"] == "missing" and fact["value"] is None and fact["source_id"] is None)
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--allow-paid-api", action="store_true", help="Explicitly permit separately billed API-key mode for your own account")
    args = parser.parse_args()
    settings = Settings.from_env()
    output = Path(__file__).resolve().parents[1] / "artifacts/live-smoke.json"
    output.parent.mkdir(exist_ok=True)
    evidence = {"kind":"real_model_smoke", "started_at":datetime.now(timezone.utc).isoformat(),
        "model":settings.model,"auth_mode":settings.auth_mode,"dataset":"historical_market", "turns":[], "passed":False}
    adapter = CodexAdapter(settings)
    try:
        if settings.auth_mode == "api-key" and not args.allow_paid_api:
            raise AgentError("paid_calls_not_approved", "Pass --allow-paid-api only if you explicitly accept separate API billing.")
        status = adapter.status()
        evidence["account_status"] = status
        if not status["authenticated"]:
            raise AgentError("login_required", "Complete your own SDK login before running real model evidence tests.")
        evidence["available_models"] = adapter.models()
        session_id = None
        for index, question in enumerate(QUESTIONS):
            answer = adapter.ask(question, session_id=session_id)
            session_id = answer["session_id"]
            evidence["turns"].append({"question":question, "answer":answer, "checks":checks(answer,index)})
            print(json.dumps(evidence["turns"][-1]["checks"], ensure_ascii=False), flush=True)
        evidence["passed"] = all(all(t["checks"].values()) for t in evidence["turns"])
    except AgentError as error:
        evidence["error"] = {"code":error.code,"message":error.message}
        print(json.dumps(evidence["error"], ensure_ascii=False), flush=True)
    finally:
        adapter.close()
        evidence["completed_at"] = datetime.now(timezone.utc).isoformat()
        output.write_text(json.dumps(evidence,ensure_ascii=False,indent=2) + "\n")
    print(f"Evidence: {output}", flush=True)
    return 0 if evidence["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
