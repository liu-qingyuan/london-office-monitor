import {test, expect} from '@playwright/test';
import {openSection} from './navigation';
import type {Market, ResearchRecord, SourceTopicId} from '../src/types';

const marketUrl = '/api/market?metric=prime_rent&period=2025-YE';
const topics: readonly [string, SourceTopicId][] = [
  ['Macro economy', 'macro'], ['Rents', 'rents'], ['Leasing activity', 'leasing'],
  ['Demand drivers', 'demand'], ['Submarkets', 'submarkets'], ['Vacancy & availability', 'vacancy'],
  ['Supply pipeline', 'supply'], ['News & events', 'news']
];

test('admitted 2026 facts move into topic-specific verified groups without changing historical map or invoking search/model', async ({page, request}) => {
  const response = await request.get(marketUrl);
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  const research = market.research!;
  // Clean CI may still use the original 120-record snapshot. It must not masquerade as a latest-data acceptance run.
  test.skip(!research?.latest_update, 'not_configured: no admitted latest_update in the real Market API');
  const update = research.latest_update!;
  expect(update.admitted_at).toMatch(/^2026-/);
  expect(update.source_checked_at).toMatch(/^2026-/);
  expect(update.note).toBeTruthy();
  expect(update.record_ids).toHaveLength(12);
  expect(new Set(update.record_ids).size).toBe(12);
  expect(update.source_ids.length).toBeGreaterThan(0);
  expect(research.records).toHaveLength(132);
  expect(research.exclusions).toHaveLength(7);
  expect(research.is_live).toBe(false);
  for (const topic of research.topics) expect(topic.record_count).toBe(research.records.filter(record => record.topic_ids.includes(topic.id)).length);
  const latestIds = new Set(update.record_ids);
  const latest = research.records.filter(record => latestIds.has(record.id));
  expect(latest).toHaveLength(12);
  const historical = research.records.filter(record => !latestIds.has(record.id));
  expect(historical).toHaveLength(120);
  for (const record of latest) {
    expect(record.map_binding).toBeNull();
    expect(record.source_ids.length).toBeGreaterThan(0);
    expect(record.evidence_ids.length).toBeGreaterThan(0);
    for (const id of record.source_ids) expect(research.sources.some(source => source.id === id)).toBe(true);
    for (const id of record.evidence_ids) expect(research.evidence.some(quote => quote.id === id && record.source_ids.includes(quote.source_id))).toBe(true);
  }
  for (const id of update.source_ids) expect(research.sources.some(source => source.id === id)).toBe(true);
  expect((await (await request.get('/api/catalog')).json()).periods.map((item: {id: string}) => item.id)).toEqual(['2024-YE', '2025-YE']);
  expect(market.observations).toHaveLength(4);
  expect(market.observations.find(item => item.area_id === 'city')?.value).toBe(105.26);
  expect(market.observations.find(item => item.area_id === 'canary_wharf')?.value).toBeNull();
  expect(market.observations.find(item => item.area_id === 'midtown_fringe')?.value).toBeNull();

  const fact = (value: number, geography: RegExp, window: RegExp): ResearchRecord => {
    const matches = latest.filter(record => record.value === value && geography.test(record.source_geography) && window.test(record.statistical_window));
    expect(matches, `one latest fact for ${value}, ${geography}, ${window}`).toHaveLength(1);
    return matches[0]!;
  };
  const uk = /UK|United Kingdom/i;
  const august = /August 2026|2026-08/i;
  const sourcePublished = (record: ResearchRecord, date: string): void => {
    expect(record.source_ids.some(id => research.sources.some(source => source.id === id && source.published_at === date))).toBe(true);
  };
  const rate = fact(3.75, uk, /2026-09-17|17 September 2026|September 2026/i);
  const gdp = fact(0.4, uk, /July 2026|2026-07/i);
  const employment = fact(75.1, uk, /May.{0,8}July 2026|2026-05.*2026-07/i);
  const unemployment = fact(4.9, uk, /May.{0,8}July 2026|2026-05.*2026-07/i);
  expect(unemployment.denominator).toBeNull();
  sourcePublished(rate, '2026-09-17');
  sourcePublished(gdp, '2026-09-11');
  sourcePublished(employment, '2026-09-15');
  sourcePublished(unemployment, '2026-09-15');
  const cityRent = fact(86.26, /City/i, august);
  const westRent = fact(134.17, /West End/i, august);
  for (const record of [cityRent, westRent]) {
    expect(`${record.metric} ${record.definition} ${record.label}`).toMatch(/Grade A/i);
    expect(`${record.metric} ${record.label}`).not.toMatch(/prime|headline|per annum/i);
    expect(record.definition).toContain('not prime or headline rent');
    expect(record.unit).toMatch(/GBP\/sq ft/i);
  }
  const takeup = [
    fact(557416, /Central London/i, august), fact(373298, /City/i, august),
    fact(184118, /West End/i, august)
  ];
  const ytd = fact(6130000, /Central London/i, /YTD|year.to.date|January.{0,8}August/i);
  expect(ytd.statistical_window).not.toMatch(/^August 2026$/i);
  const cityGradeA = fact(95, /City/i, august);
  const professional = fact(31, /Central London/i, august);
  expect(`${cityGradeA.label} ${cityGradeA.definition}`).toMatch(/Grade A/i);
  expect(`${professional.label} ${professional.definition}`).toMatch(/Professional Services/i);
  expect(`${cityGradeA.denominator} ${professional.denominator}`).toMatch(/take.up|leasing|area/i);
  const savills = [cityRent, westRent, ...takeup, ytd, cityGradeA, professional];
  for (const record of savills) {
    sourcePublished(record, '2026-09-30');
    expect(record.source_ids.some(id => research.sources.some(source => source.id === id && /savills/i.test(source.publisher) && /September 2026/i.test(source.title)))).toBe(true);
  }
  expect(new Set([rate,gdp,employment,unemployment,...savills].map(record => record.id)).size).toBe(12);

  const passivePosts: string[] = [];
  page.on('request', call => {
    if (call.method() === 'POST' && /\/api\/(?:chat|discovery)(?:\?|$)/.test(call.url())) passivePosts.push(call.url());
  });
  await page.goto('/');
  for (const [label, topic] of topics) {
    await openSection(page, label);
    const board = page.locator(`#section-content [data-research-topic="${topic}"]`);
    await expect(board).toBeVisible();
    const inTopic = research.records.filter(record => record.topic_ids.includes(topic));
    const current = inTopic.filter(record => latestIds.has(record.id));
    const old = inTopic.filter(record => !latestIds.has(record.id));
    const group = board.locator(`[data-latest-research-topic="${topic}"]`);
    if (current.length) {
      await expect(group).toBeVisible();
      await expect(group.getByRole('heading', {name: 'Latest verified update', exact: true})).toBeVisible();
      await expect(group).toContainText(update.admitted_at);
      await expect(group).toContainText(update.source_checked_at);
      await expect(group).toContainText(update.note);
      await expect(group.locator('[data-research-id]')).toHaveCount(current.length);
      expect(await group.locator('[data-research-id]').evaluateAll(cards => cards.map(card => card.getAttribute('data-research-id')))).toEqual(current.map(record => record.id));
      for (const record of current) {
        const card = group.locator(`[data-research-id="${record.id}"]`);
        await expect(card).toContainText(record.display_value);
        await expect(card).toContainText(record.source_geography);
        await expect(card).toContainText(record.statistical_window);
        for (const id of record.evidence_ids) await expect(card).toContainText(research.evidence.find(item => item.id === id)!.quote);
        await expect(card.locator('.research-source a')).toHaveCount(record.source_ids.length);
        for (const [index, id] of record.source_ids.entries()) {
          const source = research.sources.find(item => item.id === id)!;
          await expect(card).toContainText(source.title);
          await expect(card).toContainText(source.published_at ?? 'unknown');
          await expect(card.locator('.research-source a').nth(index)).toHaveAttribute('href', new URL(source.url).href);
        }
        await expect(board.locator(`[data-research-id="${record.id}"]`)).toHaveCount(1);
      }
    } else await expect(group).toHaveCount(0);
    const historicalCards = board.locator(':scope > .research-card[data-research-id]');
    expect(await historicalCards.evaluateAll(cards => cards.map(card => card.getAttribute('data-research-id')))).toEqual(old.map(record => record.id));
    await expect(board.locator('.research-card[data-research-id]')).toHaveCount(inTopic.length);
    await expect(board.locator(':scope > .section-report-head h3')).toContainText('Historical research');
  }
  await openSection(page, 'Submarkets');
  await expect(page.locator('.area-row[data-area="canary_wharf"]')).toContainText('No verified data');
  await expect(page.locator('.area-row[data-area="midtown_fringe"]')).toContainText('No verified data');
  await openSection(page, 'Demand drivers');
  await expect(page.locator('.research-exclusions')).toBeVisible();
  expect(passivePosts).toEqual([]);
});
