import {MarketMap, type CameraState} from './map';
import {mountMonitoring} from './monitoring';
import {renderResearchCharts} from './research-charts';
import {mountDiscoveryAuthorization} from './discovery-authorization';
import {mountResearchIntake} from './research-intake';
import type {ApiError, AreaId, Catalog, ChatResult, Comparison, DiscoveryResult, Evidence, Market, MetricId, Note, Observation, PeriodId, Research, ResearchComparison, ResearchRecord, Source, SourceCandidate, SourcePool, SourceTopicId, ToolCall} from './types';
import {createI18n, applyLanguage, mountLanguageSelector, isMessageKey, dictionaries, type MessageKey, type MessageParams} from './i18n';
import './style.css';
import './i18n/style.css';
import './dashboard.css';
import './user-controls.css';
import {localizeDescription} from './i18n/descriptions';

const i18n = createI18n();
const {t} = i18n;
applyLanguage(document.documentElement, i18n.language);

const $ = (selector: string): HTMLElement => {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing UI element: ${selector}`);
  return element;
};
const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[char] ?? char));
const tr = (key: MessageKey, parameters?: MessageParams): string => escapeHtml(t(key, parameters));
const description = (original: string): string => escapeHtml(localizeDescription(original, i18n.language));
const uiCode = (prefix: string, code: string, fallback = code): string => {
  const key = `${prefix}.${code}`;
  return isMessageKey(key) ? t(key) : fallback;
};
const safeUrl = (value: string): string | null => { try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; } catch { return null; } };
const sourceLink = (source: Source | undefined, label = t('button.originalSource')): string => {
  const href = source && safeUrl(source.url);
  return href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>` : `<span>${tr('status.originalLinkUnavailable')}</span>`;
};
const formatNumber = (value: number): string => new Intl.NumberFormat('en-GB', {maximumFractionDigits: 2}).format(value);
const formatValue = (observation: Observation | undefined): string => {
  if (!observation || observation.status !== 'available' || observation.value === null) return t('status.noVerifiedData');
  if (observation.unit === 'GBP/sq ft') return `£${new Intl.NumberFormat('en-GB', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(observation.value)} / sq ft`;
  return `${formatNumber(observation.value)}${observation.unit === '%' ? '%' : ` ${observation.unit}`}`;
};
const statusLabel = (observation: Observation | undefined): string => t(observation?.status === 'conflict' ? 'status.conflictingEvidence' : 'status.noVerifiedData');
const message = (error: unknown): string => error instanceof Error ? error.message : t('error.requestFailed');

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); }
  catch { throw new Error(t('error.apiUnreachable')); }
  let payload: T | ApiError;
  try { payload = await response.json() as T | ApiError; }
  catch { throw new Error(t('error.apiNonJson', {status: response.status})); }
  if (!response.ok || (typeof payload === 'object' && payload !== null && 'status' in payload && payload.status === 'error')) {
    const apiError = payload as ApiError;
    throw new Error(apiError.error?.message ? `${apiError.error.code}: ${apiError.error.message}` : t('error.apiRequest', {status: response.status}));
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
  {id:'macro',label:'Macro economy',symbol:icon('<path d="m3 8 9-5 9 5ZM5 8v10M10 8v10M14 8v10M19 8v10M3 21h18"/>'),description:'Historical macro research in its original UK scope and statistical windows; not a London map metric.'},
  {id:'demand',label:'Demand drivers',symbol:icon('<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M19 14a5 5 0 0 1 2 4v3"/>'),description:'Flight to quality, sustainability and hybrid working. Evidence and unconnected topics stay distinct.'},
  {id:'news',label:'News & events',symbol:icon('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M7 8h10M7 12h4M7 16h4M15 12h2M15 16h2"/>'),description:'Dated research-report events. A live or emerging-news feed is not connected.'},
  {id:'layers',label:'Map layers',symbol:icon('<path d="m3 7 9-4 9 4-9 4ZM3 12l9 4 9-4M3 17l9 4 9-4"/>'),description:'Choose the existing market lens. Buildings are spatial context, not property-level market data.'}
] as const;
type SectionId = typeof sections[number]['id'];
const navigation = [sections.slice(0,3),sections.slice(3,8),sections.slice(8)].map(group => `<div class="nav-group">${group.map(section => `<button type="button" class="workspace-nav-item" data-section="${section.id}" aria-label="${section.label}" aria-controls="market-panel" aria-pressed="false"><span class="nav-item-icon">${section.symbol}</span><span class="nav-item-label">${section.label}</span><span class="nav-item-arrow" aria-hidden="true">‹</span></button>`).join('')}</div>`).join('');
const app = $('#app');
app.innerHTML = `
  <header class="masthead">
    <div class="masthead-left"><div class="brand"><span class="brand-symbol">${cityIcon}</span><div><span class="brand-overline">LONDON / MARKET INTELLIGENCE</span><strong><span class="brand-title">Office Monitor</span><span class="brand-dot">.</span></strong></div></div><div id="language-settings"></div></div>
    <div class="header-context"><span class="snapshot-badge"><i></i><span class="snapshot-current"><span class="snapshot-label">Historical evidence</span><b>2024 — 2025</b></span><span class="snapshot-map-period"></span></span></div>
  </header>
  <main class="workspace">
    <section class="map-panel" aria-labelledby="page-title">
      <div class="map-wrap">
        <div id="map" aria-label="Explorable 3D London map with illustrative submarket selectors"></div>
        <div class="map-heading"><span class="eyebrow">SPATIAL CONTEXT / LONDON</span><h1 id="page-title">London office markets</h1><p>Explore the city. Follow the evidence.</p></div>
        <div id="map-state" class="map-state" role="status">Preparing city map…</div>
        <div id="map-tooltip" class="map-tooltip" hidden></div>
        <div id="map-directions" class="map-directions" aria-label="Offscreen submarkets"></div>
        <div class="map-legend"><span><i class="legend-swatch verified"></i><span class="legend-reported">Reported value</span></span><span><i class="legend-swatch missing"></i><span class="legend-missing">Data gap</span></span><span><i class="legend-swatch conflict"></i><span class="legend-conflict">Conflict</span></span><span><i class="legend-swatch selected"></i><span class="legend-selected">Selected area</span></span></div>
        <div class="map-toolbar" role="group" aria-label="Map camera controls">
          <button type="button" id="zoom-in" aria-label="Zoom in" title="Zoom in">${icon('<path d="M12 5v14M5 12h14"/>')}</button>
          <button type="button" id="zoom-out" aria-label="Zoom out" title="Zoom out">${icon('<path d="M5 12h14"/>')}</button><span class="toolbar-divider"></span>
          <button type="button" id="rotate-view" aria-label="Rotate view" title="Rotate 45 degrees">${icon('<path d="M20 8a8 8 0 1 0 0 8M20 3v5h-5"/>')}</button>
          <button type="button" id="tilt-view" aria-label="Tilt view" title="Change viewing angle">${icon('<path d="m3 17 9-5 9 5-9 5ZM4 8l8-5 8 5M12 3v9"/>')}</button>
          <button type="button" id="top-view" aria-label="Top-down view" title="Top-down view">${icon('<path d="m3 8 9-5 9 5-9 5ZM3 12l9 5 9-5M3 16l9 5 9-5"/>')}</button><span class="toolbar-divider"></span>
          <button type="button" id="reset-map" class="reset-button" aria-label="Reset map" title="Return to city overview">${icon('<circle cx="12" cy="12" r="7"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>')} <span>Overview</span></button>
        </div>
        <div id="map-instructions" class="map-instructions"><span>${icon('<path d="m8 8 4-4 4 4M12 4v16M8 16l4 4 4-4M4 12h16M8 8l-4 4 4 4M16 8l4 4-4 4"/>')} <span class="drag-instruction">Drag to explore</span><small>Scroll to zoom · Right-drag to rotate &amp; tilt</small></span><button type="button" id="dismiss-instructions" aria-label="Dismiss map instructions">×</button></div>
        <div class="camera-readout"><button type="button" id="north-view" class="compass" aria-label="Reset north" title="Face north"><span id="compass-arrow">${icon('<path d="m12 3 5 16-5-3-5 3Z"/>')}</span><b>N</b></button><span id="camera-caption">3D CITY VIEW</span><button type="button" id="map-info-toggle" aria-label="Map information" aria-expanded="false">${icon('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/>')}</button></div>
        <div id="map-info" class="map-info" hidden><strong>A city backdrop, not building-level market data</strong><p>Building volumes are map-provided spatial context, not verified height surveys or property-level rent. Selection outlines are illustrative, not official reporting boundaries. Amber highlights the current selection, including building footprints inside or intersecting that outline; it is not a market value or data-quality signal.</p><p><span class="map-source-label">Source</span>: <a href="https://openfreemap.org/" target="_blank" rel="noopener noreferrer">OpenFreeMap</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">© OpenStreetMap</a> · <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener noreferrer">© OpenMapTiles</a>. <span class="map-renderer-note">Rendered with MapLibre + deck.gl.</span></p></div>
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
        <div class="agent-operations"><label for="agent-mode">Mode</label><select id="agent-mode" aria-label="Assistant operation"><option value="market">Historical market</option><option value="discovery">Discover sources</option></select><button type="button" id="view-source-pool">View source pool</button><button type="button" id="view-research-intake">Research intake</button></div>
        <div id="discovery-authorization" hidden></div><div id="research-intake" hidden></div>
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
let catalogError: string | null = null;
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
let mapStatus = dictionaries.en['map.status.preparing'];
let hovered: {area: AreaId; x: number; y: number} | null = null;
let agentPresentation: (() => void) | null = null;
const mapStatusKeys = ['map.status.preparing','map.status.loading','map.status.ready','map.status.backgroundUnavailable','map.status.webglUnavailable','map.status.renderUnavailable','map.status.selecting'] as const;
const localMapStatus = (): string => {
  const key = mapStatusKeys.find(key => dictionaries.en[key] === mapStatus);
  return key ? t(key) : mapStatus;
};
const map = new MarketMap($('#map'), area => selectArea(area), (area, x, y) => hover(area, x, y), status => { mapStatus = status; $('#map-state').textContent = localMapStatus(); renderCameraState(); }, state => renderCameraState(state));
window.__officeMapDebug = {state: () => map.debug(), project: point => map.project(point)};
const authorizationControls = mountDiscoveryAuthorization($('#discovery-authorization'), {api, t,
  getQuestion: () => ($('#question') as HTMLInputElement).value,
  onSearch: id => submitQuestion(id)});
const intakeControls = mountResearchIntake($('#research-intake'), {api, t, onAdmitted: refreshAcceptedResearch});

async function refreshAcceptedResearch(): Promise<void> {
  // An explicitly admitted overlay changes research, not the map's historical data or camera.
  marketCache.clear();
  sessionId = undefined;
  const sequence = ++viewSequence;
  ++detailSequence;
  const result = await getMarket(metric, period);
  if (sequence !== viewSequence) return;
  market = result;
  loading = false;
  marketError = null;
  renderMarketPresentation(); // Deliberately no map.update/focus/start.
  await loadDetail();
}

function renderCoverageBadge(): void {
  const ids = new Set(market?.research?.latest_update?.record_ids ?? []);
  const years = [...new Set(market?.research?.records.filter(record => ids.has(record.id) && record.status === 'available')
    .flatMap(record => record.release_vintage?.match(/^\d{4}/)?.[0] ?? []) ?? [])].sort();
  const badge = $('.snapshot-badge');
  $('.snapshot-label').textContent = t(years.length ? 'brand.verifiedResearch' : 'brand.historicalEvidence');
  badge.querySelector('b')!.textContent = years.length ? years.join(' · ') : '2024 — 2025';
  $('.snapshot-map-period').textContent = `${t('brand.mapSnapshot')}: 2024 — 2025`;
  badge.title = t('brand.coverageHint');
}

// These bindings are explicit UI slots, never a scan/replacement of source prose.
function renderChrome(): void {
  const copy: readonly [string, MessageKey][] = [
    ['.brand-overline','brand.overline'], ['.brand-title','brand.title'],
    ['.map-heading .eyebrow','map.eyebrow'], ['#page-title','map.title'], ['.map-heading p','map.subtitle'],
    ['.legend-reported','map.legend.reported'], ['.legend-missing','map.legend.missing'], ['.legend-conflict','map.legend.conflict'], ['.legend-selected','map.legend.selected'],
    ['#reset-map span','map.overview'], ['.drag-instruction','map.drag'], ['.map-instructions small','map.gestures'],
    ['#map-info strong','map.backdropTitle'], ['#map-info p:first-of-type','map.backdropLimit'], ['.map-source-label','metadata.source'], ['.map-renderer-note','map.renderedWith'],
    ['label[for=question]','agent.questionLabel'], ['#agent-heading','agent.heading'], ['label[for=agent-mode]','agent.modeLabel'],
    ['#agent-mode option[value=market]','agent.mode.market'], ['#agent-mode option[value=discovery]','agent.mode.discovery'],
    ['#view-source-pool','button.sourcePool'], ['#view-research-intake','button.researchIntake'], ['.suggestion:first-child','agent.suggestion.rent'], ['.suggestion:last-child','agent.suggestion.gaps'],
    ['.inspector-heading .eyebrow','workspace.title'], ['#measure-filter .tiny-label','filter.measure'], ['.period-filter .tiny-label','filter.period'],
    ['.panel-divider .tiny-label','workspace.snapshotsAndSources'], ['#areas-heading','workspace.areaOverview']
  ];
  for (const [selector, key] of copy) $(selector).textContent = t(key);
  const attributes: readonly [string, string, MessageKey][] = [
    ['#map','aria-label','map.label'], ['#map-directions','aria-label','map.offscreenAreas'], ['.map-toolbar','aria-label','map.cameraControls'],
    ['#zoom-in','aria-label','map.zoomIn'], ['#zoom-in','title','map.zoomIn'], ['#zoom-out','aria-label','map.zoomOut'], ['#zoom-out','title','map.zoomOut'],
    ['#rotate-view','aria-label','map.rotate'], ['#rotate-view','title','map.rotateHint'], ['#tilt-view','aria-label','map.tilt'], ['#tilt-view','title','map.tiltHint'],
    ['#top-view','aria-label','map.topDown'], ['#top-view','title','map.topDown'], ['#reset-map','aria-label','map.reset'], ['#reset-map','title','map.resetHint'],
    ['#dismiss-instructions','aria-label','map.dismissInstructions'], ['#north-view','aria-label','map.resetNorth'], ['#north-view','title','map.faceNorth'], ['#map-info-toggle','aria-label','map.information'],
    ['.agent-shell','aria-label','agent.label'], ['#open-agent','aria-label','button.askAgent'], ['.ask-button','aria-label','button.askAssistant'], ['.ask-button','title','button.askAssistant'],
    ['#close-agent','aria-label','button.closeAgent'], ['#close-agent','title','button.closeAssistant'], ['#agent-mode','aria-label','agent.operationLabel'],
    ['#workspace-nav','aria-label','workspace.sections'], ['#close-market','aria-label','button.closeWorkspace'], ['#close-market','title','button.collapseDetails'],
    ['.controls','aria-label','filter.title'], ['#metrics','aria-label','filter.measure'], ['#periods','aria-label','filter.period'], ['.detail-panel','aria-label','workspace.areaDetail']
  ];
  for (const [selector, attribute, key] of attributes) $(selector).setAttribute(attribute, t(key));
  for (const section of sections) {
    const button = $(`#workspace-nav [data-section="${section.id}"]`);
    button.setAttribute('aria-label', t(`nav.${section.id}`));
    button.querySelector<HTMLElement>('.nav-item-label')!.textContent = t(`nav.${section.id}`);
  }
  $('.map-footnote').innerHTML = `${tr('map.buildingsFootnote')} <span>${tr('map.selectorsFootnote')}</span>`;
  $('.inspector-foot').innerHTML = `${tr('limit.historical')}<br>${tr('limit.missing')}<br>${tr('limit.selection')}`;
  $('#map-state').textContent = localMapStatus();
  $('#open-agent').title = t($('#agent-expansion').hidden ? 'button.openAssistant' : 'button.closeAssistant');
  renderAgentMode();
  renderCameraCaption();
  renderCoverageBadge();
}

function renderLocalizedPresentation(): void {
  const regions = ['#detail-content','#section-content','#agent-result'].map(selector => $(selector));
  const details = regions.map(root => [...root.querySelectorAll<HTMLDetailsElement>('details')].map(detail => detail.open));
  const scrolls = [$('#market-panel'),$('#agent-expansion'),...$('#agent-result').querySelectorAll<HTMLElement>('pre')].map(element => ({element, top: element.scrollTop, left: element.scrollLeft}));
  applyLanguage(document.documentElement, i18n.language);
  renderChrome(); renderFilters(); renderMarketPresentation(); renderDetail();
  map.setLanguagePresentation(t('map.selectionSuffix'), getComputedStyle(document.documentElement).fontFamily);
  agentPresentation?.();
  authorizationControls.render(); intakeControls.render();
  if (hovered && !$('#map-tooltip').hidden) hover(hovered.area, hovered.x, hovered.y);
  regions.forEach((root, index) => root.querySelectorAll<HTMLDetailsElement>('details').forEach((detail, position) => { detail.open = details[index]?.[position] ?? false; }));
  const refreshedScrolls = [$('#market-panel'),$('#agent-expansion'),...$('#agent-result').querySelectorAll<HTMLElement>('pre')];
  scrolls.forEach((saved, index) => { const element = refreshedScrolls[index]; if (element) { element.scrollTop = saved.top; element.scrollLeft = saved.left; } });
  for (const button of $('#map-directions').querySelectorAll<HTMLElement>('[data-focus]')) button.setAttribute('aria-label', t('button.focusArea', {area: areaName(button.dataset.focus!)}));
}

function presentAgent(render: () => void): void { agentPresentation = render; render(); }
function renderAgentMode(): void {
  const discovery = ($('#agent-mode') as HTMLSelectElement).value === 'discovery';
  $('#discovery-authorization').hidden = !discovery || !$('#research-intake').hidden;
  $('.suggestions').hidden = discovery;
  $('.agent-privacy').textContent = t(discovery ? (catalog?.agent.discovery_configured === false ? 'agent.privacy.discoveryUnconfigured' : 'agent.privacy.discovery') : 'agent.privacy.market');
  ($('#question') as HTMLInputElement).placeholder = t(discovery ? 'agent.placeholder.discovery' : 'agent.placeholder.market');
}
function renderCameraCaption(): void {
  $('#camera-caption').textContent = cameraState ? `${t(cameraState.pitch < 1 ? 'map.topDownCamera' : 'map.cityCamera')} · ${cameraState.pitch.toFixed(0)}° · Z ${cameraState.zoom.toFixed(1)}` : t('map.cityView');
  const layerStatus = document.querySelector('#layer-background-status');
  if (layerStatus) layerStatus.textContent = t('map.layer.heightLimit', {status: localMapStatus()});
}

function renderFilters(): void {
  if (!catalog) return;
  $('#metrics').innerHTML = catalog.metrics.map(item => `<button type="button" data-metric="${escapeHtml(item.id)}" class="filter-button ${item.id === metric ? 'active' : ''}" aria-pressed="${item.id === metric}">${escapeHtml(metricName(item.id))}</button>`).join('');
  $('#periods').innerHTML = catalog.periods.map(item => `<button type="button" data-period="${escapeHtml(item.id)}" class="filter-button ${item.id === period ? 'active' : ''}" aria-pressed="${item.id === period}">${escapeHtml(periodName(item.id))}</button>`).join('');
  $('#metrics').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
    metric = button.dataset.metric as MetricId; renderFilters(); void refresh();
  }));
  $('#periods').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
    period = button.dataset.period as PeriodId; renderFilters(); void refresh();
  }));
}
const sourceDate = (date: string | null): string => date || t('status.unknown');
function researchProvenance(sourceIds: string[], evidenceIds: string[], sources: Source[], evidence: Evidence[]): string {
  return `<div class="research-provenance"><span class="tiny-label">${tr('research.sourcesAndExcerpts')}</span>${sourceIds.map(id => {
    const source = sources.find(item => item.id === id);
    if (!source) return `<p class="warning">${tr('research.sourceUnavailable')}</p>`;
    const quotes = evidence.filter(item => item.source_id === id && evidenceIds.includes(item.id));
    return `<div class="research-source"><p><strong>${escapeHtml(source.publisher)}</strong> · ${escapeHtml(source.title)} · ${tr('metadata.published')}: ${escapeHtml(sourceDate(source.published_at))}</p><p>${sourceLink(source)}</p>${quotes.map(item => `<blockquote>“${escapeHtml(item.quote)}”<cite>${escapeHtml(item.section)}</cite></blockquote>`).join('')}</div>`;
  }).join('') || `<p class="metadata">${tr('research.noSource')}</p>`}</div>`;
}
function researchRecordCard(record: ResearchRecord, sources: Source[], evidence: Evidence[]): string {
  return `<article class="research-card" data-research-id="${escapeHtml(record.id)}"><span class="tiny-label">${escapeHtml(uiCode('research.kind', record.kind))} · ${escapeHtml(uiCode('status', record.quality_status === 'conflict' ? 'conflict' : record.status))}${record.reference_observation_ids.length ? ` · ${tr('research.primaryReference')}` : ''}</span><h4>${description(record.label)}</h4><strong class="research-value">${description(record.display_value)}</strong><dl class="research-metadata"><div><dt>${tr('research.sourceGeography')}</dt><dd>${description(record.source_geography)}</dd></div><div><dt>${tr('research.statisticalWindow')}</dt><dd>${description(record.statistical_window)}</dd></div><div><dt>${tr('research.releaseVintage')}</dt><dd>${escapeHtml(sourceDate(record.release_vintage))}</dd></div>${record.target_window !== null ? `<div><dt>${tr('research.forecastTarget')}</dt><dd>${description(record.target_window)}</dd></div><div><dt>${tr('research.forecastAsOf')}</dt><dd>${escapeHtml(sourceDate(record.forecast_as_of))}</dd></div>` : ''}<div><dt>${tr('research.definition')}</dt><dd>${description(record.definition)}</dd></div><div><dt>${tr('research.denominator')}</dt><dd>${description(record.denominator || t('status.notStated'))}</dd></div></dl>${record.event ? `<p class="metadata">${tr('research.eventOccurrence')}: ${description(record.event.occurrence_window)} · ${tr('research.precision')}: ${description(record.event.precision)} · ${tr('research.exactDay')}: ${tr('status.unknown')}</p>${record.event.quantities.map(item => `<p class="metadata">${description(item.measure)}: ${description(item.display_value)}</p>`).join('')}<p class="metadata">${description(record.event.snapshot_disposition)}</p>` : ''}${record.kind === 'forecast' ? `<p class="section-limit">${tr('research.forecastLimit')}</p>` : ''}${record.caveats.length ? `<p class="warning">${escapeHtml(record.caveats.map(value => localizeDescription(value, i18n.language)).join(' · '))}</p>` : ''}${researchProvenance(record.source_ids, record.evidence_ids, sources, evidence)}</article>`;
}
function researchComparisonCard(item: ResearchComparison, sources: Source[], evidence: Evidence[]): string {
  return `<article class="research-card research-comparison" data-research-comparison-id="${escapeHtml(item.id)}"><span class="tiny-label">${tr('research.comparison')} · ${description(item.source_geography)}</span><h4>${description(item.label)}</h4><p class="metadata">${description(item.previous_window)} → ${description(item.current_window)}</p><strong class="research-value">${item.change_value === null ? tr('status.notCalculated', {status: uiCode('status', item.status ?? 'conflict')}) : `${escapeHtml(item.change_value > 0 ? '+' : '')}${escapeHtml(formatNumber(item.change_value))} ${escapeHtml(item.change_unit)}`}</strong>${item.warnings.length ? `<p class="warning">${escapeHtml(item.warnings.map(value => localizeDescription(value, i18n.language)).join(' · '))}</p>` : ''}${researchProvenance(item.source_ids, item.evidence_ids, sources, evidence)}</article>`;
}
function researchBlock(topic: SourceTopicId, research: Research | undefined, sources?: Source[], evidence?: Evidence[]): string {
  if (!research) return `<p class="alert error">${tr('research.unavailable')}</p>`;
  const records = research.records.filter(item => item.topic_ids.includes(topic));
  const latestIds = new Set(research.latest_update?.record_ids ?? []);
  const latestRecords = records.filter(item => latestIds.has(item.id));
  const historicalRecords = records.filter(item => !latestIds.has(item.id));
  const comparisons = research.comparisons.filter(item => item.topic_ids.includes(topic));
  const exclusions = research.exclusions.filter(item => item.topic_ids.includes(topic));
  const sourceList = sources ?? research.sources;
  const evidenceList = evidence ?? research.evidence;
  const update = research.latest_update;
  const latestSection = update && latestRecords.length ? `<section data-latest-research-topic="${escapeHtml(topic)}"><div class="section-report-head"><h3>Latest verified update</h3></div><p class="metadata">Admitted: ${escapeHtml(update.admitted_at)} · Source checked: ${escapeHtml(update.source_checked_at)}</p><p class="section-limit">${escapeHtml(update.note)}</p>${renderResearchCharts(topic,research)}${latestRecords.map(item => researchRecordCard(item,sourceList,evidenceList)).join('')}</section>` : '';
  return `<div class="research-section" data-research-topic="${escapeHtml(topic)}">${latestSection}<div class="section-report-head"><h3>${escapeHtml(topicName(topic))} · ${tr('research.historical')}</h3><span>${tr('status.connected')}</span></div><p class="section-limit"><strong>${tr('research.scopeHeading')}.</strong> ${description(research.scope_note)} ${tr('research.scopeLimit')}</p>${historicalRecords.map(item => researchRecordCard(item,sourceList,evidenceList)).join('') || (!latestRecords.length ? `<p class="muted">${tr('research.noRecords')}</p>` : '')}${comparisons.map(item => researchComparisonCard(item,sourceList,evidenceList)).join('')}${exclusions.length ? `<div class="research-exclusions"><h4>${tr('research.exclusions')}</h4><p>${tr('research.evidenceLimit')}</p>${exclusions.map(item => `<p><strong>${description(item.label)}</strong> · ${description(item.reason)}</p>`).join('')}</div>` : ''}${research.warnings.length ? `<p class="warning">${escapeHtml(research.warnings.map(value => localizeDescription(value, i18n.language)).join(' · '))}</p>` : ''}</div>`;
}
function renderSection(): void {
  const section = sections.find(item => item.id === activeSection)!;
  const observations = ['market','rents','vacancy'].includes(activeSection);
  $('#market-panel').dataset.section = activeSection;
  $('#panel-title').textContent = t(`nav.${section.id}`);
  $('#section-description').textContent = activeSection === 'news'
    ? 'Official source checks and report links, alongside historical report events. Detected links are not verified market facts.'
    : t(`section.${section.id}.description`);
  $('#coverage-summary').hidden = !observations;
  $('.area-panel').hidden = !observations;
  $('.panel-divider').hidden = !observations;
  $('.detail-panel').hidden = !observations;
  $('#measure-filter').hidden = !['market','rents','layers'].includes(activeSection);
  // Year-end controls only change the primary map snapshot, never research windows.
  $('.controls').hidden = !observations && activeSection !== 'layers';
  const board = $('#section-content');
  board.hidden = false;
  if (activeSection === 'layers') {
    board.innerHTML = `<div class="layer-card"><span class="layer-symbol">${sections[8].symbol}</span><div><h3>${tr('map.layer.backdrop')}</h3><p>OpenFreeMap · OpenMapTiles</p><small id="layer-background-status"></small></div></div><div class="layer-card"><span class="layer-symbol">${cityIcon}</span><div><h3>${tr('map.layer.selectors')}</h3><p>${tr('map.layer.geometry')}</p><small>${tr('map.layer.selectionLimit')}</small></div></div><p class="section-limit">${tr('map.layer.dataLimit')}</p>`;
    return;
  }
  const topic: SourceTopicId = activeSection === 'market' ? 'submarkets' : activeSection === 'vacancy' ? 'vacancy' : activeSection as SourceTopicId;
  board.innerHTML = catalogError || marketError ? `<p class="alert error">${tr('error.researchApi', {api: catalogError ? 'Catalog' : 'Market'})}</p>` : loading ? `<p class="muted">${tr('loading.research')}</p>` : researchBlock(topic, market?.research);
  const kind: Partial<Record<SectionId,string>> = {leasing:'report_leasing_event',supply:'report_supply_context',demand:'report_demand_driver'};
  if (['market','rents','vacancy','macro'].includes(activeSection)) return;
  const notes = market?.notes.filter(note => activeSection === 'news' || note.kind === kind[activeSection]) ?? [];
  board.innerHTML += `<div class="section-report-head"><h3>${tr('notes.contextHeading')}</h3><span>${escapeHtml(periodName(period))}</span></div><p class="section-limit">${tr('limit.reportContext')}</p>${catalogError || marketError ? `<p class="alert error">${tr('error.reportContextApi', {api: catalogError ? 'Catalog' : 'Market'})}</p>` : loading ? `<p class="muted">${tr('loading.reportContext')}</p>` : notes.length && market ? notesBlock(notes,market.sources,market.evidence) : `<p class="muted">${tr('notes.noContext')}</p>`}`;
  if (activeSection === 'news') mountMonitoring(board);
}
function renderMarketPresentation(): void {
  renderCoverageBadge();
  const status = $('#global-status');
  status.className = catalogError || marketError ? 'alert error' : loading ? 'alert loading' : '';
  status.textContent = catalogError ? t('error.catalog', {detail: catalogError}) : marketError ? t('error.market', {detail: marketError}) : loading ? t('loading.marketValues') : '';
  $('#period-caption').textContent = periodName(period);
  const available = market?.observations.filter(o => o.status === 'available' && o.value !== null).length;
  $('#coverage-summary').textContent = catalogError ? t('error.catalogNotCoverageGap') : marketError ? t('error.marketNotCoverageGap') : available === undefined ? t('loading.observations') : t('workspace.coverage', {available, total: catalog?.areas.length ?? 0});
  $('#agent-context').textContent = t('agent.context', {area: areaName(selected), metric: metricName(metric), period: periodName(period)});
  if (!catalog) { $('#area-list').innerHTML = `<p class="empty-message">${tr(catalogError ? 'error.catalogNoData' : 'loading.catalog')}</p>`; return; }
  $('#area-list').innerHTML = catalog.areas.map((area, index) => {
    const observation = market?.observations.find(o => o.area_id === area.id);
    const value = marketError ? t('error.marketApiUnavailable') : loading ? t('status.loading') : formatValue(observation);
    const sub = marketError ? t('error.selectionUnverified') : loading ? t('status.retrievingObservation') : observation?.status === 'available' ? t('status.reportedHistoricalValue') : statusLabel(observation);
    return `<button type="button" class="area-row ${selected === area.id ? 'selected' : ''}" data-area="${escapeHtml(area.id)}" aria-pressed="${selected === area.id}"><span class="area-index">0${index + 1}</span><span class="area-identity"><strong>${escapeHtml(area.name)}</strong><small>${escapeHtml(sub)}</small></span><span class="area-value">${escapeHtml(value)}</span><span class="row-arrow" aria-hidden="true">↗</span></button>`;
  }).join('');
  $('#area-list').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => selectArea(button.dataset.area as AreaId)));
  renderSection();
}
function renderMarket(): void {
  renderMarketPresentation();
  if (catalog) map.update(geometry, marketError || loading ? null : market, catalog.areas, selected);
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
  hovered = area ? {area, x, y} : null;
  if (!area || !catalog) { tooltip.hidden = true; return; }
  const info = catalog.areas.find(a => a.id === area);
  const observation = market?.observations.find(o => o.area_id === area);
  const definition = observation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '';
  tooltip.innerHTML = `<strong>${escapeHtml(info?.name ?? area)}</strong><span>${escapeHtml(metricName(metric))} · ${escapeHtml(periodName(period))}</span><b>${escapeHtml(marketError ? t('error.tooltipUnavailable') : loading ? t('status.loading') : formatValue(observation))}</b><span>${tr('metadata.value')}: ${escapeHtml(observation?.value ?? 'null')} · ${tr('metadata.unit')}: ${escapeHtml(observation?.unit ?? catalog.metrics.find(m => m.id === metric)?.unit ?? '')}</span><small>${description(definition)}</small><em>${tr('map.selectorLimit')}</em>`;
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
  if (!catalog) return;
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
  return `<figure class="snapshot-chart" aria-label="${tr('chart.snapshots')}"><svg viewBox="0 0 320 112" role="img" aria-label="${tr('chart.reportedValues')}">${values.map((o,index) => {
    const y = 16+index*52;
    const available = o?.status === 'available' && o.value !== null;
    return `<text x="0" y="${y}" class="chart-year">${tr('period.yearEnd', {year: 2024+index})}</text><text x="320" y="${y}" text-anchor="end" class="chart-value">${escapeHtml(formatValue(o))}</text><line x1="0" x2="320" y1="${y+17}" y2="${y+17}" class="chart-track"/>${available ? `<rect x="0" y="${y+13}" width="${o.value!/max*320}" height="8" rx="2" class="chart-bar ${index ? 'current' : ''}"/>` : `<text x="0" y="${y+34}" class="chart-missing">${tr('chart.noBar', {status: statusLabel(o)})}</text>`}`;
  }).join('')}</svg><figcaption>${tr('chart.caption', {unit: current?.unit ?? previous?.unit ?? ''})}</figcaption></figure>`;
}
function comparisonBlock(comparison: Comparison | undefined): string {
  if (!comparison) return `<p class="muted">${tr('comparison.unavailable')}</p>`;
  const computed = comparison.change_value === null ? t('status.notCalculated', {status: uiCode('status', comparison.status)}) : `${comparison.change_value > 0 ? '+' : ''}${formatNumber(comparison.change_value)} ${comparison.change_unit}`;
  return `<div class="comparison"><span class="tiny-label">${tr('metadata.snapshotComparison')} · ${description(comparison.previous_period)} → ${description(comparison.current_period)}</span><strong>${escapeHtml(computed)}</strong><span>${tr('metadata.reportedChange')}: ${escapeHtml(comparison.reported_change_pct === null ? t('status.notSupplied') : `${formatNumber(comparison.reported_change_pct)}%`)} · ${escapeHtml(uiCode('status', comparison.status))}</span>${comparison.warnings.length ? `<small class="warning">${escapeHtml(comparison.warnings.map(value => localizeDescription(value, i18n.language)).join(' · '))}</small>` : ''}</div>`;
}
function evidenceBlock(observation: Observation | undefined, data: Market, label: string): string {
  if (!observation || observation.status !== 'available') return '';
  const source = data.sources.find(s => s.id === observation.source_id);
  const excerpt = data.evidence.find(e => e.id === observation.evidence_id);
  return `<details class="evidence-card"><summary><span>${escapeHtml(label)}</span><span>${escapeHtml(source?.publisher || 'Source unavailable')} <i aria-hidden="true">+</i></span></summary><div class="evidence-body"><div class="evidence-head"><span class="tiny-label">${tr('metadata.originalValue')}</span><span>${description(observation.source_area || 'Submarket')}</span></div><strong>${escapeHtml(formatValue(observation))}</strong><p>${description(observation.definition)}</p><p class="metadata">${tr('metadata.unit')}: ${escapeHtml(observation.unit)} · ${tr('metadata.billingPeriod')}: ${description(observation.billing_period || t('status.notStated'))} · ${description(observation.spatial_granularity)} · ${description(observation.data_kind)}</p><p class="metadata">${escapeHtml(source?.publisher || 'Source unavailable')} · ${escapeHtml(source?.title || '')} · ${escapeHtml(source?.published_at || '')} · ${escapeHtml(uiCode('status', source?.verification_status || ''))}</p>${excerpt ? `<blockquote>“${escapeHtml(excerpt.quote)}”<cite>${escapeHtml(excerpt.section)}</cite></blockquote>` : ''}${sourceLink(source)}</div></details>`;
}
function notesBlock(notes: Note[], sources: Source[], evidence: Evidence[]): string {
  if (!notes.length) return `<p class="muted">${tr('notes.noAreaEvents')}</p>`;
  return notes.map(note => {
    const source = sources.find(s => s.id === note.source_id);
    const excerpt = evidence.find(e => e.id === note.evidence_id);
    return `<article class="event-card"><span class="tiny-label">${description(note.kind)} · ${description(note.period)}</span><h4>${description(note.title)}</h4><p>${description(note.summary)}</p>${excerpt ? `<blockquote>“${escapeHtml(excerpt.quote)}”</blockquote>` : ''}<span class="metadata">${escapeHtml(source?.publisher || 'Source unavailable')} · ${escapeHtml(source?.published_at || '')}</span> ${sourceLink(source, t('button.originalReport'))}</article>`;
  }).join('');
}
function renderDetail(): void {
  const target = $('#detail-content');
  const area = catalog?.areas.find(a => a.id === selected);
  if (!catalog) { target.innerHTML = `<p class="empty-message">${tr(catalogError ? 'error.catalogUnavailable' : 'loading.waitingForCatalog')}</p>`; return; }
  if (marketError) { target.innerHTML = `<p class="alert error">${tr('error.notMissingObservation', {detail: marketError})}</p>`; return; }
  if (loading) { target.innerHTML = `<p class="empty-message">${tr('loading.areaValues')}</p>`; return; }
  if (detailLoading || !trend && !detailError) { target.innerHTML = `<h3>${escapeHtml(area?.name || selected)}</h3><p class="empty-message">${tr('loading.detail')}</p>`; return; }
  if (detailError || !trend) { target.innerHTML = `<h3>${escapeHtml(area?.name || selected)}</h3><p class="alert error">${tr('error.detail', {detail: detailError || t('error.catalogUnavailable')})} <button type="button" class="inline-button" id="retry-detail">${tr('button.retry')}</button></p>`; $('#retry-detail').addEventListener('click', () => void loadDetail()); return; }
  const previous = trend.previous.observations.find(o => o.area_id === selected);
  const current = trend.current.observations.find(o => o.area_id === selected);
  const comparison = trend.current.comparisons.find(c => c.area_id === selected);
  const selectedObservation = period === '2024-YE' ? previous : current;
  const notes = [...trend.previous.notes, ...trend.current.notes].filter((note, index, all) => note.area_ids.includes(selected) && all.findIndex(n => n.id === note.id) === index);
  const sources = [...trend.previous.sources, ...trend.current.sources];
  const excerpts = [...trend.previous.evidence, ...trend.current.evidence];
  target.innerHTML = `<div class="detail-title"><h3><i class="selection-marker" aria-hidden="true"></i>${escapeHtml(area?.name || selected)}</h3><span class="detail-pill">${tr(selectedObservation?.status === 'available' ? 'status.verifiedExcerpt' : selectedObservation?.status === 'conflict' ? 'status.conflict' : 'status.coverageGap')}</span></div><h4 class="detail-metric">${escapeHtml(metricName(metric))}</h4><div class="selected-observation"><strong>${escapeHtml(selectedObservation?.status === 'available' ? formatValue(selectedObservation) : statusLabel(selectedObservation))}</strong><span>${escapeHtml(periodName(period))} · ${escapeHtml(selectedObservation?.unit ?? market?.unit ?? '')}</span></div><details class="metric-definition"><summary>${tr('metadata.definitionAndScope')} <span aria-hidden="true">+</span></summary><p class="detail-description">${description(selectedObservation?.definition || catalog.metrics.find(m => m.id === metric)?.definition || '')}</p><p class="detail-description">${description(area?.definition || '')} ${tr('map.selectedScopeLimit')}</p></details>${snapshotChart(previous,current)}${comparisonBlock(comparison)}<div class="subhead"><span class="tiny-label">${tr('metadata.valuesAndEvidence')}</span></div>${evidenceBlock(previous, trend.previous, t('period.yearEnd', {year: 2024}))}${evidenceBlock(current, trend.current, t('period.yearEnd', {year: 2025}))}${previous?.status !== 'available' && current?.status !== 'available' ? `<p class="empty-message">${tr('limit.noVerifiedSnapshots')}</p>` : ''}<details class="report-notes"><summary>${tr('metadata.reportContext')} <span>${tr('metadata.events', {count: notes.length})}</span></summary><p class="metadata">${tr('limit.notLiveNews')}</p>${notesBlock(notes, sources, excerpts)}</details>${[...trend.previous.warnings, ...trend.current.warnings].length ? `<p class="warning">${escapeHtml([...trend.previous.warnings, ...trend.current.warnings].map(value => localizeDescription(value, i18n.language)).join(' · '))}</p>` : ''}`;
}
const areaName = (id: string): string => catalog?.areas.find(a => a.id === id)?.name ?? id;
const metricName = (id: string): string => uiCode('metric', id, catalog?.metrics.find(m => m.id === id)?.label ?? id);
const periodName = (id: string): string => uiCode('period', id, catalog?.periods.find(p => p.id === id)?.label ?? id);
const topicName = (id: SourceTopicId): string => uiCode('nav', id === 'submarkets' ? 'market' : id, id);
const scopeName = (area: string, measure: string): string => `${areaName(area)} · ${metricName(measure)}`;
const contextName = (context: {area_id: AreaId; metric: MetricId; period: PeriodId}): string => `${scopeName(context.area_id, context.metric)} · ${periodName(context.period)}`;

function answerChart(previous: Observation, current: Observation): string {
  if (previous.status !== 'available' || current.status !== 'available' || previous.value === null || current.value === null) return '';
  // Scale bars for display only; all reported values and changes remain Python-owned.
  const max = Math.max(1, previous.value, current.value);
  return `<figure class="snapshot-chart answer-chart" aria-label="${tr('chart.snapshots')}">${[previous,current].map(fact => `<div class="answer-chart-row"><span>${escapeHtml(periodName(fact.period))}</span><div class="answer-chart-track"><i class="chart-bar ${fact.period === '2025-YE' ? 'current' : ''}" style="width:${fact.value!/max*100}%"></i></div></div>`).join('')}<figcaption>${tr('chart.caption', {unit: current.unit})}</figcaption></figure>`;
}

function toolCallBlock(call: ToolCall): string {
  const output = call.output;
  const fields: Record<string, MessageKey> = {observations:'tool.count.observations',comparisons:'tool.count.comparisons',sources:'tool.count.sources',candidates:'tool.count.candidates',evidence:'tool.count.evidence',notes:'tool.count.notes',areas:'tool.count.areas',metrics:'tool.count.metrics',periods:'tool.count.periods'};
  const counts = output ? Object.keys(fields).filter(key => Array.isArray(output[key])).map(key => t(fields[key]!, {count: (output[key] as unknown[]).length})).join(' · ') : t('tool.outputNotIncluded');
  const returned = output?.observations?.map(fact => `<div><span>${escapeHtml(scopeName(fact.area_id, fact.metric))}<small>${escapeHtml(periodName(fact.period))} · ${escapeHtml(uiCode('status', fact.status))}</small></span><strong>${escapeHtml(formatValue(fact))}</strong></div>`).join('') ?? '';
  const changes = output?.comparisons?.map(c => `<div><span>${escapeHtml(scopeName(c.area_id, c.metric))}<small>${escapeHtml(periodName(c.previous_period))} → ${escapeHtml(periodName(c.current_period))}</small></span><strong>${escapeHtml(c.change_value === null ? t('status.notCalculated', {status: uiCode('status', c.status)}) : `${c.change_value > 0 ? '+' : ''}${formatNumber(c.change_value)} ${c.change_unit}`)}</strong></div>`).join('') ?? '';
  return `<details class="tool-call"><summary><span class="tool-status ${call.ok ? 'ok' : 'failed'}">${call.ok ? '✓' : '!'}</span><span class="tool-identity"><code>${escapeHtml(call.name)}</code><small>${escapeHtml(counts || (output?.error ? output.error.message : t('tool.businessJson')))}</small></span><span class="tool-disclosure">${tr(call.ok ? 'status.completed' : 'status.failed')} <i aria-hidden="true">+</i></span></summary><div class="tool-body">${output?.error ? `<p class="alert error">${escapeHtml(output.error.code)} · ${escapeHtml(output.error.message)}</p>` : ''}${returned || changes ? `<div class="tool-returned"><span class="tiny-label">${tr('tool.actualReturn')}</span>${returned}${changes}</div>` : ''}<span class="tiny-label">${tr('tool.arguments')}</span><pre class="tool-arguments">${escapeHtml(JSON.stringify(call.arguments, null, 2))}</pre>${output ? `<details class="raw-tool-details"><summary>${tr('tool.completeOutput')} <span aria-hidden="true">↗</span></summary><pre class="tool-output">${escapeHtml(JSON.stringify(output, null, 2))}</pre></details>` : `<p class="muted">${tr('tool.outputUnavailable')}</p>`}</div></details>`;
}

function renderAgent(result: ChatResult, question: string, submittedContext: {area_id: AreaId; metric: MetricId; period: PeriodId}): void {
  const groups = new globalThis.Map<string, {area: AreaId; measure: MetricId; facts: Observation[]; comparisons: Comparison[]}>();
  for (const item of [...result.facts, ...result.calculations]) {
    const key = `${item.area_id}/${item.metric}`;
    if (!groups.has(key)) groups.set(key, {area: item.area_id, measure: item.metric, facts: [], comparisons: []});
  }
  for (const fact of result.facts) groups.get(`${fact.area_id}/${fact.metric}`)!.facts.push(fact);
  for (const comparison of result.calculations) groups.get(`${comparison.area_id}/${comparison.metric}`)!.comparisons.push(comparison);
  const researchRecords = result.research?.records ?? [];
  const researchComparisons = result.research?.comparisons ?? [];
  const scope = [...groups.values()].map(group => scopeName(group.area, group.measure)).join(' / ') || (researchRecords.length || researchComparisons.length ? t('research.scopeHeading') : t('agent.noScope'));
  const data = [...groups.values()].map(group => {
    const facts = [...group.facts].sort((a,b) => a.period.localeCompare(b.period));
    const previous = facts.find(f => f.period === '2024-YE'), current = facts.find(f => f.period === '2025-YE');
    const comparable = group.comparisons.some(c => c.status === 'available' && c.previous_period === previous?.period && c.current_period === current?.period);
    const targetPeriod = facts.at(-1)?.period ?? group.comparisons[0]?.current_period;
    const valueCards = facts.map(fact => `<article class="answer-fact ${fact.status}" data-fact-id="${escapeHtml(fact.id)}"><span>${escapeHtml(periodName(fact.period))}</span><strong>${escapeHtml(formatValue(fact))}</strong><small>${escapeHtml(fact.status === 'available' ? t('map.legend.reported') : statusLabel(fact))} · ${escapeHtml(fact.unit)}</small></article>`).join('');
    return `<section class="answer-market"><div class="answer-market-head"><h3>${escapeHtml(scopeName(group.area, group.measure))}</h3>${targetPeriod ? `<button type="button" class="view-answer-market" data-area="${escapeHtml(group.area)}" data-metric="${escapeHtml(group.measure)}" data-period="${escapeHtml(targetPeriod)}" aria-label="${tr('button.viewAreaOnMap', {area: areaName(group.area)})}">${tr('button.viewOnMap')}</button>` : ''}</div><div class="answer-facts">${valueCards}</div>${comparable && previous && current ? answerChart(previous,current) : ''}${group.comparisons.map(c => comparisonBlock(c)).join('')}<p class="answer-definition">${description(facts[0]?.definition ?? catalog?.metrics.find(m => m.id === group.measure)?.definition ?? '')}</p>${facts.some(f => f.status !== 'available') ? `<p class="answer-missing">${tr('limit.noEstimate')}</p>` : ''}</section>`;
  }).join('');
  const researchAnswer = researchRecords.length || researchComparisons.length ? `<section class="answer-research"><h3>${tr('research.scopeHeading')}</h3><p class="section-limit">${tr('research.answerScopeLimit')}</p>${researchRecords.map(item => researchRecordCard(item, result.sources, result.evidence)).join('')}${researchComparisons.map(item => researchComparisonCard(item, result.sources, result.evidence)).join('')}</section>` : '';
  const selectedEvidenceIds = new Set([...result.facts.map(f => f.evidence_id), ...result.calculations.flatMap(c => c.evidence_ids), ...researchRecords.flatMap(r => r.evidence_ids), ...researchComparisons.flatMap(c => c.evidence_ids)]);
  const sourceCards = result.sources.map(source => {
    const quotes = result.evidence.filter(e => e.source_id === source.id && selectedEvidenceIds.has(e.id));
    return `<article class="answer-source"><div><strong>${escapeHtml(source.publisher)}</strong><span>${escapeHtml(source.report_period)}</span></div><p>${sourceLink(source, `${source.title} ↗`)}</p><small>${tr('metadata.published')} ${escapeHtml(sourceDate(source.published_at))} · ${escapeHtml(uiCode('status', source.verification_status))}</small>${quotes.map(quote => `<blockquote>“${escapeHtml(quote.quote)}”</blockquote>`).join('')}</article>`;
  }).join('');
  const boilerplate = 'Historical report snapshots, not a live market feed. Interpretation is AI-generated; verified numeric facts and calculations are shown separately.';
  const warnings = result.warnings.filter(w => w !== boilerplate);
  $('.agent-shell').classList.add('has-answer');
  $('#agent-result').innerHTML = `<article class="answer"><div class="answer-head"><span class="tiny-label">${tr('agent.answerScope')}</span><span class="answer-complete">${tr('status.evidenceReturned')}</span></div><h2 id="answer-scope">${escapeHtml(scope)}</h2><p id="answer-question">${escapeHtml(question)}</p><p class="submitted-context">${tr('agent.submittedContext', {context: contextName(submittedContext)})}</p><div class="answer-data">${data}${researchAnswer}</div><section class="answer-assessment"><span class="tiny-label">${tr('agent.interpretation')}</span><p class="answer-text">${description(result.answer)}</p></section>${warnings.length ? `<p class="warning">${escapeHtml(warnings.map(value => localizeDescription(value, i18n.language)).join(' · '))}</p>` : ''}<section class="tool-activity"><h3>${tr('agent.toolsUsed')} <span>${tr('agent.actualCalls', {count: result.tool_calls.length})}</span></h3>${result.tool_calls.map(call => toolCallBlock(call)).join('')}</section>${sourceCards ? `<section class="answer-sources"><h3>${tr('agent.sources')}</h3>${sourceCards}</section>` : `<p class="answer-missing">${tr('agent.noSourceValue')}</p>`}${result.notes.length ? `<details class="answer-notes"><summary>${tr('agent.reportEvents', {count: result.notes.length})}</summary>${notesBlock(result.notes, result.sources, result.evidence)}</details>` : ''}<footer class="answer-foot">${tr('agent.footer')}<details class="run-details"><summary>${tr('agent.runDetails')}</summary><span>${tr('agent.run', {id: result.run_id})}</span></details></footer></article>`;
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
function sourceCandidateBlock(source: SourceCandidate): string {
  const href = safeUrl(source.url);
  const title = source.title || source.url;
  return `<article class="answer-source source-candidate" data-candidate-id="${escapeHtml(source.id)}"><p>${href ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapeHtml(title)} ↗</a>` : escapeHtml(title)}</p><small>${tr('discovery.metadataLimit')}</small>${source.snippet ? `<p>${escapeHtml(source.snippet)}</p>` : ''}<small>${tr('discovery.dateHint')}: ${escapeHtml(source.date_hint || t('status.notReturned'))}</small><details><summary>${tr('discovery.provenance')}</summary><p>${escapeHtml(source.url)}</p><pre class="tool-output">${escapeHtml(JSON.stringify(source.occurrences, null, 2))}</pre></details></article>`;
}
function sourcePoolBlock(pool: SourcePool): string {
  return `<p class="source-pool-summary">${tr('discovery.poolSummary', {sources: pool.source_count, occurrences: pool.occurrence_count})}</p><p class="warning">${tr('discovery.poolLimit')}</p><div class="source-topics">${pool.topics.map(topic => `<div class="source-topic"><strong>${escapeHtml(topicName(topic.id))}</strong><small>${escapeHtml(uiCode('status', topic.status))} · ${tr('discovery.topicCount', {count: topic.source_count})}</small></div>`).join('')}</div><details class="complete-source-pool"><summary>${tr('discovery.completePool')}</summary>${pool.candidates.map(sourceCandidateBlock).join('') || `<p class="muted">${tr('discovery.noCandidates')}</p>`}</details>`;
}
function renderDiscovery(result: DiscoveryResult, question: string, area: AreaId): void {
  $('.agent-shell').classList.add('has-answer');
  $('#agent-result').innerHTML = `<article class="answer"><div class="answer-head"><span class="tiny-label">${tr('discovery.title')}</span><span>${escapeHtml(uiCode('status', result.status))}</span></div><h2>${tr('discovery.screening')}</h2><p id="answer-question">${escapeHtml(question)}</p><p class="submitted-context">${tr('discovery.context', {area: areaName(area)})}</p><section class="answer-assessment"><p class="answer-text">${description(result.assessment)}</p></section><p class="metadata">Google: ${escapeHtml(uiCode('status', result.provider_states.serpapi_google.status))} · ${tr('discovery.nativeSearch')}: ${escapeHtml(uiCode('status', result.provider_states.codex_native.status))} · ${tr('discovery.internalHttp')}: ${tr('status.unknown')}</p><section class="answer-sources"><h3>${tr('discovery.selectedLeads')}</h3>${result.pool.candidates.filter(source => result.selected_candidate_ids.includes(source.id)).map(sourceCandidateBlock).join('') || `<p class="muted">${tr('discovery.noSelectedCandidates')}</p>`}</section>${sourcePoolBlock(result.pool)}<section class="tool-activity"><h3>${tr('discovery.googleExecution')}</h3>${result.tool_calls.map(toolCallBlock).join('')}</section><p class="warning">${escapeHtml(result.warnings.join(' · '))}</p><footer class="answer-foot">${tr('discovery.notPublished')} ${tr('agent.run', {id: result.run_id})}</footer></article>`;
}
$('#view-source-pool').addEventListener('click', async () => {
  if (chatBusy) return;
  chatBusy = true;
  setAgentExpanded(true);
  presentAgent(() => { $('#agent-result').innerHTML = `<p class="muted">${tr('loading.sourcePool')}</p>`; });
  try {
    const pool = await api<SourcePool>('/api/discovery');
    $('.agent-shell').classList.add('has-answer');
    presentAgent(() => { $('#agent-result').innerHTML = `<article class="answer"><h2>${tr('discovery.archivedCandidates')}</h2>${sourcePoolBlock(pool)}<p class="metadata">${tr('discovery.readOnly')}</p></article>`; });
  } catch (error) { const detail = message(error); presentAgent(() => { $('#agent-result').innerHTML = `<p class="alert error">${escapeHtml(detail)}</p>`; }); }
  finally { chatBusy = false; }
});
$('#view-research-intake').addEventListener('click', () => {
  setAgentExpanded(true);
  $('#research-intake').hidden = !$('#research-intake').hidden;
  renderAgentMode();
  if (!$('#research-intake').hidden) void intakeControls.refresh();
});
$('#agent-mode').addEventListener('change', () => {
  $('#research-intake').hidden = true;
  renderAgentMode();
  if (($('#agent-mode') as HTMLSelectElement).value === 'discovery') void authorizationControls.refresh();
});
async function submitQuestion(authorizationId?: string): Promise<void> {
  if (chatBusy) return;
  const input = $('#question') as HTMLInputElement;
  const question = input.value.trim();
  if (!question) return;
  const submittedContext = {area_id: selected, metric, period};
  const discoveryMode = ($('#agent-mode') as HTMLSelectElement).value === 'discovery';
  setAgentExpanded(true);
  if (discoveryMode && !authorizationId) {
    if (!authorizationControls.canSearch()) {
      $('#research-intake').hidden = true;
      renderAgentMode();
      presentAgent(() => { $('#agent-result').innerHTML = `<p class="alert error" role="alert">${tr('authorization.notActive')}</p>`; });
      return; // Arrow/Enter never approves or renews an allowance.
    }
    authorizationId = authorizationControls.currentId() ?? undefined;
  }
  $('.agent-shell').classList.remove('has-answer');
  chatBusy = true;
  $('.agent-shell').classList.add('is-running');
  $('#chat-form').setAttribute('aria-busy', 'true');
  const button = $('#chat-form').querySelector<HTMLButtonElement>('button[type=submit]');
  if (button) button.disabled = true;
  presentAgent(() => { $('#agent-result').innerHTML = `<p class="alert loading" role="status">${tr('loading.assistant')}</p>`; });
  try {
    if (discoveryMode) {
      const response = await api<DiscoveryResult>('/api/discovery', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-Office-User-Action': 'confirm'}, body: JSON.stringify({question, ...(catalog?.discovery_topics ? {topic_ids: catalog.discovery_topics.map(topic => topic.id)} : {}), context: {area_id: submittedContext.area_id}, authorization_id: authorizationId})});
      presentAgent(() => renderDiscovery(response, question, submittedContext.area_id));
    } else {
      const response = await api<ChatResult>('/api/chat', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({question, ...(sessionId ? {session_id: sessionId} : {}), context: submittedContext})});
      if (response.status !== 'completed') throw new Error(t('error.assistantIncomplete'));
      sessionId = response.session_id;
      presentAgent(() => renderAgent(response, question, submittedContext));
    }
  } catch (error) {
    const detail = message(error);
    if (detail.startsWith('research_changed:')) sessionId = undefined;
    const login = /login|not.logged|not_authenticated|authentication|unauthorized|subscription.auth/i.test(detail);
    presentAgent(() => { $('#agent-result').innerHTML = `<p class="alert error" role="alert">${escapeHtml(uiCode('error', detail.split(':', 1)[0] ?? detail, detail))}${login ? `<br>${tr('error.loginHint', {command: 'uv run london-office login'})}` : ''}</p>`; });
  } finally {
    chatBusy = false; $('.agent-shell').classList.remove('is-running'); $('#chat-form').setAttribute('aria-busy', 'false'); if (button) button.disabled = false;
    if (discoveryMode) await authorizationControls.refresh(); // Read counters only; never a retry or renewal.
  }
}
$('#chat-form').addEventListener('submit', event => { event.preventDefault(); void submitQuestion(); });
$('.suggestions').querySelectorAll<HTMLButtonElement>('button').forEach(button => button.addEventListener('click', () => {
  const input = $('#question') as HTMLInputElement;
  input.value = button.dataset.question ?? '';
  input.focus();
}));

function setAgentExpanded(expanded: boolean): void {
  $('#agent-expansion').hidden = !expanded;
  $('.agent-shell').classList.toggle('expanded', expanded);
  $('#open-agent').setAttribute('aria-expanded', String(expanded));
  $('#open-agent').title = t(expanded ? 'button.closeAssistant' : 'button.openAssistant');
  if (!expanded && $('.agent-shell').contains(document.activeElement)) $('#open-agent').focus();
}
function renderCameraState(state: CameraState | undefined = cameraState): void {
  if (!state) return;
  cameraState = state;
  renderCameraCaption();
  $('#compass-arrow').style.transform = `rotate(${-state.bearing}deg)`;
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
    return `<button type="button" class="edge-direction ${left ? 'edge-left' : right ? 'edge-right' : 'edge-center'}" data-focus="${area.id}" style="left:${x}px;top:${y}px" aria-label="${tr('button.focusArea', {area: area.name})}">${escapeHtml(area.name)} <span aria-hidden="true">${arrow}</span></button>`;
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
mountLanguageSelector($('#language-settings'), i18n);
i18n.subscribe(renderLocalizedPresentation);
renderChrome();
renderMarket(); renderDetail();
// Start local I/O before synchronous WebGL setup. Neither response handling nor
// the workspace's event bindings wait for external styles, glyphs or tiles.
void api<Catalog>('/api/catalog').then(result => {
  catalog = result;
  renderFilters();
  void refresh();
}).catch(error => {
  catalogError = message(error);
  loading = false;
  renderMarket(); renderDetail(); renderSection();
});
map.start();
