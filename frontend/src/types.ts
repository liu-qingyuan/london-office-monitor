export type AreaId = 'city' | 'west_end' | 'canary_wharf' | 'midtown_fringe';
export type MetricId = 'prime_rent' | 'grade_a_rent' | 'vacancy_rate';
export type PeriodId = '2024-YE' | '2025-YE';
export type Status = 'available' | 'missing' | 'conflict';

export interface Area {id: AreaId; name: string; center: [number, number]; definition: string; geometry_status: 'illustrative'}
export interface Metric {id: MetricId; label: string; unit: string; definition: string; change_unit: string}
export interface Period {id: PeriodId; label: string; as_of: string}
export interface Catalog {
  schema_version: number; areas: Area[]; metrics: Metric[]; periods: Period[]; limitations: string[];
  agent: {runtime: string; enabled: boolean; model: string; auth_mode: string; discovery_configured?: boolean};
  discovery_topics?: {id: SourceTopicId; label: string}[];
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
export interface Source {id: string; publisher: string; title: string; url: string; published_at: string | null; report_period: string; retrieved_at: string; verification_status: string; usage_note: string}
export interface Evidence {id: string; source_id: string; section: string; quote: string}
export interface Note {id: string; title: string; period: string; area_ids: AreaId[]; kind: string; summary: string; source_id: string; evidence_id: string}
export interface AreaFeature {
  type: 'Feature'; properties: {area_id: AreaId; name: string; geometry_status: 'illustrative'; note: string};
  geometry: {type: 'Polygon'; coordinates: number[][][]} | {type: 'MultiPolygon'; coordinates: number[][][][]};
}
export interface Geometry {type: 'FeatureCollection'; features: AreaFeature[]}
export interface ResearchRecord {
  id: string; topic_ids: SourceTopicId[]; kind: string; metric: string; label: string;
  value: number | null; unit: string | null; display_value: string;
  status: 'available' | 'missing' | 'approximate' | 'event';
  source_geography: string; statistical_window: string;
  release_vintage: string | null; forecast_as_of: string | null; target_window: string | null;
  definition: string; denominator: string | null;
  source_ids: string[]; evidence_ids: string[]; caveats: string[];
  map_binding: null; reference_observation_ids: string[];
  billing_period?: string | null; quality_status?: 'conflict'; conflict_record_ids?: string[];
  event?: {occurred_on: null; precision: string; occurrence_window: string;
    quantities: {measure: string; value: number; unit: string; display_value: string}[];
    snapshot_disposition: string};
}
export interface ResearchComparison {
  id: string; topic_ids: SourceTopicId[]; label: string;
  previous_id: string; current_id: string; previous_value: number; current_value: number;
  previous_window: string; current_window: string; change_value: number | null; change_unit: string; status?: 'conflict';
  source_geography: string; source_ids: string[]; evidence_ids: string[]; warnings: string[];
}
export interface Research {
  data_kind: 'historical_research'; publication_status: 'admitted_with_caveats';
  label: string; is_live: false; scope_note: string; intake_revision?: number;
  latest_update?: {admitted_at: string; source_checked_at: string; record_ids: string[]; source_ids: string[]; note: string};
  topics: {id: SourceTopicId; label: string; status: 'connected'; record_count: number}[];
  records: ResearchRecord[]; comparisons: ResearchComparison[];
  sources: Source[]; evidence: Evidence[];
  exclusions: {id: string; topic_ids: SourceTopicId[]; label: string; reason: string}[];
  warnings: string[];
}
export interface Market {
  schema_version: number; metric: MetricId; period: PeriodId; unit: string; definition: string;
  observations: Observation[]; sources: Source[]; evidence: Evidence[]; comparisons: Comparison[];
  notes: Note[]; geometry: Geometry; warnings: string[]; research?: Research;
  dataset: {label: string; data_kind: string; as_of: string; last_reviewed_at: string; is_live: false};
}
export interface ToolOutput {
  observations?: Observation[]; comparisons?: Comparison[]; sources?: Source[];
  evidence?: Evidence[]; notes?: Note[]; error?: {code: string; message: string};
  [key: string]: unknown;
}
export interface ToolCall {
  name: string; arguments: Record<string, unknown>; ok: boolean;
  // Older saved responses omit output. Never fabricate it from selected facts.
  output?: ToolOutput;
}
export interface ChatResult {
  schema_version: number; session_id: string; run_id: string; status: 'completed'; answer: string;
  facts: Observation[]; calculations: Comparison[]; sources: Source[]; evidence: Evidence[];
  notes: Note[]; warnings: string[]; tool_calls: ToolCall[];
  research?: {records: ResearchRecord[]; comparisons: ResearchComparison[]};
}
export type SourceTopicId = 'rents' | 'vacancy' | 'leasing' | 'supply' | 'submarkets' | 'macro' | 'demand' | 'news';
export interface SourceCandidate {
  id: string; url: string; title: string | null; snippet: string | null; date_hint: string | null;
  content_basis: 'search_metadata'; verification_status: 'unverified_search_metadata';
  source_geography: {status: 'not_verified'; granularity: null}; requested_topics: SourceTopicId[];
  occurrences: {provider: 'serpapi_google' | 'codex_native'; run_id: string; query: string | string[] | null;
    provider_path: string | null; thread_id: string | null; turn_id: string | null; tool_item_id: string | null; ref_id: string | null}[];
}
export interface SourcePool {
  schema_version: number; data_kind: 'source_candidates'; source_count: number; occurrence_count: number;
  candidates: SourceCandidate[]; warnings: string[];
  topics: {id: SourceTopicId; label: string; status: string; source_count: number; completed_searches: number}[];
  runs: {id: string; provider: string; status: string; query: string | null; intent_context: Record<string,unknown> | null}[];
}
export interface DiscoveryResult {
  schema_version: number; data_kind: 'source_discovery'; run_id: string; status: 'completed_metadata_only' | 'partial';
  assessment: string; assessment_basis: 'ai_generated_source_screening'; selected_candidate_ids: string[];
  pool: SourcePool; warnings: string[]; tool_calls: ToolCall[];
  provider_states: {serpapi_google: {status: string; successful_runs: number};
    codex_native: {status: string; searches_started_observed: number; searches_completed_observed: number;
      candidate_occurrences_captured: number; http_request_count: null}};
}
export interface ApiError {status: 'error'; error: {code: string; message: string}}
