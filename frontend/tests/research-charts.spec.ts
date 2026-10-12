import {test, expect} from '@playwright/test';
import {renderResearchCharts} from '../src/research-charts';
import {openSection} from './navigation';
import type {Market, Research, ResearchRecord, SourceTopicId} from '../src/types';

const marketUrl = '/api/market?metric=prime_rent&period=2025-YE';
const newest = (research: Research, metric: string, geography: RegExp): ResearchRecord => {
  const ids = new Set(research.latest_update?.record_ids ?? []);
  const records = research.records.filter(item => ids.has(item.id) && item.metric === metric && geography.test(item.source_geography));
  expect(records).toHaveLength(1);
  return records[0]!;
};

// Pure public seam: cloned synthetic bad observations never enter the actual snapshot.
test('renderer rejects an unknown denominator, broken evidence and mixed monthly windows', async ({request}) => {
  const response = await request.get(marketUrl);
  expect(response.ok()).toBe(true);
  const original = (await response.json() as Market).research!;
  expect(original.latest_update?.record_ids).toHaveLength(12);
  const research = structuredClone(original);
  const city = newest(research, 'grade_a_rent', /^Savills City$/);
  const west = newest(research, 'grade_a_rent', /^Savills West End$/);
  west.statistical_window = 'July 2026';
  expect(renderResearchCharts('rents', research)).not.toContain('data-research-chart="rent-bars"');
  west.statistical_window = city.statistical_window;
  west.evidence_ids = ['unmatched-evidence'];
  expect(renderResearchCharts('rents', research)).not.toContain('data-research-chart="rent-bars"');
  const share = newest(research, 'grade_a_take_up_share', /^Savills City$/);
  for (const denominator of [null, 'unknown', 'not stated', 'City employment, not take-up']) {
    share.denominator = denominator;
    expect(renderResearchCharts('leasing', research)).not.toContain('data-research-chart="city-grade-a-ring"');
  }
  const professional = newest(research, 'professional_services_take_up_share', /^Savills Central London$/);
  professional.value = 101;
  expect(renderResearchCharts('demand', research)).not.toContain('data-research-chart="professional-services-ring"');
  expect(renderResearchCharts('news', research)).toBe('');
});

test('verified charts use real Market HTTP, preserve cards and never issue passive POST', async ({page, request}) => {
  const response = await request.get(marketUrl);
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  const research = market.research!;
  expect(research.records).toHaveLength(132);
  expect(research.is_live).toBe(false);
  const checks: readonly [string, SourceTopicId, string, ResearchRecord[]][] = [
    ['Rents', 'rents', 'rent-bars', [newest(research, 'grade_a_rent', /^Savills City$/), newest(research, 'grade_a_rent', /^Savills West End$/)]],
    ['Leasing activity', 'leasing', 'take-up-bars', [newest(research, 'monthly_take_up', /^Savills City$/), newest(research, 'monthly_take_up', /^Savills West End$/)]],
    ['Demand drivers', 'demand', 'professional-services-ring', [newest(research, 'professional_services_take_up_share', /^Savills Central London$/)]],
    ['Macro economy', 'macro', 'macro-kpis', ['bank_rate', 'three_month_on_three_month_real_gdp_output_growth', 'lfs_employment_rate', 'lfs_unemployment_rate'].map(metric => newest(research, metric, /United Kingdom/))]
  ];
  const passivePosts: string[] = [];
  page.on('request', call => { if (call.method() === 'POST' && /\/api\/(chat|discovery)(?:\?|$)/.test(call.url())) passivePosts.push(call.url()); });
  await page.goto('/');
  for (const [label, topic, kind, records] of checks) {
    await openSection(page, label);
    const group = page.locator(`[data-latest-research-topic="${topic}"]`);
    const figure = group.locator(`[data-research-chart="${kind}"]`);
    await expect(figure).toBeVisible();
    await expect(group.locator('[data-research-id]')).toHaveCount(research.records.filter(item => item.topic_ids.includes(topic) && research.latest_update!.record_ids.includes(item.id)).length);
    for (const record of records) {
      await expect(figure.locator(`[data-chart-record-id="${record.id}"]`)).toBeVisible();
      await expect(figure).toContainText(record.display_value);
      await expect(figure).toContainText(record.source_geography);
      await expect(figure).toContainText(record.statistical_window);
      await expect(figure).toContainText(record.release_vintage!);
      const source = research.sources.find(item => item.id === record.source_ids[0])!;
      await expect(figure.locator(`[data-chart-source-id="${source.id}"]`).getByRole('link', {name: source.publisher, exact: true}).first()).toHaveAttribute('href', source.url);
    }
    await expect(group).not.toContainText('2026-YE');
  }
  await openSection(page, 'Leasing activity');
  const group = page.locator('[data-latest-research-topic="leasing"]');
  await expect(group.locator('[data-research-chart="city-grade-a-ring"]')).toContainText(newest(research, 'grade_a_take_up_share', /^Savills City$/).display_value);
  await expect(group.locator('[data-research-chart="take-up-bars"]')).not.toContainText(newest(research, 'year_to_date_take_up', /Central London/).display_value);
  await expect(group.locator('[data-research-chart="take-up-bars"]')).not.toContainText(newest(research, 'monthly_take_up', /Central London/).display_value);
  expect(passivePosts).toEqual([]);
});
