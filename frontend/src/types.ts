export type AreaId = 'city' | 'west_end' | 'canary_wharf' | 'midtown_fringe';
export type MetricId = 'prime_rent' | 'grade_a_rent' | 'vacancy_rate';
export type PeriodId = '2024-YE' | '2025-YE';
export type Status = 'available' | 'missing' | 'conflict';

export interface Area {id: AreaId; name: string; center: [number, number]; definition: string; geometry_status: 'illustrative'}
export interface Metric {id: MetricId; label: string; unit: string; definition: string; change_unit: string}
export interface Period {id: PeriodId; label: string; as_of: string}
export interface Catalog {
  schema_version: number; areas: Area[]; metrics: Metric[]; periods: Period[]; limitations: string[];
  agent: {runtime: string; enabled: boolean; model: string; auth_mode: string};
}
export interface Observation {
  id: string; area_id: AreaId; source_area: string | null; metric: MetricId; period: PeriodId;
  value: number | null; status: Status; unit: string; definition: string; billing_period: string | null;
  source_id: string | null; evidence_id: string | null; data_kind: string; spatial_granularity: string;
}
export interface Comparison {
  id: string; area_id: AreaId; metric: MetricId; previous_period: PeriodId; current_period: PeriodId;
  previous_value: number | null; current_value: number | null; change_value: number | null;
  change_unit: string; status: string; source_ids: string[]; evidence_ids: string[];
  reported_change_pct: number | null; warnings: string[];
}
export interface Source {id: string; publisher: string; title: string; url: string; published_at: string; report_period: string; retrieved_at: string; verification_status: string; usage_note: string}
export interface Evidence {id: string; source_id: string; section: string; quote: string}
export interface Note {id: string; title: string; period: string; area_ids: AreaId[]; kind: string; summary: string; source_id: string; evidence_id: string}
export interface AreaFeature {
  type: 'Feature'; properties: {area_id: AreaId; name: string; geometry_status: 'illustrative'; note: string};
  geometry: {type: 'Polygon'; coordinates: number[][][]} | {type: 'MultiPolygon'; coordinates: number[][][][]};
}
export interface Geometry {type: 'FeatureCollection'; features: AreaFeature[]}
export interface Market {
  schema_version: number; metric: MetricId; period: PeriodId; unit: string; definition: string;
  observations: Observation[]; sources: Source[]; evidence: Evidence[]; comparisons: Comparison[];
  notes: Note[]; geometry: Geometry; warnings: string[];
  dataset: {label: string; data_kind: string; as_of: string; last_reviewed_at: string; is_live: false};
}
export interface ChatResult {
  schema_version: number; session_id: string; run_id: string; status: 'completed'; answer: string;
  facts: Observation[]; calculations: Comparison[]; sources: Source[]; evidence: Evidence[];
  notes: Note[]; warnings: string[]; tool_calls: {name: string; arguments: unknown; ok: boolean}[];
}
export interface ApiError {status: 'error'; error: {code: string; message: string}}
