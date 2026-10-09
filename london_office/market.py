"""The shared business Interface for CLI, HTTP and Agent tools.

All numeric comparisons, missing values and ambiguity handling live here, not in
prompts or JavaScript. Results remain usable without Codex or network access.
"""
from __future__ import annotations

from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path
from .data import Snapshot


class Market:
    def __init__(self, snapshot: Path | None = None, geometry: Path | None = None):
        self._snapshot = Snapshot(snapshot, geometry)
        self._catalog = self._snapshot.catalog()
        self._areas = {item["id"]: item for item in self._catalog["areas"]}
        self._metrics = {item["id"]: item for item in self._catalog["metrics"]}
        self._periods = {item["id"]: item for item in self._catalog["periods"]}

    def catalog(self) -> dict:
        return {"schema_version": 1, **self._snapshot.catalog()}

    def _validate(self, area, metric, period):
        if area is not None and area not in self._areas:
            raise ValueError(f"Unknown area: {area}")
        if metric not in self._metrics:
            raise ValueError(f"Unknown metric: {metric}; prime, Grade A, vacancy and availability are not interchangeable")
        if period not in self._periods:
            raise ValueError(f"Unknown period: {period}; no unverified latest-period estimate is available")

    def _observation(self, area, metric, period):
        definition = self._metrics[metric]
        rows = self._snapshot.records(area, metric, period)
        base = {"id": f"{area}-{metric}-{period}", "area_id": area,
            "source_area": self._areas[area]["name"], "metric": metric, "period": period,
            "value": None, "status": "missing", "unit": definition["unit"],
            "definition": definition["definition"], "definition_id": definition["definition_id"],
            "billing_period": definition["billing_period"], "source_id": None,
            "evidence_id": None, "data_kind": self._catalog["dataset"]["data_kind"],
            "spatial_granularity": "submarket", "warnings": []}
        if not rows:
            base["warnings"] = [f"No verified {metric} for {self._areas[area]['name']} at {period}. Missing is not zero."]
            return base
        compatible = len(rows) == 1 and rows[0]["unit"] == definition["unit"] and rows[0]["definition_id"] == definition["definition_id"] and rows[0]["source_area"] == self._areas[area]["name"]
        if not compatible:
            return {**base, "status": "conflict", "candidates": rows,
                "warnings": ["Conflicting observations or an incompatible unit, definition or source geography; no single value selected."]}
        return {**base, **rows[0]}

    def compare(self, *, area: str, metric: str, previous_period: str, current_period: str) -> dict:
        """Compare same-definition observations, preserving publisher growth separately."""
        self._validate(area, metric, previous_period)
        self._validate(area, metric, current_period)
        if self._periods[previous_period]["as_of"] >= self._periods[current_period]["as_of"]:
            raise ValueError("Comparison requires a strictly earlier baseline period")
        previous = self._observation(area, metric, previous_period)
        current = self._observation(area, metric, current_period)
        evidence_ids = list(dict.fromkeys(f["evidence_id"] for f in [previous, current] if f["evidence_id"]))
        sources, _ = self._snapshot.references(evidence_ids)
        result = {"id": f"change:{area}:{metric}:{previous_period}:{current_period}",
            "area_id": area, "metric": metric, "previous_period": previous_period,
            "current_period": current_period, "previous_value": previous["value"],
            "current_value": current["value"], "change_value": None,
            "change_unit": self._metrics[metric]["change_unit"], "status": "missing",
            "source_ids": [s["id"] for s in sources], "evidence_ids": evidence_ids,
            "reported_change_pct": current.get("reported_change_pct"), "warnings": []}
        if previous["status"] != "available" or current["status"] != "available":
            result["status"] = "conflict" if "conflict" in [previous["status"], current["status"]] else "missing"
            result["warnings"] = ["Both periods must have a single verified same-definition observation; no change computed."]
            return result
        comparable = all(previous[k] == current[k] for k in ["definition_id", "unit", "source_area", "billing_period", "spatial_granularity", "data_kind"])
        if len({s["publisher"] for s in sources}) != 1 or not comparable:
            result["status"] = "not_comparable"
            result["warnings"] = ["Source publisher, geography, units or statistical definition differ; no change computed."]
            return result
        before, after = Decimal(str(previous["value"])), Decimal(str(current["value"]))
        if metric == "vacancy_rate":
            change = after - before
        else:
            if before == 0:
                result["status"] = "zero_baseline"
                result["warnings"] = ["A percentage change from a zero baseline is undefined, not zero."]
                return result
            change = (after / before - 1) * 100
        result.update(status="available", change_value=float(change.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)))
        if metric != "vacancy_rate" and result["reported_change_pct"] is not None:
            reported = Decimal(str(result["reported_change_pct"]))
            precision = current.get("reported_change_decimals", 1)
            tolerance = Decimal("0.5") * Decimal(10) ** -precision
            if abs(change - reported) > tolerance:
                result["warnings"].append(f"reported_growth_mismatch: {self._areas[area]['name']} {metric} snapshot change {result['change_value']}% versus publisher {result['reported_change_pct']}%. Baseline/sample revision or another reason has not been verified.")
        return result

    def query(self, *, area: str | None = None, metric: str = "prime_rent", period: str = "2025-YE") -> dict:
        """Return exact requested observations, comparisons and traceable report context."""
        self._validate(area, metric, period)
        areas = [area] if area else list(self._areas)
        observations = [self._observation(a, metric, period) for a in areas]
        periods = sorted(self._periods, key=lambda p: self._periods[p]["as_of"])
        previous = periods[periods.index(period) - 1] if periods.index(period) else None
        comparisons = [self.compare(area=a, metric=metric, previous_period=previous, current_period=period) for a in areas] if previous else []
        notes = self._snapshot.notes(period, area)
        evidence_ids = []
        for fact in observations:
            if fact["evidence_id"]:
                evidence_ids.append(fact["evidence_id"])
            evidence_ids.extend(c["evidence_id"] for c in fact.get("candidates", []))
        evidence_ids.extend(e for comparison in comparisons for e in comparison["evidence_ids"])
        evidence_ids.extend(n["evidence_id"] for n in notes)
        sources, evidence = self._snapshot.references(evidence_ids)
        definition = self._metrics[metric]
        warnings = [w for item in observations + comparisons for w in item.get("warnings", [])]
        return {"schema_version": 1, "metric": metric, "period": period,
            "unit": definition["unit"], "definition": definition["definition"],
            "observations": observations, "comparisons": comparisons, "sources": sources,
            "evidence": evidence, "notes": notes, "geometry": self._snapshot.geometry(area),
            "warnings": list(dict.fromkeys(warnings)), "dataset": dict(self._catalog["dataset"])}

    def brief(self, *, period: str = "2025-YE", area: str | None = None) -> dict:
        """A numerical briefing, not an offline simulation of an AI answer."""
        results = [self.query(area=area, metric=m, period=period) for m in self._metrics]
        unique = lambda rows: list({r["id"]: r for r in rows}.values())
        return {"schema_version": 1, "period": period, "area": area,
            "observations": [f for r in results for f in r["observations"]],
            "comparisons": [c for r in results for c in r["comparisons"]],
            "sources": unique([s for r in results for s in r["sources"]]),
            "evidence": unique([e for r in results for e in r["evidence"]]),
            "notes": unique([n for r in results for n in r["notes"]]),
            "warnings": list(dict.fromkeys(w for r in results for w in r["warnings"])),
            "dataset": dict(self._catalog["dataset"])}

    def source(self, source_id: str) -> dict:
        return self._snapshot.source(source_id)

    def verify_source(self, source_id: str) -> dict:
        return self._snapshot.verify(source_id)
