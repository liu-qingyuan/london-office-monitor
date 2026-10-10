import {MarketMap, type CameraState} from './map';
import type {ApiError, AreaId, Catalog, ChatResult, Comparison, Evidence, Market, MetricId, Note, Observation, PeriodId, Source, ToolCall} from './types';
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
  if (observation.unit === 'GBP/sq ft') return `£${new Intl.NumberFormat('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(observation.value)} / sq ft`;
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

const icon = (paths: string): string => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const cityIcon = icon('<path d="M3 21V9h6v12M9 21V3h7v18M16 21v-8h5v8M1 21h22M12 7h1M12 11h1M12 15h1M5 13h1M5 17h1"/>');
const sections = [
  {id:'market',label:'Submarkets',symbol:cityIcon,description:'Compare source-backed observations across the four submarkets.'},
  {id:'rents',label:'Rents',symbol:icon('<path d="M4 18V6M4 18h16M7 14l4-4 4 2 5-7M16 5h4v4"/>'),description:'Prime achieved and Grade A rents. Separate definitions, original evidence.'},
  {id:'vacancy',label:'Vacancy & availability',symbol:icon('<rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 7h2M14 7h2M8 11h2M14 11h2M10 21v-6h4v6"/>'),description:'Overall vacancy is available in the snapshot. Availability is a separate measure.'},
  {id:'leasing',label:'Leasing activity',symbol:icon('<path d="M8 3h8v4H8zM8 5H5v16h14V5h-3M8 11h8M8 15h5"/>'),description:'Take-up and market activity, with historical lease examples kept separate.'},
  {id:'supply',label:'Supply pipeline',symbol:icon('<path d="M6 21V3h12M3 7h18M6 3l12 4M17 7v7M15 14h4v4h-4M3 21h9"/>'),description:'New developments, refurbishments and pre-lets. Report context, not completed supply.'},
  {id:'macro',label:'Macro economy',symbol:icon('<path d="m3 8 9-5 9 5ZM5 8v10M10 8v10M14 8v10M19 8v10M3 21h18"/>'),description:'Interest rates, economic indicators and employment. This data connection is not implemented yet.'},
  {id:'demand',label:'Demand drivers',symbol:icon('<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M19 14a5 5 0 0 1 2 4v3"/>'),description:'Flight to quality, sustainability and hybrid working. Evidence and unconnected topics stay distinct.'},
  {id:'news',label:'News & events',symbol:icon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h4M7 16h4M15 12h2M15 16h2"/>'),description:'Dated research-report events. A live or emerging-news feed is not connected.'},
  {id:'layers',label:'Map layers',symbol:icon('<path d="m3 7 9-4 9 4-9 4ZM3 12l9 4 9-4M3 17l9 4 9-4"/>'),description:'Choose the existing market lens. Buildings are spatial context, not property-level market data.'}
] as const;
type SectionId = typeof sections[number]['id'];
const navigation = [sections.slice(0,3),sections.slice(3,8),sections.slice(8)].map(group => `<div class="nav-group">${group.map(section => `<button type="button" class="workspace-nav-item" data-section="${section.id}" aria-label="${section.label}" aria-controls="market-panel" aria-pressed="false"><span class="nav-item-icon">${section.symbol}</span><span class="nav-item-label">${section.label}</span><span class="nav-item-arrow" aria-hidden="true">‹</span></button>`).join('')}</div>`).join('');
const app = $('#app');
app.innerHTML = `
  <header class="masthead">
    <div class="brand"><span class="brand-symbol">${cityIcon}</span><div><span class="brand-overline">LONDON / MARKET INTELLIGENCE</span><strong>Office Monitor<span class="brand-dot">.</span></strong></div></div>
    <div class="header-context"><span class="snapshot-badge"><i></i> Historical evidence <b>2024 — 2025</b></span></div>
  </header>
  <main class="workspace">
    <section class="map-panel" aria-labelledby="page-title">
      <div class="map-wrap">
        <div id="map" aria-label="Explorable 3D London map with illustrative submarket selectors"></div>
        <div class="map-heading"><span class="eyebrow">SPATIAL CONTEXT / LONDON</span><h1 id="page-title">London office markets</h1><p>Explore the city. Follow the evidence.</p></div>
        <div id="map-state" class="map-state" role="status">Preparing city map…</div>
        <div id="map-tooltip" class="map-tooltip" hidden></div>
        <div id="map-directions" class="map-directions" aria-label="Offscreen submarkets"></div>
        <div class="map-legend"><span><i class="legend-swatch verified"></i> Reported value</span><span><i class="legend-swatch missing"></i> Data gap</span><span><i class="legend-swatch conflict"></i> Conflict</span><span><i class="legend-swatch selected"></i> Selected area</span></div>
        <div class="map-toolbar" role="group" aria-label="Map camera controls">
          <button type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('<path d="M12 5v14M5 12h14"/>')}</button>
          <button type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('<path d="M5 12h14"/>')}</button><span class="toolbar-divider"></span>
          <button type="button" id="rotate-view" aria-label="Rotate view" title="Rotate 45 degrees">${icon('<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>')}</button>
          <button type="button" id="tilt-view" aria-label="Tilt view" title="Change viewing angle">${icon('<path d="m3 17 9-5 9 5-9 5ZM4 8l8-5 8 5M12 3v9"/>')}</button>
          <button type="button" id="top-view" aria-label="Top-down view" title="Top-down view">${icon('<path d="m3 8 9-5 9 5-9 5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>')}</button><span class="toolbar-divider"></span>
          <button type="button" id="reset-map" class="reset-button" aria-label="Reset map" title="Return to city overview">${icon('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>')} <span>Overview</span></button>
        </div>
        <div id="map-instructions" class="map-instructions"><span>${icon('<path d="m8 8 4-4 4 4M12 4v16M8 16l4 4 4-4M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>')} Drag to explore <small>Scroll to zoom · Right-drag to rotate &amp; tilt</small></span><button type="button" id="dismiss-instructions" aria-label="Dismiss map instructions">×</button></div>
        <div class="camera-readout"><button type="button" id="north-view" class="compass" aria-label="Reset north" title="Face north"><span id="compass-arrow">${icon('<path d="m12 3 5 16-5-3-5 3Z"/>')}</span><b>N</b></button><span id="camera-caption">3D CITY VIEW</span><button type="button" id="map-info-toggle" aria-label="Map information" aria-expanded="false">${icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>')}</button></div>
        <div id="map-info" class="map-info" hidden><strong>A city backdrop, not building-level market data</strong><p>Building volumes are map-provided spatial context, not verified height surveys or property-level rent. Selection outlines are illustrative, not official reporting boundaries. Amber highlights the current selection, including building footprints inside or intersecting that outline; it is not a market value or data-quality signal.</p><p>Source: <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>. Rendered with MapLibre + deck.gl.</p></div>
        <div class="map-footnote">3D buildings: spatial context only <span>Selection outlines: illustrative</span></div>
      </div>
    </section>
    <section class="agent-shell" aria-label="Market research assistant">
      <form id="chat-form" class="agent-capsule">
        <button type="button" id="open-agent" class="agent-orb" aria-label="Ask Agent" aria-controls="agent-expansion" aria-expanded="false" title="Open research assistant">${icon('<path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8ZM19 16v6M16 19h6"/>')}</button>
        <label for="question" class="visually-hidden">YOUR QUESTION</label><input id="question" name="question" type="text" maxlength="2000" autocomplete="off" placeholder="Ask about this market…" required />
        <button type="submit" class="ask-button" aria-label="Ask assistant" title="Ask assistant">${icon('<path d="M12 19V5M6 11l6-6 6 6"/>')}</button>
      </form>
      <div id="agent-expansion" class="agent-expansion" hidden>
        <div class="agent-expansion-head"><div><h2 id="agent-heading">Evidence assistant</h2><p id="agent-context">Selected market context is included.</p></div><button type="button" id="close-agent" aria-label="Close Agent" title="Close assistant">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button></div>
        <div class="suggestions"><button type="button" class="suggestion" data-question="What changed in City average prime achieved rent from 2024 year-end to 2025 year-end?">City rent change ↗</button><button type="button" class="suggestion" data-question="Which areas have no verified prime rent data at 2025 year-end, and why should they remain missing?">Coverage gaps ↗</button></div>
        <p class="agent-privacy">Uses reported evidence. Only sends a request when you ask.</p><div id="agent-result" aria-live="polite"></div>
      </div>
    </section>
    <div class="inspector-shell">
      <div id="navigation-dock" class="navigation-dock">
        <nav id="workspace-nav" class="workspace-nav" aria-label="Market sections">${navigation}</nav>
      </div>
    </div>
    <aside id="market-panel" class="inspector" data-section="market" aria-labelledby="panel-title" hidden>
      <div class="inspector-heading"><button type="button" id="close-market" aria-label="Close workspace" title="Collapse details">${icon('<path d="m6 6 12 12M18 6 6 18"/>')}</button><span class="eyebrow">MARKET WORKSPACE</span><h2 id="panel-title" tabindex="-1">Submarkets</h2><p id="section-description">Compare source-backed observations across the four submarkets.</p><p id="coverage-summary">Loading market scope…</p></div>
      <section class="controls" aria-label="Market filters"><div id="measure-filter" class="filter"><span class="tiny-label">MEASURE</span><div id="metrics" class="filter-options" role="group" aria-label="Measure"></div></div><div class="filter period-filter"><span class="tiny-label">REPORTING PERIOD</span><div id="periods" class="filter-options" role="group" aria-label="Reporting period"></div></div></section>
      <div id="global-status" role="status" aria-live="polite"></div>
      <div class="panel-divider"><span class="tiny-label">REPORTED SNAPSHOTS &amp; SOURCES</span></div>
      <section class="detail-panel" aria-label="Area detail"><div id="detail-content"></div></section>
      <section class="area-panel" aria-labelledby="areas-heading"><div class="section-head"><h2 id="areas-heading">Area overview</h2><span id="period-caption" class="section-tag"></span></div><div id="area-list" class="area-list"></div></section>
      <section id="section-content" class="section-content" hidden></section>
      <footer class="inspector-foot">Historical reporting, not live quotes.<br>Missing values are not zero. Source definitions apply.<br>Amber marks selection, not a market value or data quality.</footer>
    </aside>
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
let activeSection: SectionId = 'market';
let suppressNavigationFocus = false;
let touchNavigationPreview = false;
let sessionId: string | undefined;
const marketCache = new globalThis.Map<string, Market>();
let cameraState: CameraState | undefined;
const map = new MarketMap($('#map'), area => selectArea(area), (area, x, y) => hover(area, x, y), status => { $('#map-state').textContent = status; renderCameraState(); }, state => renderCameraState(state));
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
function plannedFields(fields: string[]): string {
  return `<div class="connection-card"><span class="connection-status">Not connected</span><p>These fields are not connected yet. No values are inferred.</p><ul>${fields.map(field => `<li><span>${escapeHtml(field)}</span><small>Not connected</small></li>`).join('')}</ul></div>`;
}
function renderSection(): void {
  const section = sections.find(item => item.id === activeSection)!;
  const observations = ['market','rents','vacancy'].includes(activeSection);
  $('#market-panel').dataset.section = activeSection;
  $('#panel-title').textContent = section.label;
  $('#section-description').textContent = section.description;
  $('#coverage-summary').hidden = !observations;
  $('.area-panel').hidden = !observations;
  $('.panel-divider').hidden = !observations;
  $('.detail-panel').hidden = !observations;
  $('#measure-filter').hidden = !['market','rents','layers'].includes(activeSection);
  $('.controls').hidden = activeSection === 'macro';
  const board = $('#section-content');
  board.hidden = activeSection === 'market' || activeSection === 'rents';
  if (board.hidden) return;
  if (activeSection === 'layers') {
    board.innerHTML = `<div class="layer-card"><span class="layer-symbol">${sections[8].symbol}</span><div><h3>3D city backdrop</h3><p>OpenFreeMap · OpenMapTiles</p><small id="layer-background-status"></small></div></div><div class="layer-card"><span class="layer-symbol">${cityIcon}</span><div><h3>Submarket selectors</h3><p>Illustrative geometry · four submarkets</p><small>Amber outlines and building volumes mark the current selection, not market performance. Coverage and hover values follow the selected measure and reporting period.</small></div></div><p class="section-limit">Map-provided building volumes are approximate spatial context. They do not carry building-level rent or vacancy. New data layers are not connected.</p>`;
    return;
  }
  const fields: Partial<Record<SectionId,string[]>> = {
    vacancy:['Availability ratio'],leasing:['Take-up volume','Leasing activity series'],
    supply:['New development pipeline','Refurbishment pipeline','Pre-let supply series'],
    macro:['Interest rates','Economic indicators','Employment'],demand:['ESG & sustainability','Hybrid working'],news:['Emerging news feed']
  };
  board.innerHTML = plannedFields(fields[activeSection] ?? []);
  const kind: Partial<Record<SectionId,string>> = {leasing:'report_leasing_event',supply:'report_supply_context',demand:'report_demand_driver'};
  if (activeSection === 'macro' || activeSection === 'vacancy') return;
  const notes = market?.notes.filter(note => activeSection === 'news' || note.kind === kind[activeSection]) ?? [];
  board.innerHTML += `<div class="section-report-head"><h3>Historical report context</h3><span>${escapeHtml(periodName(period))}</span></div><p class="section-limit">Source scope applies to each excerpt. Central London context is not an individual-submarket series or live news.</p>${loading ? '<p class="muted">Loading existing report context…</p>' : marketError ? '<p class="alert error">Report context unavailable because the Market API failed. This is not a data gap.</p>' : notes.length && market ? notesBlock(notes,market.sources,market.evidence) : '<p class="muted">No report context for this topic in the selected snapshot.</p>'}`;
}
function renderMarket(): void {
  const status = $('#global-status');
  status.className = marketError ? 'alert error' : loading ? 'alert loading' : '';
  status.textContent = marketError ? `Market API error · ${marketError}` : loading ? 'Loading reported market values…' : '';
  $('#period-caption').textContent = catalog?.periods.find(p => p.id === period)?.label ?? period;
  const available = market?.observations.filter(o => o.status === 'available' && o.value !== null).length;
  $('#coverage-summary').textContent = marketError ? 'Market data unavailable — this is not a coverage gap.' : available === undefined ? 'Loading reported observations…' : `${available} of ${catalog?.areas.length ?? 0} areas have reported values for this selection.`;
  $('#agent-context').textContent = `Map selection: ${catalog?.areas.find(a => a.id === selected)?.name ?? selected} · ${catalog?.metrics.find(m => m.id === metric)?.label ?? metric} · ${catalog?.periods.find(p => p.id === period)?.label ?? period}. Your question can ask about another market.`;
  if (!catalog) { $('#area-list').innerHTML = '<p class="empty-message">Loading catalog…</p>'; return; }
  $('#area-list').innerHTML = catalog.areas.map((area, index) => {
    const observation = market?.observations.find(o => o.area_id === area.id);
    const value = marketError ? 'Market API unavailable' : loading ? 'Loading…' : formatValue(observation);
    const sub = marketError ? 'Unable to verify this selection' : loading ? 'Retrieving observation' : observation?.status === 'available' ? 'Reported historical value' : statusLabel(observation);
    return `<button type="button" class="area-row ${selected === area.id ? 'selected' : ''}" data-area="${escapeHtml(area.id)}" aria-pressed="${selected === area.id}"><span class="area-index">0${index + 1}</span><span class="area-identity"><strong>${escapeHtml(area.name)}</strong><small>${escapeHtml(sub)}</small></span><span class="area-value">${escapeHtml(value)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  $('#area-list').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => selectArea(button.dataset.area as AreaId)));
  map.update(geometry, marketError || loading ? null : market, catalog.areas, selected);
  renderSection();
  renderCameraState();
}
function selectArea(area: AreaId): void {
  if (!catalog?.areas.some(a => a.id === area)) return;
  selected = area;
  // A map/list selection reveals this same layout region, never a new window.
  if (!['market','rents','vacancy'].includes(activeSection)) showSection('market');
  else setMarketPanel(true);
  $('#map-tooltip').hidden = true;
  renderMarket();
  renderDetail();
  if (!marketError && market) void loadDetail();
  map.focus(area);
  $('#market-panel').scrollTop = 0;
  if (window.matchMedia('(max-width: 760px)').matches) setAgentExpanded(false);
}
function hover(area: AreaId | null, x: number, y: number): void {
  const tooltip = $('#map-tooltip');
  if (!area || !catalog) { tooltip.hidden = true; return; }
  const info = catalog.areas.find(a => a.id === area);
  const observation = market?.observations.find(o => o.area_id === area);
  const definition = observation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '';
  tooltip.innerHTML = `<strong>${escapeHtml(info?.name ?? area)}</strong><span>${escapeHtml(catalog.metrics.find(m => m.id === metric)?.label ?? metric)} · ${escapeHtml(catalog.periods.find(p => p.id === period)?.label ?? period)}</span><b>${escapeHtml(marketError ? 'API error · value unavailable' : loading ? 'Loading…' : formatValue(observation))}</b><span>Value: ${escapeHtml(observation?.value ?? 'null')} · unit: ${escapeHtml(observation?.unit ?? catalog.metrics.find(m => m.id === metric)?.unit ?? '')}</span><small>${escapeHtml(definition)}</small><em>Illustrative selector — not a reporting boundary.</em>`;
  tooltip.hidden = false;
  tooltip.style.left = `${Math.max(8, Math.min(x + 15, $('#map').clientWidth - 268))}px`;
  tooltip.style.top = `${Math.max(8, Math.min(y + 15, $('#map').clientHeight - 210))}px`;
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
function snapshotChart(previous: Observation | undefined, current: Observation | undefined): string {
  const values = [previous,current];
  const max = Math.max(1,...values.map(o => o?.status === 'available' && o.value !== null ? o.value : 0));
  return `<figure class="snapshot-chart" aria-label="Two reported year-end snapshots, not a continuous trend"><svg viewBox="0 0 320 112" role="img" aria-label="2024 and 2025 reported values">${values.map((o,index) => {
    const y = 16+index*52;
    const available = o?.status === 'available' && o.value !== null;
    return `<text x="0" y="${y}" class="chart-year">${2024+index} YEAR-END</text><text x="320" y="${y}" text-anchor="end" class="chart-value">${escapeHtml(formatValue(o))}</text><line x1="0" x2="320" y1="${y+17}" y2="${y+17}" class="chart-track"/>${available ? `<rect x="0" y="${y+13}" width="${o.value!/max*320}" height="8" rx="2" class="chart-bar ${index ? 'current' : ''}"/>` : `<text x="0" y="${y+34}" class="chart-missing">${escapeHtml(statusLabel(o))} — no bar plotted</text>`}`;
  }).join('')}</svg><figcaption>Unit: ${escapeHtml(current?.unit ?? previous?.unit ?? '')} · Two observations, not a live trend</figcaption></figure>`;
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
  return `<details class="evidence-card"><summary><span>${escapeHtml(label)}</span><span>${escapeHtml(source?.publisher || 'Source unavailable')} <i aria-hidden="true">+</i></span></summary><div class="evidence-body"><div class="evidence-head"><span class="tiny-label">ORIGINAL SOURCE VALUE</span><span>${escapeHtml(observation.source_area || 'Submarket')}</span></div><strong>${escapeHtml(formatValue(observation))}</strong><p>${escapeHtml(observation.definition)}</p><p class="metadata">Unit: ${escapeHtml(observation.unit)} · Billing period: ${escapeHtml(observation.billing_period || 'not stated')} · ${escapeHtml(observation.spatial_granularity)} · ${escapeHtml(observation.data_kind)}</p><p class="metadata">${escapeHtml(source?.publisher || 'Source unavailable')} · ${escapeHtml(source?.title || '')} · ${escapeHtml(source?.published_at || '')} · ${escapeHtml(source?.verification_status || '')}</p>${excerpt ? `<blockquote>“${escapeHtml(excerpt.quote)}”<cite>${escapeHtml(excerpt.section)}</cite></blockquote>` : ''}${sourceLink(source)}</div></details>`;
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
  target.innerHTML = `<div class="detail-title"><h3><i class="selection-marker" aria-hidden="true"></i>${escapeHtml(area?.name || selected)}</h3><span class="detail-pill">${escapeHtml(selectedObservation?.status === 'available' ? 'VERIFIED EXCERPT' : selectedObservation?.status === 'conflict' ? 'CONFLICT' : 'COVERAGE GAP')}</span></div><h4 class="detail-metric">${escapeHtml(metricName(metric))}</h4><div class="selected-observation"><strong>${escapeHtml(selectedObservation?.status === 'available' ? formatValue(selectedObservation) : statusLabel(selectedObservation))}</strong><span>${escapeHtml(periodName(period))} · ${escapeHtml(selectedObservation?.unit ?? market?.unit ?? '')}</span></div><details class="metric-definition"><summary>Definition &amp; illustrative scope <span aria-hidden="true">+</span></summary><p class="detail-description">${escapeHtml(selectedObservation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '')}</p><p class="detail-description">${escapeHtml(area?.definition || '')} Selection boundary is illustrative. 3D buildings are spatial context only.</p></details>${snapshotChart(previous,current)}${comparisonBlock(comparison)}<div class="subhead"><span class="tiny-label">REPORTED VALUES &amp; ORIGINAL EVIDENCE</span></div>${evidenceBlock(previous, trend.previous, '2024 YEAR-END')}${evidenceBlock(current, trend.current, '2025 YEAR-END')}${previous?.status !== 'available' && current?.status !== 'available' ? '<p class="empty-message">No verified data for this metric in either year-end snapshot. Missing does not mean zero.</p>' : ''}<details class="report-notes"><summary>Report context &amp; demand drivers <span>${notes.length} events</span></summary><p class="metadata">Historical reporting · not live news</p>${notesBlock(notes, sources, excerpts)}</details>${[...trend.previous.warnings, ...trend.current.warnings].length ? `<p class="warning">${escapeHtml([...trend.previous.warnings, ...trend.current.warnings].join(' · '))}</p>` : ''}`;
}
const areaName = (id: string): string => catalog?.areas.find(a => a.id === id)?.name ?? id;
const metricName = (id: string): string => catalog?.metrics.find(m => m.id === id)?.label ?? id;
const periodName = (id: string): string => catalog?.periods.find(p => p.id === id)?.label ?? id;
const scopeName = (area: string, measure: string): string => `${areaName(area)} · ${metricName(measure)}`;
const contextName = (context: {area_id: AreaId; metric: MetricId; period: PeriodId}): string => `${scopeName(context.area_id, context.metric)} · ${periodName(context.period)}`;

function answerChart(previous: Observation, current: Observation): string {
  if (previous.status !== 'available' || current.status !== 'available' || previous.value === null || current.value === null) return '';
  // Scale bars for display only; all reported values and changes remain Python-owned.
  const max = Math.max(1, previous.value, current.value);
  return `<figure class="snapshot-chart answer-chart" aria-label="Two reported snapshots, not a continuous trend">${[previous,current].map(fact => `<div class="answer-chart-row"><span>${escapeHtml(periodName(fact.period))}</span><div class="answer-chart-track"><i class="chart-bar ${fact.period === '2025-YE' ? 'current' : ''}" style="width:${fact.value!/max*100}%"></i></div></div>`).join('')}<figcaption>Unit: ${escapeHtml(current.unit)} · Two observations, not a live trend</figcaption></figure>`;
}

function toolCallBlock(call: ToolCall): string {
  const output = call.output;
  const fields: Record<string,string> = {observations:'observation',comparisons:'comparison',sources:'source',evidence:'excerpt',notes:'event',areas:'area',metrics:'metric',periods:'period'};
  const counts = output ? Object.keys(fields).filter(key => Array.isArray(output[key])).map(key => { const count = (output[key] as unknown[]).length; return `${count} ${fields[key]}${count === 1 ? '' : 's'}`; }).join(' · ') : 'Full output was not included by this runtime';
  const returned = output?.observations?.map(fact => `<div><span>${escapeHtml(scopeName(fact.area_id, fact.metric))}<small>${escapeHtml(periodName(fact.period))} · ${escapeHtml(fact.status)}</small></span><strong>${escapeHtml(formatValue(fact))}</strong></div>`).join('') ?? '';
  const changes = output?.comparisons?.map(c => `<div><span>${escapeHtml(scopeName(c.area_id, c.metric))}<small>${escapeHtml(periodName(c.previous_period))} → ${escapeHtml(periodName(c.current_period))}</small></span><strong>${escapeHtml(c.change_value === null ? `Not calculated · ${c.status}` : `${c.change_value > 0 ? '+' : ''}${formatNumber(c.change_value)} ${c.change_unit}`)}</strong></div>`).join('') ?? '';
  return `<details class="tool-call"><summary><span class="tool-status ${call.ok ? 'ok' : 'failed'}">${call.ok ? '✓' : '!'}</span><span class="tool-identity"><code>${escapeHtml(call.name)}</code><small>${escapeHtml(counts || (output?.error ? output.error.message : 'Business JSON returned'))}</small></span><span class="tool-disclosure">${call.ok ? 'Completed' : 'Failed'} <i aria-hidden="true">+</i></span></summary><div class="tool-body">${output?.error ? `<p class="alert error">${escapeHtml(output.error.code)} · ${escapeHtml(output.error.message)}</p>` : ''}${returned || changes ? `<div class="tool-returned"><span class="tiny-label">ACTUAL PYTHON RETURN · NOT AI PROSE</span>${returned}${changes}</div>` : ''}<span class="tiny-label">INPUT ARGUMENTS</span><pre class="tool-arguments">${escapeHtml(JSON.stringify(call.arguments, null, 2))}</pre>${output ? `<details class="raw-tool-details"><summary>Complete Python output (JSON) <span aria-hidden="true">↗</span></summary><pre class="tool-output">${escapeHtml(JSON.stringify(output, null, 2))}</pre></details>` : '<p class="muted">Full tool output unavailable. Selected answer evidence is shown above, not reconstructed as a tool return.</p>'}</div></details>`;
}

function renderAgent(result: ChatResult, question: string, submittedContext: {area_id: AreaId; metric: MetricId; period: PeriodId}): void {
  const groups = new globalThis.Map<string, {area: AreaId; measure: MetricId; facts: Observation[]; comparisons: Comparison[]}>();
  for (const item of [...result.facts, ...result.calculations]) {
    const key = `${item.area_id}/${item.metric}`;
    if (!groups.has(key)) groups.set(key, {area: item.area_id, measure: item.metric, facts: [], comparisons: []});
  }
  for (const fact of result.facts) groups.get(`${fact.area_id}/${fact.metric}`)!.facts.push(fact);
  for (const comparison of result.calculations) groups.get(`${comparison.area_id}/${comparison.metric}`)!.comparisons.push(comparison);
  const scope = [...groups.values()].map(group => scopeName(group.area, group.measure)).join(' / ');
  const data = [...groups.values()].map(group => {
    const facts = [...group.facts].sort((a,b) => a.period.localeCompare(b.period));
    const previous = facts.find(f => f.period === '2024-YE'), current = facts.find(f => f.period === '2025-YE');
    const comparable = group.comparisons.some(c => c.status === 'available' && c.previous_period === previous?.period && c.current_period === current?.period);
    const targetPeriod = facts.at(-1)?.period ?? group.comparisons[0]?.current_period;
    const valueCards = facts.map(fact => `<article class="answer-fact ${fact.status}" data-fact-id="${escapeHtml(fact.id)}"><span>${escapeHtml(periodName(fact.period))}</span><strong>${escapeHtml(formatValue(fact))}</strong><small>${escapeHtml(fact.status === 'available' ? 'Reported value' : statusLabel(fact))} · ${escapeHtml(fact.unit)}</small></article>`).join('');
    return `<section class="answer-market"><div class="answer-market-head"><h3>${escapeHtml(scopeName(group.area, group.measure))}</h3>${targetPeriod ? `<button type="button" class="view-answer-market" data-area="${escapeHtml(group.area)}" data-metric="${escapeHtml(group.measure)}" data-period="${escapeHtml(targetPeriod)}" aria-label="View ${escapeHtml(areaName(group.area))} on map">View on map ↗</button>` : ''}</div><div class="answer-facts">${valueCards}</div>${comparable && previous && current ? answerChart(previous,current) : ''}${group.comparisons.map(c => comparisonBlock(c)).join('')}<p class="answer-definition">${escapeHtml(facts[0]?.definition ?? catalog?.metrics.find(m => m.id === group.measure)?.definition ?? '')}</p>${facts.some(f => f.status !== 'available') ? '<p class="answer-missing">Missing is not zero. No estimate or zero bar is substituted.</p>' : ''}</section>`;
  }).join('');
  const sourceCards = result.sources.map(source => {
    const quote = result.evidence.find(e => e.source_id === source.id && result.facts.some(f => f.evidence_id === e.id));
    return `<article class="answer-source"><div><strong>${escapeHtml(source.publisher)}</strong><span>${escapeHtml(periodName(source.report_period))}</span></div><p>${sourceLink(source, `${source.title} ↗`)}</p><small>Published ${escapeHtml(source.published_at)} · ${escapeHtml(source.verification_status)}</small>${quote ? `<blockquote>“${escapeHtml(quote.quote)}”</blockquote>` : ''}</article>`;
  }).join('');
  const boilerplate = 'Historical report snapshots, not a live market feed. Interpretation is AI-generated; verified numeric facts and calculations are shown separately.';
  const warnings = result.warnings.filter(w => w !== boilerplate);
  $('.agent-shell').classList.add('has-answer');
  $('#agent-result').innerHTML = `<article class="answer"><div class="answer-head"><span class="tiny-label">ANSWER SCOPE · FROM RETURNED PYTHON EVIDENCE</span><span class="answer-complete">✓ Evidence returned</span></div><h2 id="answer-scope">${escapeHtml(scope)}</h2><p id="answer-question">${escapeHtml(question)}</p><p class="submitted-context">Map selection at submission: ${escapeHtml(contextName(submittedContext))}. Explicit questions take priority.</p><div class="answer-data">${data}</div><section class="answer-assessment"><span class="tiny-label">AI INTERPRETATION</span><p class="answer-text">${escapeHtml(result.answer)}</p></section>${warnings.length ? `<p class="warning">${escapeHtml(warnings.join(' · '))}</p>` : ''}<section class="tool-activity"><h3>Tools used <span>${result.tool_calls.length} actual ${result.tool_calls.length === 1 ? 'call' : 'calls'}</span></h3>${result.tool_calls.map(call => toolCallBlock(call)).join('')}</section>${sourceCards ? `<section class="answer-sources"><h3>Sources &amp; reported evidence</h3>${sourceCards}</section>` : '<p class="answer-missing">No source-backed value returned for the missing observation.</p>'}${result.notes.length ? `<details class="answer-notes"><summary>Report context · ${result.notes.length} events</summary>${notesBlock(result.notes, result.sources, result.evidence)}</details>` : ''}<footer class="answer-foot">Historical snapshots, not live quotes. Values and changes come from Python; interpretation is AI-generated.<details class="run-details"><summary>Run details</summary><span>Run ${escapeHtml(result.run_id)}</span></details></footer></article>`;
  $('#agent-result').querySelectorAll<HTMLButtonElement>('.view-answer-market').forEach(button => button.addEventListener('click', () => {
    const area = button.dataset.area as AreaId, measure = button.dataset.metric as MetricId, targetPeriod = button.dataset.period as PeriodId;
    if (!catalog?.areas.some(a => a.id === area) || !catalog.metrics.some(m => m.id === measure) || !catalog.periods.some(p => p.id === targetPeriod)) return;
    const filtersChanged = metric !== measure || period !== targetPeriod;
    metric = measure; period = targetPeriod; renderFilters();
    selectArea(area);
    if (filtersChanged) void refresh();
    showSection('market');
  }));
}
$('#chat-form').addEventListener('submit', async event => {
  event.preventDefault();
  if (chatBusy) return;
  const input = $('#question') as HTMLInputElement;
  const question = input.value.trim();
  if (!question) return;
  const submittedContext = {area_id: selected, metric, period};
  setAgentExpanded(true);
  $('.agent-shell').classList.remove('has-answer');
  chatBusy = true;
  $('.agent-shell').classList.add('is-running');
  $('#chat-form').setAttribute('aria-busy', 'true');
  const button = $('#chat-form').querySelector<HTMLButtonElement>('button[type=submit]');
  if (button) button.disabled = true;
  $('#agent-result').innerHTML = '<p class="alert loading" role="status">Waiting for the assistant… Completed Python tool activity and returned data will appear with the answer.</p>';
  try {
    const response = await api<ChatResult>('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question, ...(sessionId ? {session_id: sessionId} : {}), context: submittedContext})});
    if (response.status !== 'completed') throw new Error('Assistant did not complete its evidence-backed run.');
    sessionId = response.session_id;
    renderAgent(response, question, submittedContext);
  } catch (error) {
    const detail = message(error);
    const login = /login|not.logged|not_authenticated|authentication|unauthorized|subscription.auth/i.test(detail);
    $('#agent-result').innerHTML = `<p class="alert error" role="alert">${escapeHtml(detail)}${login ? '<br>To sign in to the dedicated runtime, run <code>uv run london-office login</code> in the project root, then retry.' : ''}</p>`;
  } finally { chatBusy = false; $('.agent-shell').classList.remove('is-running'); $('#chat-form').setAttribute('aria-busy', 'false'); if (button) button.disabled = false; }
});
$('.suggestions').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
  const input = $('#question') as HTMLInputElement;
  input.value = button.dataset.question ?? '';
  input.focus();
}));

function setAgentExpanded(expanded: boolean): void {
  $('#agent-expansion').hidden = !expanded;
  $('.agent-shell').classList.toggle('expanded', expanded);
  $('#open-agent').setAttribute('aria-expanded', String(expanded));
  $('#open-agent').title = expanded ? 'Close research assistant' : 'Open research assistant';
  if (!expanded && $('.agent-shell').contains(document.activeElement)) $('#open-agent').focus();
}
function renderCameraState(state: CameraState | undefined = cameraState): void {
  if (!state) return;
  cameraState = state;
  $('#camera-caption').textContent = `${state.pitch < 1 ? 'TOP-DOWN' : '3D CITY'} · ${state.pitch.toFixed(0)}° · Z ${state.zoom.toFixed(1)}`;
  $('#compass-arrow').style.transform = `rotate(${-state.bearing}deg)`;
  const layerStatus = document.querySelector('#layer-background-status');
  if (layerStatus) layerStatus.textContent = `${$('#map-state').textContent} · source-provided geometry, not height surveys`;
  const target = $('#map-directions');
  if (!catalog) return;
  const width = $('#map').clientWidth, height = $('#map').clientHeight;
  const mobile = window.matchMedia('(max-width: 760px)').matches;
  const rail = $('#workspace-nav').getBoundingClientRect();
  const viewport = $('#map').getBoundingClientRect();
  const offscreen = catalog.areas.map(area => ({area, point:map.project(area.center)})).filter(item => item.point && (item.point.x < 0 || item.point.x > width || item.point.y < 0 || item.point.y > height));
  offscreen.sort((a,b)=>a.point!.y-b.point!.y);
  const gap = Math.min(38,Math.max(0,height-335)/Math.max(1,offscreen.length-1));
  target.innerHTML = offscreen.map(({area,point},index) => {
    if (!point) return '';
    const left = point.x < 0, right = point.x > width;
    let x = left ? 12 : right ? width-12 : Math.max(80,Math.min(width-80,point.x));
    let y = Math.max((mobile ? 270 : 260)+index*gap,Math.min(height-155-(offscreen.length-index-1)*gap,point.y));
    // The detail region is outside the map. Only the fixed navigation can cover it.
    if (y > rail.top-viewport.top-18 && y < rail.bottom-viewport.top+18) {
      if (!mobile && !left) x = Math.min(x,rail.left-viewport.left-(right ? 12 : 80));
      else if (mobile) y = rail.top-viewport.top-35;
    }
    const arrow = left ? '←' : right ? '→' : point.y < 0 ? '↑' : '↓';
    return `<button type="button" class="edge-direction ${left ? 'edge-left' : right ? 'edge-right' : 'edge-center'}" data-focus="${area.id}" style="left:${x}px;top:${y}px" aria-label="Focus ${escapeHtml(area.name)}">${escapeHtml(area.name)} <span aria-hidden="true">${arrow}</span></button>`;
  }).join('');
  target.querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click',()=>selectArea(button.dataset.focus as AreaId)));
}
function setNavigation(expanded: boolean): void {
  $('#workspace-nav').classList.toggle('labels-open',expanded);
  renderCameraState();
}
function closeNavigation(): void {
  setNavigation(false);
  // Return to the selected icon, not to a separate menu launcher.
  suppressNavigationFocus = true;
  $('#workspace-nav').querySelector<HTMLButtonElement>(`[data-section="${activeSection}"]`)?.focus({preventScroll:true});
  suppressNavigationFocus = false;
}
function setMarketPanel(open: boolean): void {
  $('#market-panel').hidden = !open;
  $('.workspace').classList.toggle('market-open',open);
  $('#workspace-nav').querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.setAttribute('aria-pressed',String(open && button.dataset.section === activeSection)));
  renderCameraState();
}
function showSection(section: SectionId): void {
  activeSection = section;
  const nextMetric = section === 'vacancy' ? 'vacancy_rate' : section === 'rents' && metric === 'vacancy_rate' ? 'prime_rent' : metric;
  const changed = metric !== nextMetric;
  metric = nextMetric;
  renderFilters(); renderSection();
  setNavigation($('#workspace-nav').matches(':hover') && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  setMarketPanel(true);
  if (changed) void refresh();
}
function closeMarketPanel(): void {
  setMarketPanel(false);
  closeNavigation();
}
$('#workspace-nav').addEventListener('pointerenter',event => {
  if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) setNavigation(true);
});
$('#workspace-nav').addEventListener('pointerleave',event => {
  // Touch end emits pointerleave too; it is not a mouse leaving the rail.
  if (event.pointerType === 'mouse' && !$('#workspace-nav').contains(document.activeElement?.matches(':focus-visible') ? document.activeElement : null)) setNavigation(false);
});
$('#workspace-nav').addEventListener('focusin',() => {
  if (!suppressNavigationFocus && document.activeElement?.matches(':focus-visible')) setNavigation(true);
});
$('#workspace-nav').addEventListener('focusout',event => {
  if (!$('#workspace-nav').contains(event.relatedTarget as Node | null) && !$('#workspace-nav').matches(':hover')) setNavigation(false);
});
$('#workspace-nav').addEventListener('pointerdown',event => {
  touchNavigationPreview = event.pointerType === 'touch' && !$('#workspace-nav').classList.contains('labels-open');
  if (touchNavigationPreview) setNavigation(true);
});
$('#workspace-nav').addEventListener('transitionend',event => {
  if (event.target === $('#workspace-nav') && event.propertyName === 'width') renderCameraState();
});
$('#workspace-nav').querySelectorAll<HTMLButtonElement>('[data-section]').forEach(button => button.addEventListener('click',() => {
  if (touchNavigationPreview) { touchNavigationPreview = false; return; }
  const section = button.dataset.section as SectionId;
  if (activeSection === section && !$('#market-panel').hidden) closeMarketPanel();
  else { showSection(section); $('#panel-title').focus({preventScroll:true}); }
}));
$('#close-market').addEventListener('click',closeMarketPanel);
['#workspace-nav','#market-panel'].forEach(selector => $(selector).addEventListener('keydown',event => {
  if (event.key === 'Escape') { event.preventDefault(); if ($('#workspace-nav').classList.contains('labels-open')) closeNavigation(); else closeMarketPanel(); }
}));
$('#open-agent').addEventListener('click',()=>setAgentExpanded($('#agent-expansion').hidden === true));
$('#question').addEventListener('focus',()=>setAgentExpanded(true));
$('#close-agent').addEventListener('click',()=>setAgentExpanded(false));
$('.agent-shell').addEventListener('keydown',event=>{ if (event.key === 'Escape') { event.preventDefault(); setAgentExpanded(false); } });
$('#zoom-in').addEventListener('click',()=>map.zoomBy(1));
$('#zoom-out').addEventListener('click',()=>map.zoomBy(-1));
$('#rotate-view').addEventListener('click',()=>map.rotateBy(45));
$('#north-view').addEventListener('click',()=>map.rotateBy(-(cameraState?.bearing ?? 0)));
$('#tilt-view').addEventListener('click',()=>map.setPitch((cameraState?.pitch ?? 55) > 60 ? 40 : 70));
$('#top-view').addEventListener('click',()=>map.setPitch(0));
$('#reset-map').addEventListener('click',()=>{ map.reset(); $('#map-tooltip').hidden=true; });
$('#dismiss-instructions').addEventListener('click',()=>{ $('#map-instructions').hidden=true; });
$('#map-info-toggle').addEventListener('click',()=>{const info=$('#map-info');info.hidden=!info.hidden;$('#map-info-toggle').setAttribute('aria-expanded',String(!info.hidden));});
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
