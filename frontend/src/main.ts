import {MarketMap} from './map';
import type {ApiError, AreaId, Catalog, ChatResult, Comparison, Evidence, Market, MetricId, Note, Observation, PeriodId, Source} from './types';
import './style.css';

const $ = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};
const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char] ?? char));
const safeUrl = (value: string): string | null => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
const sourceLink = (source: Source | undefined, label = 'Read original source ↗'): string => {
  const href = source && safeUrl(source.url);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : '<span>Original source link unavailable</span>';
};
const formatNumber = (value: number): string => new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2}).format(value);
const formatValue = (observation: Observation | undefined): string => {
  if (!observation || observation.status !== 'available' || observation.value === null) return 'No verified data';
  if (observation.unit === 'GBP/sq ft') return `£${formatNumber(observation.value)} / sq ft`;
  return `${formatNumber(observation.value)}${observation.unit === '%' ? '%' : ` ${observation.unit}`}`;
};
const statusLabel = (observation: Observation | undefined): string => observation?.status === 'conflict' ? 'Conflicting evidence · no single verified value' : 'No verified data';
const message = (error: unknown): string => error instanceof Error ? error.message : 'Request failed';

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); }
  catch { throw new Error('Cannot reach the London Office Monitor API. Check the local Python server.'); }
  let payload: T | ApiError;
  try { payload = await response.json() as T | ApiError; }
  catch { throw new Error(`API returned a non-JSON response (HTTP ${response.status}).`); }
  if (!response.ok || (typeof payload === 'object' && payload !== null && 'status' in payload && payload.status === 'error')) {
    const apiError = payload as ApiError;
    throw new Error(apiError.error?.message ? `${apiError.error.code}: ${apiError.error.message}` : `API request failed (HTTP ${response.status}).`);
  }
  return payload as T;
}

const app = $('#app');
app.innerHTML = `
  <header class="masthead">
    <div class="brand"><span class="brand-symbol" aria-hidden="true">▦</span><div><span class="brand-overline">MARKET INTELLIGENCE / LONDON</span><strong>London Office Monitor</strong></div></div>
    <span class="snapshot-badge"><span class="signal-dot"></span> Historical snapshots <span class="badge-years">2024 &amp; 2025</span></span>
  </header>
  <main class="workspace">
    <section class="intro" aria-labelledby="page-title"><div><div class="eyebrow">01 / RESEARCH DESK</div><h1 id="page-title">London, in context.</h1><p>Compare source-backed office market observations across four selection areas. Reported history, not a live market feed.</p></div><div class="intro-aside"><span class="tiny-label">COVERAGE</span><strong>04</strong><span>London selection areas</span></div></section>
    <section class="controls" aria-label="Market filters"><div class="filter"><span class="tiny-label">MEASURE</span><div id="metrics" class="filter-options" role="group" aria-label="Measure"></div></div><div class="filter period-filter"><span class="tiny-label">REPORTING PERIOD</span><div id="periods" class="filter-options" role="group" aria-label="Reporting period"></div></div></section>
    <div id="global-status" role="status" aria-live="polite"></div>
    <section class="main-grid" aria-label="Market overview">
      <div class="map-panel"><div class="section-head"><div><span class="eyebrow">02 / GEOGRAPHY</span><h2>Market view</h2></div><span class="section-tag">LONDON · UK</span></div><div class="map-wrap"><div id="map" aria-label="Map of illustrative London office area selectors"></div><div id="map-state" class="map-state" role="status">Preparing map…</div><div id="map-tooltip" class="map-tooltip" hidden></div><div class="map-legend"><span class="legend-chip"><i class="legend-swatch verified"></i> Verified value</span><span class="legend-chip"><i class="legend-swatch missing"></i> No verified data</span></div></div><p class="map-disclaimer"><strong>Illustrative selectors — not reporting boundaries.</strong> Shapes are for navigation only; source market geographies and statistical definitions are independent of this map.</p><div class="map-attribution">Basemap: <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap contributors</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a> · rendering: MapLibre / deck.gl</div></div>
      <section class="area-panel" aria-labelledby="areas-heading"><div class="section-head"><div><span class="eyebrow">03 / SNAPSHOT</span><h2 id="areas-heading">Area overview</h2></div><span id="period-caption" class="section-tag"></span></div><div id="area-list" class="area-list"></div><p class="helper-copy">Select an area to inspect reported values, Python comparisons and evidence.</p></section>
    </section>
    <div class="lower-grid">
      <section class="detail-panel" aria-labelledby="detail-heading"><div class="section-head"><div><span class="eyebrow">04 / SOURCE DESK</span><h2 id="detail-heading">Area detail</h2></div><span class="section-tag">SOURCE-BACKED</span></div><div id="detail-content"></div></section>
      <section class="agent-panel" aria-labelledby="agent-heading"><div class="section-head"><div><span class="eyebrow">05 / RESEARCH ASSISTANT</span><h2 id="agent-heading">Ask the evidence</h2></div><span class="section-tag">ON DEMAND</span></div><p class="agent-intro">Answers come from a Python-run tool session; a question is sent only when you press Ask.</p><div class="suggestions"><button type="button" class="suggestion" data-question="What changed in City average prime achieved rent from 2024 year-end to 2025 year-end?">City rent change ↗</button><button type="button" class="suggestion" data-question="Which areas have no verified prime rent data at 2025 year-end, and why should they remain missing?">Coverage gaps ↗</button></div><form id="chat-form"><label for="question" class="tiny-label">YOUR QUESTION</label><textarea id="question" name="question" rows="3" maxlength="2000" placeholder="Ask about a reported value or its source…" required></textarea><div class="form-foot"><span>Selected area, measure and period are sent as context.</span><button type="submit" class="ask-button">Ask assistant <span aria-hidden="true">↗</span></button></div></form><div id="agent-result" aria-live="polite"></div></section>
    </div>
    <footer class="footer"><span>LONDON OFFICE MONITOR / PROOF OF CONCEPT</span><span>Historical reported values · © source publishers · illustrative geometry</span></footer>
  </main>`;

let catalog: Catalog | null = null;
let market: Market | null = null;
let geometry: Market['geometry'] | null = null;
let selected: AreaId = 'city';
let metric: MetricId = 'prime_rent';
let period: PeriodId = '2025-YE';
let loading = false;
let marketError: string | null = null;
let detailError: string | null = null;
let trend: {previous: Market; current: Market} | null = null;
let detailLoading = false;
let viewSequence = 0;
let detailSequence = 0;
let chatBusy = false;
let sessionId: string | undefined;
const marketCache = new globalThis.Map<string, Market>();
const map = new MarketMap($('#map'), area => selectArea(area), (area, x, y) => hover(area, x, y), status => { $('#map-state').textContent = status; });
window.__officeMapDebug = {state: () => map.debug(), project: point => map.project(point)};

function renderFilters(): void {
  if (!catalog) return;
  $('#metrics').innerHTML = catalog.metrics.map(item => `<button type="button" data-metric="${escapeHtml(item.id)}" class="filter-button ${item.id === metric ? 'active' : ''}" aria-pressed="${item.id === metric}">${escapeHtml(item.label)}</button>`).join('');
  $('#periods').innerHTML = catalog.periods.map(item => `<button type="button" data-period="${escapeHtml(item.id)}" class="filter-button ${item.id === period ? 'active' : ''}" aria-pressed="${item.id === period}">${escapeHtml(item.label)}</button>`).join('');
  $('#metrics').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.metric as MetricId; renderFilters(); void refresh();
  }));
  $('#periods').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period as PeriodId; renderFilters(); void refresh();
  }));
}
function renderMarket(): void {
  const status = $('#global-status');
  status.className = marketError ? 'alert error' : loading ? 'alert loading' : '';
  status.textContent = marketError ? `Market API error · ${marketError}` : loading ? 'Loading reported market values…' : '';
  $('#period-caption').textContent = catalog?.periods.find(p => p.id === period)?.label ?? period;
  if (!catalog) { $('#area-list').innerHTML = '<p class="empty-message">Loading catalog…</p>'; return; }
  $('#area-list').innerHTML = catalog.areas.map((area, index) => {
    const observation = market?.observations.find(o => o.area_id === area.id);
    const value = marketError ? 'Market API unavailable' : loading ? 'Loading…' : formatValue(observation);
    const sub = marketError ? 'Unable to verify this selection' : loading ? 'Retrieving observation' : observation?.status === 'available' ? 'Reported historical value' : statusLabel(observation);
    return `<button type="button" class="area-row ${selected === area.id ? 'selected' : ''}" data-area="${escapeHtml(area.id)}" aria-pressed="${selected === area.id}"><span class="area-index">0${index + 1}</span><span class="area-identity"><strong>${escapeHtml(area.name)}</strong><small>${escapeHtml(sub)}</small></span><span class="area-value">${escapeHtml(value)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  $('#area-list').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => selectArea(button.dataset.area as AreaId)));
  map.update(geometry, marketError || loading ? null : market, catalog.areas, selected);
}
function selectArea(area: AreaId): void {
  if (!catalog?.areas.some(a => a.id === area)) return;
  selected = area;
  renderMarket();
  renderDetail();
  if (!marketError && market) void loadDetail();
  if (window.matchMedia('(max-width: 760px)').matches) $('#detail-heading').scrollIntoView({behavior: 'smooth', block: 'start'});
}
function hover(area: AreaId | null, x: number, y: number): void {
  const tooltip = $('#map-tooltip');
  if (!area || !catalog) { tooltip.hidden = true; return; }
  const info = catalog.areas.find(a => a.id === area);
  const observation = market?.observations.find(o => o.area_id === area);
  const definition = observation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '';
  tooltip.innerHTML = `<strong>${escapeHtml(info?.name ?? area)}</strong><span>${escapeHtml(catalog.metrics.find(m => m.id === metric)?.label ?? metric)} · ${escapeHtml(catalog.periods.find(p => p.id === period)?.label ?? period)}</span><b>${escapeHtml(marketError ? 'API error · value unavailable' : loading ? 'Loading…' : formatValue(observation))}</b><span>Value: ${escapeHtml(observation?.value ?? 'null')} · unit: ${escapeHtml(observation?.unit ?? catalog.metrics.find(m => m.id === metric)?.unit ?? '')}</span><small>${escapeHtml(definition)}</small><em>Illustrative selector — not a reporting boundary.</em>`;
  tooltip.hidden = false;
  tooltip.style.left = `${Math.min(x + 15, $('#map').clientWidth - 252)}px`;
  tooltip.style.top = `${Math.max(8, Math.min(y + 15, $('#map').clientHeight - 186))}px`;
}
async function getMarket(requestMetric: MetricId, requestPeriod: PeriodId, area?: AreaId): Promise<Market> {
  const key = `${requestMetric}/${requestPeriod}/${area ?? '*'}`;
  const cached = marketCache.get(key);
  if (cached) return cached;
  const params = new URLSearchParams({metric: requestMetric, period: requestPeriod});
  if (area) params.set('area', area);
  const data = await api<Market>(`/api/market?${params}`);
  marketCache.set(key, data);
  return data;
}
async function refresh(): Promise<void> {
  const sequence = ++viewSequence;
  ++detailSequence;
  market = null;
  trend = null;
  loading = true;
  detailLoading = true;
  marketError = null;
  detailError = null;
  renderMarket(); renderDetail();
  try {
    const result = await getMarket(metric, period);
    if (viewSequence !== sequence) return;
    market = result;
    geometry = result.geometry;
    loading = false;
    renderMarket();
    void loadDetail();
  } catch (error) {
    if (viewSequence !== sequence) return;
    loading = false;
    detailLoading = false;
    marketError = message(error);
    renderMarket(); renderDetail();
  }
}
async function loadDetail(): Promise<void> {
  if (!market || !catalog) return;
  const sequence = ++detailSequence;
  const targetArea = selected;
  const targetMetric = metric;
  trend = null; detailError = null; detailLoading = true; renderDetail();
  try {
    const [previous, current] = await Promise.all([
      getMarket(targetMetric, '2024-YE', targetArea), getMarket(targetMetric, '2025-YE', targetArea)
    ]);
    if (sequence !== detailSequence) return;
    trend = {previous, current}; detailLoading = false; renderDetail();
  } catch (error) {
    if (sequence !== detailSequence) return;
    detailError = message(error); detailLoading = false; renderDetail();
  }
}
function observationCard(label: string, observation: Observation | undefined): string {
  return `<div class="trend-card"><span class="tiny-label">${escapeHtml(label)}</span><strong>${escapeHtml(formatValue(observation))}</strong><small>${escapeHtml(observation?.status === 'available' ? 'Reported value' : statusLabel(observation))}</small></div>`;
}
function comparisonBlock(comparison: Comparison | undefined): string {
  if (!comparison) return '<p class="muted">Python comparison unavailable for this selection.</p>';
  const computed = comparison.change_value === null ? `Not calculated · ${comparison.status}` : `${comparison.change_value > 0 ? '+' : ''}${formatNumber(comparison.change_value)} ${comparison.change_unit}`;
  return `<div class="comparison"><span class="tiny-label">PYTHON SNAPSHOT COMPARISON · ${escapeHtml(comparison.previous_period)} → ${escapeHtml(comparison.current_period)}</span><strong>${escapeHtml(computed)}</strong><span>Reported change: ${escapeHtml(comparison.reported_change_pct === null ? 'Not supplied' : `${formatNumber(comparison.reported_change_pct)}%`)} · ${escapeHtml(comparison.status)}</span>${comparison.warnings.length ? `<small class="warning">${escapeHtml(comparison.warnings.join(' · '))}</small>` : ''}</div>`;
}
function evidenceBlock(observation: Observation | undefined, data: Market, label: string): string {
  if (!observation || observation.status !== 'available') return '';
  const source = data.sources.find(s => s.id === observation.source_id);
  const excerpt = data.evidence.find(e => e.id === observation.evidence_id);
  return `<article class="evidence-card"><div class="evidence-head"><span class="tiny-label">${escapeHtml(label)} · SOURCE VALUE</span><span>${escapeHtml(observation.source_area || 'Submarket')}</span></div><strong>${escapeHtml(formatValue(observation))}</strong><p>${escapeHtml(observation.definition)}</p><p class="metadata">Unit: ${escapeHtml(observation.unit)} · Billing period: ${escapeHtml(observation.billing_period || 'not stated')} · ${escapeHtml(observation.spatial_granularity)} · ${escapeHtml(observation.data_kind)}</p><p class="metadata">${escapeHtml(source?.publisher || 'Source unavailable')} · ${escapeHtml(source?.title || '')} · ${escapeHtml(source?.published_at || '')} · ${escapeHtml(source?.verification_status || '')}</p>${excerpt ? `<blockquote>“${escapeHtml(excerpt.quote)}”<cite>${escapeHtml(excerpt.section)}</cite></blockquote>` : ''}${sourceLink(source)}</article>`;
}
function notesBlock(notes: Note[], sources: Source[], evidence: Evidence[]): string {
  if (!notes.length) return '<p class="muted">No area-linked report events in these snapshots.</p>';
  return notes.map(note => {
    const source = sources.find(s => s.id === note.source_id);
    const excerpt = evidence.find(e => e.id === note.evidence_id);
    return `<article class="event-card"><span class="tiny-label">${escapeHtml(note.kind)} · ${escapeHtml(note.period)}</span><h4>${escapeHtml(note.title)}</h4><p>${escapeHtml(note.summary)}</p>${excerpt ? `<blockquote>“${escapeHtml(excerpt.quote)}”</blockquote>` : ''}<span class="metadata">${escapeHtml(source?.publisher || 'Source unavailable')} · ${escapeHtml(source?.published_at || '')}</span> ${sourceLink(source, 'Original report ↗')}</article>`;
  }).join('');
}
function renderDetail(): void {
  const target = $('#detail-content');
  const area = catalog?.areas.find(a => a.id === selected);
  if (!catalog) { target.innerHTML = '<p class="empty-message">Waiting for catalog…</p>'; return; }
  if (marketError) { target.innerHTML = `<p class="alert error">Market API error · ${escapeHtml(marketError)}. This is not a missing observation.</p>`; return; }
  if (loading) { target.innerHTML = '<p class="empty-message">Loading area values…</p>'; return; }
  if (detailLoading || !trend && !detailError) { target.innerHTML = `<h3>${escapeHtml(area?.name || selected)}</h3><p class="empty-message">Loading two reported snapshots and Python comparison…</p>`; return; }
  if (detailError || !trend) { target.innerHTML = `<h3>${escapeHtml(area?.name || selected)}</h3><p class="alert error">Area detail API error · ${escapeHtml(detailError || 'Unavailable')}. <button type="button" class="inline-button" id="retry-detail">Retry</button></p>`; $('#retry-detail').addEventListener('click', () => void loadDetail()); return; }
  const previous = trend.previous.observations.find(o => o.area_id === selected);
  const current = trend.current.observations.find(o => o.area_id === selected);
  const comparison = trend.current.comparisons.find(c => c.area_id === selected);
  const selectedObservation = period === '2024-YE' ? previous : current;
  const notes = [...trend.previous.notes, ...trend.current.notes].filter((note, index, all) => note.area_ids.includes(selected) && all.findIndex(n => n.id === note.id) === index);
  const sources = [...trend.previous.sources, ...trend.current.sources];
  const excerpts = [...trend.previous.evidence, ...trend.current.evidence];
  target.innerHTML = `<div class="detail-title"><div><h3>${escapeHtml(area?.name || selected)}</h3><span>${escapeHtml(area?.definition || '')}</span></div><span class="detail-pill">${escapeHtml(selectedObservation?.status === 'available' ? 'VERIFIED EXCERPT' : selectedObservation?.status === 'conflict' ? 'CONFLICT' : 'COVERAGE GAP')}</span></div><p class="detail-description">${escapeHtml(selectedObservation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '')}</p><div class="subhead"><span class="tiny-label">TWO REPORTED YEAR-END SNAPSHOTS</span><span>Not a live trend</span></div><div class="trend-grid">${observationCard('2024 YEAR-END', previous)}${observationCard('2025 YEAR-END', current)}</div>${comparisonBlock(comparison)}<div class="subhead"><span class="tiny-label">REPORTED VALUES &amp; ORIGINAL EVIDENCE</span></div>${evidenceBlock(previous, trend.previous, '2024 YEAR-END')}${evidenceBlock(current, trend.current, '2025 YEAR-END')}${previous?.status !== 'available' && current?.status !== 'available' ? '<p class="empty-message">No verified data for this metric in either year-end snapshot. Missing does not mean zero.</p>' : ''}<div class="subhead"><span class="tiny-label">REPORT EVENTS / DEMAND DRIVERS</span><span>Historical reporting · not live news</span></div>${notesBlock(notes, sources, excerpts)}${[...trend.previous.warnings, ...trend.current.warnings].length ? `<p class="warning">${escapeHtml([...trend.previous.warnings, ...trend.current.warnings].join(' · '))}</p>` : ''}`;
}
function renderAgent(result: ChatResult): void {
  $('#agent-result').innerHTML = `<div class="answer"><div class="answer-head"><span class="tiny-label">PYTHON TOOL-BASED ANSWER · HISTORICAL</span><span>Run ${escapeHtml(result.run_id)}</span></div><p class="answer-text">${escapeHtml(result.answer)}</p><span class="tiny-label">ACTUAL TOOL CALLS</span><div class="tool-list">${result.tool_calls.length ? result.tool_calls.map(call => `<span class="tool-chip">${escapeHtml(call.name)} · ${call.ok ? 'OK' : 'FAILED'}</span>`).join('') : '<span>No tool calls reported</span>'}</div>${result.warnings.length ? `<p class="warning">${escapeHtml(result.warnings.join(' · '))}</p>` : ''}<details><summary>Evidence returned by Python · ${result.facts.length} facts, ${result.calculations.length} comparisons</summary><div class="answer-evidence">${result.facts.map(fact => `<p><strong>${escapeHtml(fact.area_id)} · ${escapeHtml(fact.metric)} · ${escapeHtml(fact.period)}</strong> ${escapeHtml(formatValue(fact))} · ${escapeHtml(fact.status)}</p>`).join('')}${result.calculations.map(c => comparisonBlock(c)).join('')}${result.sources.map(s => `<p>${escapeHtml(s.publisher)} · ${escapeHtml(s.title)} · ${sourceLink(s)}</p>`).join('')}${result.evidence.map(e => `<blockquote>“${escapeHtml(e.quote)}” <cite>${escapeHtml(e.section)}</cite></blockquote>`).join('')}${notesBlock(result.notes, result.sources, result.evidence)}</div></details></div>`;
}
$('#chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (chatBusy) return;
  const input = $('#question') as HTMLTextAreaElement;
  const question = input.value.trim();
  if (!question) return;
  chatBusy = true;
  const button = $('#chat-form').querySelector<HTMLButtonElement>('button[type=submit]');
  if (button) button.disabled = true;
  $('#agent-result').innerHTML = '<p class="alert loading" role="status">Running Python evidence tools and checking the answer…</p>';
  try {
    const response = await api<ChatResult>('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question, ...(sessionId ? {session_id: sessionId} : {}), context: {area_id: selected, metric, period}})});
    if (response.status !== 'completed') throw new Error('Assistant did not complete its evidence-backed run.');
    sessionId = response.session_id;
    renderAgent(response);
  } catch (error) {
    const detail = message(error);
    const login = /login|not.logged|not_authenticated|authentication|unauthorized|subscription.auth/i.test(detail);
    $('#agent-result').innerHTML = `<p class="alert error" role="alert">${escapeHtml(detail)}${login ? '<br>To sign in to the dedicated runtime, run <code>uv run london-office login</code> in the project root, then retry.' : ''}</p>`;
  } finally { chatBusy = false; if (button) button.disabled = false; }
});
$('.suggestions').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
  const input = $('#question') as HTMLTextAreaElement;
  input.value = button.dataset.question ?? '';
  input.focus();
}));

map.start();
renderMarket(); renderDetail();
void api<Catalog>('/api/catalog').then(result => {
  catalog = result;
  renderFilters();
  void refresh();
}).catch(error => {
  marketError = message(error);
  loading = false;
  $('#global-status').className = 'alert error';
  $('#global-status').textContent = `Catalog API error · ${marketError}. Reload to retry.`;
  $('#area-list').innerHTML = '<p class="empty-message">Area catalog unavailable. No market data can be shown.</p>';
  $('#detail-content').innerHTML = '<p class="empty-message">Catalog unavailable.</p>';
});
