"""Offline runtime-contract tests: no authentication or model calls."""
import json
from pathlib import Path
import unittest
from unittest.mock import patch
from london_office.data import ROOT
from london_office.runtime import AgentError, grounded_answer, sdk_config
from london_office.settings import Settings
from london_office.tools import BusinessTools


class RuntimeTests(unittest.TestCase):
    def test_subscription_explicitly_clears_inherited_key_environment(self):
        with patch.dict("os.environ", {"OPENAI_API_KEY":"TEST-ONLY", "CODEX_API_KEY":"TEST-ONLY", "SERPAPI_API_KEY":"GOOGLE-TEST-ONLY"}):
            config = sdk_config(Settings())
        self.assertEqual(config.env["OPENAI_API_KEY"], "")
        self.assertEqual(config.env["CODEX_API_KEY"], "")
        self.assertEqual(config.env["SERPAPI_API_KEY"], "")
        self.assertNotIn(".codex", Path(config.env["CODEX_HOME"]).parts)
        for feature in ['shell_tool', 'multi_agent', 'multi_agent_v2', 'view_image', 'browser_use', 'computer_use', 'js_repl', 'code_mode', 'apps', 'plugins', 'memories', 'memory_tool']:
            self.assertIn(f'features.{feature}=false', config.config_overrides)
        self.assertIn('skills={include_instructions=false,bundled={enabled=false}}', config.config_overrides)

    def test_sdk_mcp_router_host_is_enabled_without_model_code_execution(self):
        config = sdk_config(Settings())
        self.assertIn('features.code_mode_host=true', config.config_overrides)
        self.assertIn('features.code_mode=false', config.config_overrides)
        self.assertIn('features.js_repl=false', config.config_overrides)
        self.assertIn('features.shell_tool=false', config.config_overrides)

    def test_sdk_turn_schema_requires_research_lists_while_legacy_answers_remain_valid(self):
        from tempfile import TemporaryDirectory
        from threading import Lock
        from types import SimpleNamespace
        from london_office.runtime import CodexAdapter

        arguments = {"area": "city", "metric": "prime_rent", "period": "2025-YE"}
        output = BusinessTools().call("market_query", arguments)
        legacy = {"answer": "Historical source evidence; not live quotes.",
            "fact_ids": ["city-prime-2025"], "calculation_ids": [],
            "source_ids": ["savills-2025-q4"], "warnings": []}
        with TemporaryDirectory(prefix="london-office-schema-") as directory:
            trace = Path(directory) / "tools.jsonl"

            def strict_sdk_turn(prompt, *, effort, output_schema):
                # SDK fixture of the strict structured-output contract, not a model call.
                self.assertEqual(set(output_schema["required"]), set(output_schema["properties"]))
                self.assertIn("research_ids", output_schema["required"])
                self.assertIn("research_comparison_ids", output_schema["required"])
                self.assertFalse(output_schema["additionalProperties"])
                trace.write_text(json.dumps({"name": "market_query", "arguments": arguments,
                    "ok": True, "output": output}) + "\n", encoding="utf-8")
                result = SimpleNamespace(status=SimpleNamespace(value="completed"),
                    final_response=json.dumps(legacy), usage=None)
                return SimpleNamespace(run=lambda: result)

            session = SimpleNamespace(id="offline-schema", trace=trace, lock=Lock(), research_revision=None,
                thread=SimpleNamespace(turn=strict_sdk_turn), close=lambda: None)
            adapter = CodexAdapter(Settings(run_dir=Path(directory)))
            with patch.object(adapter, "_new_session", return_value=session):
                result = adapter.ask("Show historical source evidence.")
            adapter.close()
        self.assertEqual(result["research"], {"records": [], "comparisons": []})
        self.assertEqual(result["facts"][0]["value"], 105.26)

    def test_grounded_answer_uses_python_facts_and_rejects_invention(self):
        output = BusinessTools().call("market_query", {"area":"city", "metric":"prime_rent", "period":"2025-YE"})
        events = [{"name":"market_query", "arguments":{}, "ok":True, "output":output}]
        answer = {"answer":"City 的历史平均 prime rent 见 Python 事实卡；这不是实时行情。", "fact_ids":["city-prime-2025"], "calculation_ids":[], "source_ids":["savills-2025-q4"], "warnings":[]}
        result = grounded_answer(answer, events)
        self.assertEqual(result["facts"][0]["value"], 105.26)
        self.assertEqual(result["facts"][0]["source_id"], "savills-2025-q4")
        with self.assertRaises(AgentError):
            grounded_answer({**answer, "answer":"租金为 999.99。"}, events)
        with self.assertRaises(AgentError):
            grounded_answer({**answer, "source_ids":["MADE-UP"]}, events)
        with self.assertRaises(AgentError):
            grounded_answer(answer, [])

    def test_tool_results_cross_answer_interface_as_actual_business_outputs(self):
        arguments = {"area":"city", "metric":"prime_rent", "previous_period":"2024-YE", "current_period":"2025-YE"}
        output = BusinessTools().call("compare_periods", arguments)
        events = [{"name":"compare_periods", "arguments":arguments, "ok":True,
            "output":output, "call_id":"local-trace-only", "at":"local-trace-only"},
            {"name":"market_query", "arguments":{"metric":"invalid"}, "ok":False,
             "output":{"error":{"code":"tool_error", "message":"Invalid tool arguments"}}}]
        answer = {"answer":"The reported rent rose; the Python comparison retains the source definitions.",
            "fact_ids":["city-prime-2024","city-prime-2025"],
            "calculation_ids":["change:city:prime_rent:2024-YE:2025-YE"],
            "source_ids":["savills-2024-q4","savills-2025-q4"], "warnings":[]}
        result = grounded_answer(answer, events)
        self.assertEqual(result["tool_calls"][0]["output"], output)
        self.assertEqual(result["tool_calls"][0]["arguments"], arguments)
        self.assertEqual(result["tool_calls"][1]["output"], events[1]["output"])
        self.assertFalse(result["tool_calls"][1]["ok"])
        self.assertEqual(set(result["tool_calls"][0]), {"name","arguments","ok","output"})
        self.assertEqual(result["calculations"][0]["change_value"], 6.75)

    def test_dates_and_other_regions_are_not_numeric_prose_evidence(self):
        # Offline adversarial output-boundary test, NOT an actual model answer.
        output = BusinessTools().call("market_brief", {"period":"2025-YE"})
        events = [{"name":"market_brief", "arguments":{}, "ok":True, "output":output}]
        answer = {"answer":"查到历史证据，数值见 Python 事实卡。", "fact_ids":["city-prime-2025"], "calculation_ids":[], "source_ids":["savills-2025-q4"], "warnings":[]}
        for prose in ["City rent is £2025/sq ft.", "City rent is £166.61/sq ft.", "City rent is one hundred pounds per square foot.", "City 租金为一百六十六英镑。"]:
            with self.subTest(prose=prose), self.assertRaises(AgentError):
                grounded_answer({**answer,"answer":prose},events)
        result = grounded_answer(answer,events)
        self.assertEqual(result["facts"][0]["value"],105.26)
        self.assertEqual(result["facts"][0]["area_id"],"city")

    def test_recorded_user_run_keeps_city_evidence_separate_from_canary_map_selection(self):
        fixture = json.loads((ROOT / "frontend/tests/fixtures/city-rent-recorded-run.json").read_text(encoding="utf-8"))
        expected = fixture["response"]
        payload = {"answer":expected["answer"], "fact_ids":[f["id"] for f in expected["facts"]],
            "calculation_ids":[c["id"] for c in expected["calculations"]],
            "source_ids":[s["id"] for s in expected["sources"]], "warnings":[]}
        result = grounded_answer(payload, expected["tool_calls"])
        self.assertEqual(fixture["context"]["area_id"], "canary_wharf")
        self.assertEqual({f["area_id"] for f in result["facts"]}, {"city"})
        self.assertEqual([f["value"] for f in result["facts"]], [98.6,105.26])
        self.assertEqual(result["calculations"][0]["change_value"], 6.75)
        self.assertEqual(result["tool_calls"], expected["tool_calls"])
        for call in result["tool_calls"]:
            self.assertEqual(call["output"], BusinessTools().call(call["name"], call["arguments"]))

    def test_missingness_negation_is_not_an_observed_zero(self):
        output = BusinessTools().call("market_query", {"area":"canary_wharf", "metric":"prime_rent", "period":"2025-YE"})
        events = [{"name":"market_query", "arguments":{}, "ok":True, "output":output}]
        answer = {"answer":"没有已核验的同口径观察，不作估计。", "fact_ids":["canary_wharf-prime_rent-2025-YE"], "calculation_ids":[], "source_ids":[], "warnings":["缺失表示观察不可用，不代表租金为零。"]}
        self.assertIsNone(grounded_answer(answer,events)["facts"][0]["value"])
        with self.assertRaises(AgentError):
            grounded_answer({**answer,"warnings":["租金为零。"]},events)

    def test_numeric_model_warning_cannot_bypass_fact_binding(self):
        output = BusinessTools().call("market_brief", {"period":"2025-YE"})
        events = [{"name":"market_brief", "arguments":{}, "ok":True, "output":output}]
        answer = {"answer":"历史资料的解释。", "fact_ids":["city-prime-2025"], "calculation_ids":[], "source_ids":["savills-2025-q4"], "warnings":["City rent is £166.61/sq ft."]}
        with self.assertRaises(AgentError):
            grounded_answer(answer,events)

    def test_research_only_brief_is_source_scoped_not_map_bound(self):
        arguments = {"period": "2025-YE", "area": "canary_wharf"}
        output = BusinessTools().call("market_brief", arguments)
        event = {"name": "market_brief", "arguments": arguments, "ok": True, "output": output}
        for topic in ("macro", "leasing"):
            with self.subTest(topic=topic):
                record = next(r for r in output["research"]["records"] if topic in r["topic_ids"] and r["source_ids"])
                payload = {"answer": "Historical source context; not a value for the selected map area.",
                    "fact_ids": [], "calculation_ids": [], "research_ids": [record["id"]],
                    "source_ids": record["source_ids"], "warnings": []}
                result = grounded_answer(payload, [event])
                self.assertEqual(result["facts"], [])
                self.assertEqual(result["calculations"], [])
                self.assertEqual(result["notes"], [])  # No unrelated area-bound notes from the same publisher.
                self.assertEqual(result["research"], {"records": [record], "comparisons": []})
                self.assertIsNone(result["research"]["records"][0]["map_binding"])
                self.assertEqual({s["id"] for s in result["sources"]}, set(record["source_ids"]))
                self.assertEqual({e["id"] for e in result["evidence"]}, set(record["evidence_ids"]))
                self.assertEqual(result["tool_calls"][0]["output"], output)

    def test_research_comparison_requires_every_baseline_and_corroborating_source(self):
        output = BusinessTools().call("market_brief", {"period": "2025-YE"})
        comparison = output["research"]["comparisons"][0]
        event = {"name": "market_brief", "arguments": {"period": "2025-YE"}, "ok": True, "output": output}
        payload = {"answer": "The Python comparison describes historical research, not the map selection.",
            "fact_ids": [], "calculation_ids": [], "research_comparison_ids": [comparison["id"]],
            "source_ids": comparison["source_ids"], "warnings": []}
        result = grounded_answer(payload, [event])
        self.assertEqual(result["research"], {"records": [], "comparisons": [comparison]})
        self.assertEqual({s["id"] for s in result["sources"]}, set(comparison["source_ids"]))
        self.assertEqual({e["id"] for e in result["evidence"]}, set(comparison["evidence_ids"]))
        for source in comparison["source_ids"]:
            with self.subTest(source=source), self.assertRaises(AgentError) as failure:
                grounded_answer({**payload, "source_ids": [s for s in comparison["source_ids"] if s != source]}, [event])
            self.assertEqual(failure.exception.code, "missing_citation")

    def test_research_rejects_missing_foreign_and_reused_ids(self):
        output = BusinessTools().call("market_brief", {"period": "2025-YE"})
        record = next(r for r in output["research"]["records"] if r["id"] == "news-145")
        event = {"name": "market_brief", "arguments": {"period": "2025-YE"}, "ok": True, "output": output}
        payload = {"answer": "Historical context only.", "fact_ids": [], "calculation_ids": [],
            "research_ids": [record["id"]], "source_ids": record["source_ids"], "warnings": []}
        with self.assertRaises(AgentError) as failure:
            grounded_answer({**payload, "source_ids": record["source_ids"][:1]}, [event])
        self.assertEqual(failure.exception.code, "missing_citation")
        for override in ({"research_ids": ["foreign-research-id"]},
                         {"research_comparison_ids": ["foreign-comparison-id"]},
                         {"source_ids": ["foreign-source-id"]}):
            with self.subTest(override=override), self.assertRaises(AgentError) as failure:
                grounded_answer({**payload, **override}, [event])
            self.assertEqual(failure.exception.code, "invalid_citation")
        with self.assertRaises(AgentError) as failure:
            grounded_answer(payload, [{**event, "ok": False}])
        self.assertEqual(failure.exception.code, "no_business_tool")
        other = BusinessTools().call("compare_periods", {"area": "city", "metric": "prime_rent",
            "previous_period": "2024-YE", "current_period": "2025-YE"})
        with self.assertRaises(AgentError) as failure:
            grounded_answer(payload, [{"name": "compare_periods", "arguments": {}, "ok": True, "output": other}])
        self.assertEqual(failure.exception.code, "invalid_citation")
        with self.assertRaises(AgentError) as failure:
            grounded_answer({**payload, "research_ids": []}, [event])
        self.assertEqual(failure.exception.code, "no_selected_evidence")
        with self.assertRaises(AgentError) as failure:
            grounded_answer({**payload, "answer": "Rates are 4%."}, [event])
        self.assertEqual(failure.exception.code, "unsupported_number")


if __name__ == "__main__":
    unittest.main()
