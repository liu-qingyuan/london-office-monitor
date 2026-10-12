import type {Research, ResearchRecord, SourceTopicId} from './types';

const esc = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]!));
const https = (value: string): string | null => {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : null; }
  catch { return null; }
};

// This presentation accepts only facts explicitly admitted in the latest verified set.
// The original research cards remain the complete excerpt/provenance surface.
export function renderResearchCharts(topic: SourceTopicId, research: Research): string {
  const latest = new Set(research.latest_update?.record_ids ?? []);
  if (!latest.size || research.is_live !== false || research.data_kind !== 'historical_research') return '';
  const valid = (record: ResearchRecord): boolean => record.topic_ids.includes(topic) && latest.has(record.id)
    && record.status === 'available' && record.value !== null && Number.isFinite(record.value)
    && record.source_ids.length > 0 && record.evidence_ids.length > 0
    && record.source_ids.every(id => research.sources.some(source => source.id === id && https(source.url)))
    && record.evidence_ids.every(id => research.evidence.some(evidence => evidence.id === id && evidence.quote.trim() && record.source_ids.includes(evidence.source_id)));
  const find = (metric: string, geography: string): ResearchRecord | undefined => {
    const matches = research.records.filter(record => valid(record) && record.metric === metric && record.source_geography === geography);
    return matches.length === 1 ? matches[0] : undefined;
  };
  const sources = (record: ResearchRecord): string => `<div class="chart-source">${record.source_ids.map(id => {
    const source = research.sources.find(item => item.id === id)!;
    return `<span data-chart-source-id="${esc(source.id)}"><a href="${esc(https(source.url))}" target="_blank" rel="noopener noreferrer">${esc(source.publisher)}</a> · ${esc(source.published_at ?? 'Date unknown')}</span>`;
  }).join('')}<details><summary>Chart references</summary><small>Record ${esc(record.id)} · Evidence ${record.evidence_ids.map(esc).join(', ')}</small></details></div>`;
  const head = (title: string, period: string): string => `<header class="chart-head"><span class="chart-eyebrow">LATEST VERIFIED RESEARCH · NOT LIVE</span><h4 class="chart-title">${esc(title)}</h4><span class="chart-period">${esc(period)}</span></header>`;
  const bar = (metric: string, title: string, kind: string, unit: string): string => {
    const city = find(metric, 'Savills City');
    const west = find(metric, 'Savills West End');
    if (!city || !west || city.unit !== unit || west.unit !== unit || city.unit !== west.unit
      || city.statistical_window !== west.statistical_window || city.release_vintage !== west.release_vintage
      || !city.release_vintage || city.value! <= 0 || west.value! <= 0
      || !city.source_ids.some(id => west.source_ids.includes(id))) return '';
    const scale = Math.max(city.value!, west.value!);
    return `<figure class="chart-card" data-research-chart="${kind}">${head(title, `${city.statistical_window} · ${unit} · Edition ${city.release_vintage}`)}${[city,west].map(record => `<div class="chart-bar-row" data-chart-record-id="${esc(record.id)}"><div class="chart-bar-label"><strong>${esc(record.source_geography)}</strong><span>${esc(record.label)}</span></div><strong class="chart-bar-value">${esc(record.display_value)}</strong><div class="chart-track" role="img" aria-label="${esc(`${record.label}: ${record.display_value}; ${record.statistical_window}; ${record.source_geography}`)}"><span class="chart-fill" style="width:${record.value! / scale * 100}%"></span></div>${sources(record)}</div>`).join('')}<figcaption class="chart-note">${esc(title)} · ${esc(city.statistical_window)} · ${esc(unit)}. Bar lengths use reported values only; source excerpts remain in the records below.</figcaption></figure>`;
  };
  const ring = (metric: string, geography: string, title: string, kind: string): string => {
    const record = find(metric, geography);
    const denominatorArea = geography === 'Savills City' ? 'City' : 'Central London';
    if (!record || record.unit !== '%' || record.value! < 0 || record.value! > 100
      || record.denominator !== `${denominatorArea} take-up in ${record.statistical_window}` || !record.release_vintage) return '';
    // Geometry only: the remaining stroke is an unlabeled backdrop, not another reported percentage.
    const circumference = 2 * Math.PI * 42;
    const stroke = record.value! / 100 * circumference;
    const label = `${record.label}: ${record.display_value}; denominator ${record.denominator}; ${record.source_geography}; ${record.statistical_window}`;
    return `<figure class="chart-card" data-research-chart="${kind}">${head(title, `${record.statistical_window} · Edition ${record.release_vintage}`)}<div class="chart-ring-grid" data-chart-record-id="${esc(record.id)}"><svg class="chart-ring" viewBox="0 0 120 120" role="img" aria-label="${esc(label)}"><title>${esc(label)}</title><circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="13" class="chart-track"/><circle cx="60" cy="60" r="42" fill="none" stroke="currentColor" stroke-width="13" stroke-linecap="round" class="chart-fill" stroke-dasharray="${stroke} ${circumference}" transform="rotate(-90 60 60)"/></svg><div><strong class="chart-ring-value">${esc(record.display_value)}</strong><p class="chart-bar-label">${esc(record.label)}</p><p class="chart-note">${esc(record.source_geography)} · Denominator: ${esc(record.denominator)}</p></div></div><figcaption class="chart-note">${esc(record.statistical_window)} · ${esc(record.unit)} · ${esc(record.source_geography)}. Unfilled track is not a published value.</figcaption>${sources(record)}</figure>`;
  };
  const macro = (): string => {
    const metrics = ['bank_rate','three_month_on_three_month_real_gdp_output_growth','lfs_employment_rate','lfs_unemployment_rate'];
    const facts = metrics.map(metric => find(metric, 'United Kingdom — country context only')).filter((record): record is ResearchRecord => !!record && !!record.release_vintage);
    if (!facts.length) return '';
    return `<figure class="chart-card" data-research-chart="macro-kpis">${head('UK macro context · separate indicators', 'Each reported window shown separately')}<div class="chart-kpi-grid">${facts.map(record => `<div class="chart-kpi" data-chart-record-id="${esc(record.id)}"><span class="chart-bar-label">${esc(record.label)}</span><strong class="chart-ring-value">${esc(record.display_value)}</strong><p class="chart-period">${esc(record.source_geography)} · ${esc(record.statistical_window)} · ${esc(record.release_vintage)}</p>${sources(record)}</div>`).join('')}</div><figcaption class="chart-note">Independent reported indicators; no shared axis, trend or London market attribution.</figcaption></figure>`;
  };
  if (topic === 'rents') return bar('grade_a_rent', 'Average Grade A rent · City / West End', 'rent-bars', 'GBP/sq ft');
  if (topic === 'leasing') return bar('monthly_take_up', 'Monthly take-up · City / West End', 'take-up-bars', 'sq ft')
    + ring('grade_a_take_up_share', 'Savills City', 'City Grade A take-up share', 'city-grade-a-ring')
    + ring('professional_services_take_up_share', 'Savills Central London', 'Professional services take-up share', 'professional-services-ring');
  if (topic === 'submarkets') return bar('grade_a_rent', 'Average Grade A rent · City / West End', 'rent-bars', 'GBP/sq ft')
    + bar('monthly_take_up', 'Monthly take-up · City / West End', 'take-up-bars', 'sq ft')
    + ring('grade_a_take_up_share', 'Savills City', 'City Grade A take-up share', 'city-grade-a-ring');
  if (topic === 'demand') return ring('professional_services_take_up_share', 'Savills Central London', 'Professional services take-up share', 'professional-services-ring');
  if (topic === 'macro') return macro();
  return '';
}
