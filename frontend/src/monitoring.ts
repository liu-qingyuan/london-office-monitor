import './monitoring.css';

type MonitoringLink = {
  url: string; title: string; edition: string | null; published_at: string | null;
  observation_period: string | null; is_new: boolean;
};
type MonitoringSource = {
  id: string; label: string; status: string; checked_at: string | null;
  index_url: string; new_link_count: number; links: MonitoringLink[];
};
type MonitoringStatus = {
  schema_version: number; data_kind: string; status: string; last_checked_at: string | null;
  schedule: {state: string; interval_seconds: number | null; max_runs: number | null;
    run_starts: number | null; remaining_runs: number | null; expires_at: string | null};
  filter: {mode: string; ai_used: boolean; omitted_links: number};
  sources: MonitoringSource[]; formal_market_updated: boolean; warnings: string[];
};

const hosts: Record<string, string> = {
  'savills-central-london': 'www.savills.co.uk',
  'crown-estate-news': 'www.thecrownestate.co.uk'
};
const states = new Set(['running', 'stopped', 'exhausted', 'expired', 'unsupported', 'not_configured', 'unknown']);
const sourceStatuses: Record<string, string> = {
  baseline_captured: 'Baseline captured', new_publication_links: 'New publication links',
  no_new_publication_links: 'No new publication links at last successful check',
  check_failed: 'Check failed — previous links may be retained',
  check_incomplete: 'Check incomplete — no conclusion about new links',
  not_checked: 'Not checked', parse_unconfirmed: 'Index parsing unconfirmed'
};
const known = (value: unknown): string => typeof value === 'string' && value.trim() ? value : 'unknown';
const editionOrder = (edition: string | null): number => {
  const match = /^(\d{4})-(?:(\d{2})|Q([1-4]))$/.exec(edition ?? '');
  return match ? Number(match[1]) * 12 + (match[2] ? Number(match[2]) : Number(match[3]) * 3) : -1;
};
const count = (value: unknown): string => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? String(value) : 'unknown';
const safeOfficialUrl = (value: unknown, sourceId: string): string | null => {
  if (typeof value !== 'string' || !hosts[sourceId]) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== hosts[sourceId] || url.port || url.username || url.password) return null;
    return url.href;
  } catch { return null; }
};
const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};
const line = (label: string, value: unknown): HTMLParagraphElement => node('p', 'monitoring-detail', `${label}: ${known(value)}`);
const link = (value: unknown, sourceId: string, title: string): HTMLElement => {
  const href = safeOfficialUrl(value, sourceId);
  if (!href) return node('span', 'monitoring-invalid-link', title);
  const anchor = node('a', undefined, title);
  anchor.href = href;
  anchor.target = '_blank';
  anchor.rel = 'noopener noreferrer';
  return anchor;
};

let cached: MonitoringStatus | null = null;
let failure: string | null = null;
let pending: Promise<void> | null = null;
let currentContainer: HTMLElement | null = null;

function render(container: HTMLElement): void {
  container.replaceChildren();
  const panel = node('section', 'monitoring-panel');
  panel.dataset.monitoringStatus = pending ? 'loading' : failure ? 'unavailable' : cached?.status ?? 'unavailable';
  panel.setAttribute('aria-label', 'Official source monitoring status');
  const heading = node('div', 'monitoring-heading');
  heading.append(node('h3', undefined, 'Official source monitoring'));
  const refresh = node('button', 'monitoring-refresh', 'Refresh status');
  refresh.type = 'button';
  refresh.disabled = pending !== null;
  refresh.addEventListener('click', () => { void load(true); });
  heading.append(refresh);
  panel.append(heading);
  if (pending) panel.append(node('p', 'monitoring-detail', 'Loading monitoring status…'));
  else if (failure) panel.append(node('p', 'monitoring-error', failure));
  else if (!cached) panel.append(node('p', 'monitoring-detail', 'Monitoring status unavailable.'));
  else {
    const result = cached;
    const status = ['available','not_configured','unavailable'].includes(result.status) ? result.status : 'unknown';
    const state = status === 'available' && states.has(result.schedule?.state) ? result.schedule.state : status;
    const overview = node('article', 'monitoring-card');
    overview.append(line('Status', status), line('Schedule', state), line('Last check', result.last_checked_at));
    const schedule = result.schedule;
    if (schedule) {
      overview.append(node('p', 'monitoring-detail', `Run starts: ${count(schedule.run_starts)} / ${count(schedule.max_runs)}`));
      overview.append(node('p', 'monitoring-detail', `Remaining runs: ${count(schedule.remaining_runs)}`));
      overview.append(node('p', 'monitoring-detail', `Interval (seconds): ${count(schedule.interval_seconds)}`));
      overview.append(line('Expires', schedule.expires_at));
    }
    if (result.filter) {
      overview.append(node('p', 'monitoring-detail', `Display filter: ${known(result.filter.mode)} · AI: ${result.filter.ai_used === false ? 'not used' : 'status unknown'} · Omitted links: ${count(result.filter.omitted_links)}`));
    }
    overview.append(node('p', 'monitoring-caution', 'Official links are detection leads, not verified market observations. Market values have not been automatically updated. The 2024/2025 map remains historical.'));
    if (status === 'not_configured') overview.append(node('p', 'monitoring-caution', 'Monitoring is not configured; no current check is implied.'));
    if (status === 'unavailable') overview.append(node('p', 'monitoring-error', 'Monitoring status unavailable; no conclusion about new publications.'));
    panel.append(overview);
    if (Array.isArray(result.sources)) for (const source of result.sources) {
      if (!source || !hosts[source.id]) continue;
      const card = node('article', 'monitoring-card monitoring-source');
      card.dataset.monitoringSource = source.id;
      card.dataset.monitoringCheckStatus = source.status;
      card.append(node('h4', undefined, known(source.label)));
      card.append(line('Source status', sourceStatuses[source.status] ?? 'Unknown check status'));
      card.append(line('Checked', source.checked_at));
      const index = node('p', 'monitoring-detail');
      index.append('Official index: ', link(source.index_url, source.id, 'Open index ↗'));
      card.append(index);
      card.append(node('p', 'monitoring-detail', `New link count: ${count(source.new_link_count)}`));
      if (Array.isArray(source.links) && source.links.length) {
        const list = node('ul', 'monitoring-links');
        // Prefer detected additions, then labelled editions; neither implies a publication date.
        const ordered = [...source.links].sort((a, b) => Number(b.is_new) - Number(a.is_new) || editionOrder(b.edition) - editionOrder(a.edition));
        for (const item of ordered) {
          if (!item) continue;
          const row = node('li');
          row.append(link(item.url, source.id, known(item.title)));
          if (item.is_new === true && safeOfficialUrl(item.url, source.id)) row.append(node('span', 'monitoring-new', 'New'));
          row.append(line('Edition', item.edition), line('Published', item.published_at), line('Observation period', item.observation_period));
          list.append(row);
        }
        card.append(list);
      } else card.append(node('p', 'monitoring-detail', 'No selected public links in the retained archive; this is not a claim of no news.'));
      panel.append(card);
    }
    if (Array.isArray(result.warnings)) for (const warning of result.warnings) panel.append(node('p', 'monitoring-caution', String(warning)));
  }
  container.append(panel);
}

async function load(force = false): Promise<void> {
  if (pending) return;
  if (!force && (cached || failure)) return;
  cached = null;
  failure = null;
  const request = (async () => {
    try {
      const response = await fetch('/api/monitoring', {method: 'GET'});
      if (!response.ok) throw new Error(`Monitoring request failed (HTTP ${response.status}).`);
      const data: unknown = await response.json();
      if (!data || typeof data !== 'object' || (data as MonitoringStatus).schema_version !== 1 ||
          (data as MonitoringStatus).data_kind !== 'monitoring_status' ||
          !Array.isArray((data as MonitoringStatus).sources)) throw new Error('Monitoring response unavailable or unsupported.');
      cached = data as MonitoringStatus;
    } catch (error) {
      failure = error instanceof Error && error.message.startsWith('Monitoring ') ? error.message : 'Monitoring unavailable; request could not be completed.';
    } finally {
      pending = null;
      if (currentContainer) render(currentContainer);
    }
  })();
  pending = request;
  if (currentContainer) render(currentContainer);
  await request;
}

/** Prepend to the News board after its historical content is rendered; no timer or watch action. */
export function mountMonitoring(container: HTMLElement): void {
  let slot = [...container.children].find(child => child.hasAttribute('data-monitoring-root')) as HTMLElement | undefined;
  if (!slot) {
    slot = node('div');
    slot.dataset.monitoringRoot = '';
    container.prepend(slot);
  }
  currentContainer = slot;
  render(slot);
  if (!cached && !failure && !pending) void load();
}
