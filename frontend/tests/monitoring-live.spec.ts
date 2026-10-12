import {test, expect} from '@playwright/test';
import {openSection} from './navigation';

// Real same-origin API and actual local archives. No monitoring/Market mock.
// A clean checkout honestly exercises not_configured instead of inventing data.
test('News monitoring card reads the real API without starting a source or model action', async ({page, request}, testInfo) => {
  const response = await request.get('/api/monitoring');
  expect(response.ok()).toBe(true);
  const status = await response.json();
  expect(status.schema_version).toBe(1);
  expect(status.data_kind).toBe('monitoring_status');
  expect(status.formal_market_updated).toBe(false);
  expect(status.filter.ai_used).toBe(false);
  await testInfo.attach('real-monitoring-api.json', {body: JSON.stringify(status, null, 2), contentType: 'application/json'});
  const posts: string[] = [];
  const monitorRequests: string[] = [];
  page.on('request', call => {
    if (call.method() === 'POST') posts.push(call.url());
    if (new URL(call.url()).pathname === '/api/monitoring') monitorRequests.push(call.method());
  });
  await page.goto('/');
  await openSection(page, 'News & events');
  const card = page.locator('[data-monitoring-status]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-monitoring-status', status.status);
  await expect(card).toContainText('Official source monitoring');
  await expect(card).toContainText(status.schedule.state);
  await expect(page.locator('.snapshot-badge')).toContainText('2024 — 2025');
  if (status.status === 'available') {
    expect(status.sources.length).toBeGreaterThan(0);
    for (const source of status.sources) {
      const sourceCard = card.locator(`[data-monitoring-source="${source.id}"]`);
      await expect(sourceCard).toBeVisible();
      await expect(sourceCard).toHaveAttribute('data-monitoring-check-status', source.status);
      for (const link of source.links) {
        await expect(sourceCard.getByRole('link', {name: link.title, exact: true})).toHaveAttribute('href', link.url);
      }
    }
  }
  const refresh = page.waitForResponse(call => new URL(call.url()).pathname === '/api/monitoring');
  await card.getByRole('button', {name: 'Refresh status', exact: true}).click();
  expect((await refresh).ok()).toBe(true);
  await expect(card).toHaveAttribute('data-monitoring-status', status.status);
  expect(posts).toEqual([]);
  expect(monitorRequests.length).toBeGreaterThanOrEqual(2);
  expect(monitorRequests.every(method => method === 'GET')).toBe(true);
  await page.screenshot({path: testInfo.outputPath('real-news-monitoring.png')});
});
