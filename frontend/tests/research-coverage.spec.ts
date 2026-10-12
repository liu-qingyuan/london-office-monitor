import {test, expect} from '@playwright/test';
import type {Market} from '../src/types';

test('coverage badge separates admitted 2026 research from historical YE map without extra language-switch requests', async ({page, request}) => {
  const market = await (await request.get('/api/market?metric=prime_rent&period=2025-YE')).json() as Market;
  expect(market.research?.latest_update?.record_ids).toHaveLength(12);
  const calls: string[] = [];
  page.on('request', call => { if (new URL(call.url()).pathname.startsWith('/api/')) calls.push(`${call.method()} ${new URL(call.url()).pathname}`); });
  await page.goto('/');
  await page.locator('#workspace-nav [data-section="market"]').click();
  await expect(page.locator('.area-row[data-area="city"]')).toContainText('£105.26');
  const first = await page.locator('.snapshot-badge').evaluate(element => element.textContent ?? '');
  expect(first).toContain('2026');
  await expect(page.locator('.snapshot-current')).toContainText('Verified research');
  await expect(page.locator('.snapshot-map-period')).toContainText('Map: 2024 — 2025');
  const count = calls.length;
  for (const [language, label, mapLabel] of [['zh-Hans','已核验研究','地图'], ['zh-Hant','已核驗研究','地圖'], ['en','Verified research','Map']] as const) {
    await page.locator('#language-settings select').selectOption(language);
    await expect(page.locator('.snapshot-current')).toContainText(label);
    await expect(page.locator('.snapshot-current')).toContainText('2026');
    await expect(page.locator('.snapshot-map-period')).toContainText(`${mapLabel}: 2024 — 2025`);
  }
  expect(calls.slice(count)).toEqual([]);
  expect(calls.filter(call => call.startsWith('POST '))).toEqual([]);
});

test('synthetic legacy research without admitted update never gains a current-year badge', async ({page}) => {
  await page.route('**/api/market?**', async route => {
    const response = await route.fetch();
    const market = await response.json() as Market;
    if (market.research) delete market.research.latest_update;
    await route.fulfill({response, json: market});
  });
  await page.goto('/');
  await page.locator('#workspace-nav [data-section="market"]').click();
  await expect(page.locator('.area-row[data-area="city"]')).toContainText('£105.26');
  await expect(page.locator('.snapshot-label')).toHaveText('Historical evidence');
  await expect(page.locator('.snapshot-badge')).not.toContainText('2026');
});
