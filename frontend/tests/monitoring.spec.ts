import {test, expect} from '@playwright/test';
import {openSection} from './navigation';

// Synthetic display-only monitoring response. Market/catalog requests still use real Python APIs.
const fixture = {
  schema_version: 1, data_kind: 'monitoring_status', status: 'available',
  last_checked_at: '2026-10-12T01:37:20+00:00',
  schedule: {state: 'exhausted', interval_seconds: 60, max_runs: 2, run_starts: 2,
    remaining_runs: 0, expires_at: '2026-10-12T02:00:00+00:00'},
  filter: {mode: 'official_office_keywords', ai_used: false, omitted_links: 73},
  formal_market_updated: false,
  sources: [
    {id: 'savills-central-london', label: 'Savills official index', status: 'no_new_publication_links',
      checked_at: '2026-10-12T01:37:20+00:00', index_url: 'https://www.savills.co.uk/insight-and-opinion/research.aspx', new_link_count: 0,
      links: [{url: 'https://www.savills.co.uk/research_articles/229130/999998-0', title: 'Archived office edition',
        edition: '2025-Q4', published_at: null, observation_period: null, is_new: false},
        {url: 'https://www.savills.co.uk/research_articles/229130/999999-0', title: 'Central London Office Market Watch <script>alert(1)</script>',
        edition: '2026-09', published_at: null, observation_period: null, is_new: false}]},
    {id: 'crown-estate-news', label: 'The Crown Estate', status: 'check_failed',
      checked_at: '2026-10-12T01:36:17+00:00', index_url: 'https://www.thecrownestate.co.uk/news', new_link_count: 1,
      links: [{url: 'https://www.thecrownestate.co.uk/news/london-office', title: 'London office announcement',
        edition: null, published_at: null, observation_period: null, is_new: true},
        {url: 'https://www.thecrownestate.co.uk.evil.test/news/fake', title: 'Unsafe host', edition: null, published_at: null, observation_period: null, is_new: true},
        {url: 'javascript:alert(1)', title: 'Unsafe scheme', edition: null, published_at: null, observation_period: null, is_new: true}]}
  ], warnings: ['Links are leads, not verified observations.']
};

const mockMonitoring = async (page: import('@playwright/test').Page, payload: unknown = fixture, status = 200) => {
  const calls: string[] = [];
  await page.route('**/api/monitoring', route => {
    calls.push(route.request().method());
    return route.fulfill({status, json: payload});
  });
  return calls;
};

test('News shows bounded stopped monitoring, unknown dates, new only when true, safe links and untouched historical market', async ({page}) => {
  const calls = await mockMonitoring(page);
  const passive: string[] = [];
  page.on('request', request => {
    if (request.method() === 'POST' || /\/(?:api\/(?:chat|discovery)|search)(?:\?|$)/.test(request.url())) passive.push(request.url());
  });
  await page.goto('/');
  await openSection(page, 'News & events');
  const panel = page.locator('[data-monitoring-status]');
  await expect(panel).toContainText('exhausted');
  await expect(panel).toContainText('2 / 2');
  await expect(panel).toContainText('2026-10-12T01:37:20+00:00');
  await expect(panel).toContainText('2026-10-12T02:00:00+00:00');
  await expect(panel).toContainText('73');
  await expect(panel).toContainText('AI: not used');
  await expect(panel).toContainText('2024/2025');
  await expect(panel).not.toContainText(/running|live market|latest rent|latest vacancy/i);
  await expect(page.locator('.monitoring-card[data-monitoring-source]')).toHaveCount(2);
  await expect(page.locator('[data-monitoring-source="crown-estate-news"]')).toContainText(/check failed/i);
  await expect(page.locator('[data-monitoring-source="crown-estate-news"]')).not.toContainText('No news');
  const savills = page.locator('[data-monitoring-source="savills-central-london"]');
  await expect(savills).toContainText('Edition: 2026-09');
  await expect(savills.locator('.monitoring-links li').first()).toContainText('Edition: 2026-09');
  await expect(savills).toContainText('Published: unknown');
  await expect(savills).toContainText('Observation period: unknown');
  await expect(savills.getByText('New', {exact: true})).toHaveCount(0);
  await expect(page.locator('[data-monitoring-source="crown-estate-news"] .monitoring-new')).toHaveCount(1);
  await expect(page.getByRole('link',{name:/Central London Office Market Watch/})).toHaveAttribute('href', /^https:\/\/www\.savills\.co\.uk\//);
  await expect(page.getByRole('link',{name:'Unsafe host'})).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Unsafe scheme'})).toHaveCount(0);
  await expect(page.locator('[data-monitoring-status] script')).toHaveCount(0);
  await expect(page.locator('[data-monitoring-status]')).toContainText('<script>alert(1)</script>');
  await expect(page.locator('#section-content [data-research-topic="news"]')).toBeVisible();
  await expect(page.locator('#section-content')).toContainText(/historical/i);
  await openSection(page, 'Supply pipeline');
  await openSection(page, 'News & events');
  await expect(panel).toContainText('exhausted');
  expect(calls).toEqual(['GET']);
  expect(passive).toEqual([]);
});

test('manual Refresh status performs one more GET only; failed response remains retryable', async ({page}) => {
  let count = 0;
  const requests: string[] = [];
  await page.route('**/api/monitoring', route => {
    requests.push(route.request().method());
    count++;
    return route.fulfill(count === 1 ? {status: 503, json: {error: {message: 'unavailable'}}} : {json: fixture});
  });
  page.on('request', request => {if(request.method() === 'POST') requests.push('POST ' + request.url());});
  await page.goto('/');
  await openSection(page, 'News & events');
  await expect(page.locator('[data-monitoring-status]')).toContainText(/request failed|unavailable/i);
  await page.getByRole('button', {name: 'Refresh status'}).click();
  await expect(page.locator('[data-monitoring-status]')).toContainText('exhausted');
  expect(requests).toEqual(['GET','GET']);
});

test('no configuration is explicit and allows refresh; unsupported/stopped must never look running', async ({page}) => {
  const states = ['not_configured', 'unsupported', 'stopped', 'expired', 'unknown'] as const;
  let index = 0;
  const calls: string[] = [];
  await page.route('**/api/monitoring', route => {
    calls.push(route.request().method());
    const state = states[Math.min(index++, states.length-1)];
    return route.fulfill({json: {...fixture, status: state === 'not_configured' ? 'not_configured' : 'available',
      last_checked_at: null, sources: [], schedule: {...fixture.schedule, state, expires_at: null}}});
  });
  await page.goto('/');
  await openSection(page, 'News & events');
  for(const state of states){
    await expect(page.locator('[data-monitoring-status]')).toContainText(state);
    await expect(page.locator('[data-monitoring-status]')).toContainText('Last check: unknown');
    await expect(page.locator('[data-monitoring-status]')).not.toContainText(/running|no news/i);
    if(state !== states[states.length-1]) await page.getByRole('button',{name:'Refresh status'}).click();
  }
  expect(calls).toEqual(states.map(() => 'GET'));
});
