import {test, expect} from '@playwright/test';
import {openSection} from './navigation';
import type {Market, ResearchRecord, SourceTopicId} from '../src/types';

const topics: [string, SourceTopicId][] = [
  ['Submarkets', 'submarkets'], ['Rents', 'rents'], ['Vacancy & availability', 'vacancy'],
  ['Leasing activity', 'leasing'], ['Supply pipeline', 'supply'], ['Macro economy', 'macro'],
  ['Demand drivers', 'demand'], ['News & events', 'news']
];
const marketUrl = '/api/market?metric=prime_rent&period=2025-YE';
const recordsFor = (market: Market, topic: SourceTopicId): ResearchRecord[] =>
  market.research!.records.filter(record => record.topic_ids.includes(topic));

test('eight admitted research topics use the real API, independent of area/YE filters and without passive model/search POST', async ({page, request}) => {
  const response = await request.get(marketUrl);
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  expect(market.research?.data_kind).toBe('historical_research');
  expect(market.research?.publication_status).toBe('admitted_with_caveats');
  expect(market.research?.topics.map(topic => topic.id).sort()).toEqual(topics.map(([,id]) => id).sort());
  const passivePosts: string[] = [];
  page.on('request', call => {
    if (call.method() === 'POST' && /\/api\/(chat|discovery)(?:\?|$)/.test(call.url())) passivePosts.push(call.url());
  });
  await page.goto('/');
  for (const [label, id] of topics) {
    await openSection(page, label);
    const board = page.locator(`#section-content [data-research-topic="${id}"]`);
    await expect(board).toBeVisible();
    await expect(board).toContainText('Historical research · source scope / window applies');
    await expect(board.locator('.research-card[data-research-id]')).toHaveCount(recordsFor(market,id).length);
    for (const record of recordsFor(market,id)) {
      expect(record.map_binding).toBeNull();
      const card = board.locator(`[data-research-id="${record.id}"]`);
      await expect(card).toContainText(record.display_value);
      await expect(card).toContainText(record.source_geography);
      await expect(card).toContainText(record.statistical_window);
      await expect(card).toContainText(record.release_vintage ?? 'unknown');
      await expect(card).toContainText(record.definition);
      if (record.target_window !== null) {
        await expect(card).toContainText(record.target_window);
        await expect(card.locator('dt', {hasText: 'Forecast as-of'}).locator('..').locator('dd')).toHaveText(record.forecast_as_of ?? 'unknown');
      }
      if (record.source_ids.length) {
        const source = market.research!.sources.find(item => item.id === record.source_ids[0]);
        expect(source).toBeDefined();
        if (source!.url.startsWith('https:')) await expect(card.getByRole('link', {name: 'Read original source ↗'}).first()).toHaveAttribute('href', /^https:\/\//);
        for (const evidenceId of record.evidence_ids) {
          const excerpt = market.research!.evidence.find(item => item.id === evidenceId);
          expect(excerpt).toBeDefined();
          await expect(card).toContainText(excerpt!.quote);
        }
      }
      await expect(card).not.toContainText('View on map');
    }
    if (['leasing','supply','macro','demand','news'].includes(id)) {
      await expect(page.locator('.controls')).toBeHidden();
      await expect(page.locator('.area-panel')).toBeHidden();
    }
  }
  await openSection(page,'Submarkets');
  await page.getByRole('button', {name:'2024 year-end'}).click();
  await expect(page.locator('#period-caption')).toHaveText('2024 year-end');
  await expect(page.locator('#section-content [data-research-topic="submarkets"] .research-card[data-research-id]')).toHaveCount(recordsFor(market,'submarkets').length);
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await expect(page.locator('#detail-content')).toContainText('No verified data');
  await expect(page.locator('#detail-content')).not.toContainText(/(?:BNP|Farebrother)/i);
  await page.getByRole('button',{name:'2025 year-end'}).click();
  await expect(page.locator('.area-row[data-area="canary_wharf"]')).toContainText('No verified data');
  await page.locator('.area-row[data-area="midtown_fringe"]').click();
  await expect(page.locator('#detail-content')).toContainText('No verified data');
  await expect(page.locator('#detail-content')).not.toContainText(/(?:BNP|Farebrother)/i);
  expect(passivePosts).toEqual([]);
});

test('research windows, UK macro decisions, forecast unknowns and permission-held demand remain distinct', async ({page, request}) => {
  const response = await request.get(marketUrl);
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  const research = market.research!;
  const macro = recordsFor(market,'macro');
  const rate = (value: string) => macro.find(record => record.display_value.includes(value));
  for (const value of ['3.75', '4.75']) {
    const record = rate(value);
    expect(record, `UK macro decision ${value} must be admitted`).toBeDefined();
    expect(record!.source_geography).toMatch(/UK|United Kingdom/i);
    expect(record!.statistical_window).toBeTruthy();
  }
  expect(rate('3.75')!.statistical_window).not.toBe(rate('4.75')!.statistical_window);
  const leasing = recordsFor(market,'leasing');
  const ten = leasing.find(record => record.metric === 'annual_take_up' && record.value === 10100000);
  const nine = leasing.find(record => record.metric === 'annual_take_up' && record.value === 9430000);
  expect(ten).toBeDefined();
  expect(nine).toBeDefined();
  expect(ten!.display_value).toBe('10.1m sq ft');
  expect(nine!.display_value).toBe('9.43 million sq ft');
  expect(ten!.statistical_window).toBe('2024');
  expect(nine!.statistical_window).toBe('2025');
  const quarterly = leasing.find(record => /Q4|quarter/i.test(record.statistical_window));
  expect(quarterly).toBeDefined();
  expect(quarterly!.statistical_window).not.toBe(ten!.statistical_window);
  const forecast = recordsFor(market,'supply').find(record => record.target_window && record.forecast_as_of === null);
  expect(forecast).toBeDefined();
  expect(forecast!.release_vintage).not.toBe(forecast!.forecast_as_of);
  expect(research.exclusions.filter(item => item.topic_ids.includes('demand'))).not.toHaveLength(0);
  for (const record of recordsFor(market,'demand')) {
    expect(record.display_value).not.toMatch(/^(?:84|55|81|72|63|57)(?:%|\b)/);
  }
  await page.goto('/');
  await openSection(page,'Macro economy');
  for (const value of ['3.75','4.75']) await expect(page.locator(`[data-research-id="${rate(value)!.id}"]`)).toContainText(rate(value)!.statistical_window);
  await openSection(page,'Leasing activity');
  await expect(page.locator(`[data-research-id="${ten!.id}"]`)).toContainText(ten!.statistical_window);
  await expect(page.locator(`[data-research-id="${nine!.id}"]`)).toContainText(nine!.statistical_window);
  await openSection(page,'Supply pipeline');
  await expect(page.locator(`[data-research-id="${forecast!.id}"]`).locator('dt', {hasText: 'Forecast as-of'}).locator('..').locator('dd')).toHaveText('unknown');
  await openSection(page,'Demand drivers');
  await expect(page.locator('.research-exclusions')).toContainText('Evidence & permission gaps');
  for (const card of await page.locator('.research-card[data-research-id]').all()) {
    await expect(card.locator('.research-value')).not.toContainText(/^(?:84|55|81|72|63|57)(?:%|\b)/);
  }
});
