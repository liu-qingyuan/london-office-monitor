"""Six explicit business tools. Transport, SDK and approval policy live elsewhere."""
from __future__ import annotations
from .market import Market


class BusinessTools:
    def __init__(self, market: Market | None = None):
        self.market = market or Market()
        catalog = self.market.catalog()
        area = {"type": "string", "enum": [a["id"] for a in catalog["areas"]]}
        metric = {"type": "string", "enum": [m["id"] for m in catalog["metrics"]]}
        period = {"type": "string", "enum": [p["id"] for p in catalog["periods"]]}
        self._specs = [
            ("market_catalog", "List verified dataset scope, metric definitions, valid areas and historical periods. No real-time data.", {}, []),
            ("market_query", "Query exact area / metric / historical period. Returns Python-calculated changes, missing/conflict states and evidence. Prime rent is average achieved, not headline; rent billing period not stated.", {"area": area, "metric": metric, "period": period}, ["area", "metric", "period"]),
            ("compare_periods", "Python computes comparable-period rent percent changes or vacancy percentage-point changes. Retains publisher growth separately and warns about discrepancies. Never calculate changes yourself.", {"area": area, "metric": metric, "previous_period": period, "current_period": period}, ["area", "metric", "previous_period", "current_period"]),
            ("market_brief", "Get Python historical observations/changes and admitted eight-dimension research records/comparisons with source-scoped windows, evidence and report events. Research is independent of the optional selected area and year-end period: historical, forecast, sample and event context must not be mapped to that area. Report events are not live news.", {"period": period, "area": area}, ["period"]),
            ("source_details", "Get an existing source, including known archived research sources, and its exact short evidence excerpts by source_id. Does not fetch arbitrary URLs.", {"source_id": {"type": "string"}}, ["source_id"]),
            ("verify_source", "Read-only network check of an originally approved official source_id only: verify existing excerpts, timestamp and hash. New archived research sources are not network-verifiable; no new-report discovery or automatic snapshot update.", {"source_id": {"type": "string"}}, ["source_id"]),
        ]

    def list_tools(self) -> list[dict]:
        return [{"name": name, "description": description,
            "inputSchema": {"type": "object", "properties": properties, "required": required, "additionalProperties": False},
            "annotations": {"readOnlyHint": True, "destructiveHint": False, "idempotentHint": name != "verify_source", "openWorldHint": name == "verify_source"}}
            for name, description, properties, required in self._specs]

    def call(self, name: str, arguments: dict) -> dict:
        spec = next((s for s in self._specs if s[0] == name), None)
        if spec is None:
            raise ValueError(f"Tool not authorized: {name}")
        _, _, properties, required = spec
        if not isinstance(arguments, dict) or not set(required) <= arguments.keys() or not arguments.keys() <= properties.keys():
            raise ValueError("Invalid tool arguments: missing or additional fields")
        for key, value in arguments.items():
            prop = properties[key]
            if not isinstance(value, str) or ("enum" in prop and value not in prop["enum"]):
                raise ValueError(f"Invalid tool argument: {key}")
        if name == "market_catalog":
            return self.market.catalog()
        if name == "market_query":
            return self.market.query(**arguments)
        if name == "market_brief":
            return self.market.brief(**arguments)
        if name == "compare_periods":
            comparison = self.market.compare(**arguments)
            before = self.market.query(area=arguments["area"], metric=arguments["metric"], period=arguments["previous_period"])
            after = self.market.query(area=arguments["area"], metric=arguments["metric"], period=arguments["current_period"])
            unique = lambda key: list({item["id"]: item for item in before[key] + after[key]}.values())
            return {"observations": unique("observations"), "comparisons": [comparison],
                "sources": unique("sources"), "evidence": unique("evidence"),
                "warnings": comparison["warnings"], "dataset": after["dataset"]}
        source = self.market.source(arguments["source_id"])
        evidence = source.pop("evidence")
        result = {"sources": [source], "evidence": evidence}
        if name == "verify_source":
            result["source_check"] = self.market.verify_source(arguments["source_id"])
        return result
