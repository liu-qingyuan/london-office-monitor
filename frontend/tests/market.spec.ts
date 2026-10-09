import {test, expect} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
import type {Catalog, Market} from '../src/types';

const query = (metric = 'prime_rent', period = '2025-YE', area?: string) => {
  const params = new URLSearchParams({metric, period});
  if (area) params.set('area', area);
  return `/api/market?${params}`;
};

test('real API provides four areas, missing is not zero, and filters change period', async ({page, request}) => {
  const response = await request.get(query());
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  expect(market.observations).toHaveLength(4);
  await page.goto('/');
  await expect(page.getByRole('heading', {name: 'London, in context.'})).toBeVisible();
  await expect(page.getByRole('heading', {name: 'Area overview'})).toBeVisible();
  const rows = page.locator('.area-row');
  await expect(rows).toHaveCount(4);
  const missing = market.observations.find(o => o.status === 'missing');
  expect(missing).toBeDefined();
  await expect(page.locator(`.area-row[data-area="${missing!.area_id}"]`)).toContainText('No verified data');
  await page.getByRole('button', {name: '2024 year-end'}).click();
  await expect(page.locator('#period-caption')).toHaveText('2024 year-end');
  await expect(page.getByRole('button', {name: '2024 year-end'})).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', {name: 'Average Grade A rent'}).click();
  await expect(page.getByRole('button', {name: 'Average Grade A rent'})).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.area-row')).toHaveCount(4);
});

test('real City values, Python comparison and original evidence appear in detail', async ({page, request}) => {
  const [previousResponse, currentResponse] = await Promise.all([
    request.get(query('prime_rent', '2024-YE', 'city')),
    request.get(query('prime_rent', '2025-YE', 'city'))
  ]);
  expect(previousResponse.ok()).toBe(true);
  expect(currentResponse.ok()).toBe(true);
  const current = await currentResponse.json() as Market;
  const previous = await previousResponse.json() as Market;
  const value = current.observations[0];
  expect(value?.status).toBe('available');
  const calculated = current.comparisons.find(c => c.area_id === 'city');
  await page.goto('/');
  await expect(page.locator('.area-row[data-area="city"]')).toContainText('£');
  await expect(page.getByRole('heading', {name: 'City', exact: true})).toBeVisible();
  const detail = page.locator('#detail-content');
  await expect(detail.locator('.trend-card')).toHaveCount(2);
  await expect(detail).toContainText(String(previous.observations[0]?.value));
  await expect(detail).toContainText(String(value?.value));
  if (calculated?.change_value !== null && calculated?.change_value !== undefined) {
    await expect(detail.locator('.comparison')).toContainText(String(calculated.change_value));
  }
  await expect(detail.getByRole('link', {name: 'Read original source ↗'}).first()).toHaveAttribute('href', /^https:\/\//);
  await expect(detail).toContainText('Historical reporting · not live news');
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await expect(detail).toContainText('No verified data');
});

test('WebGL2 interleaved deck canvas draws backend geometry and supports actual pointer picking', async ({page, request}) => {
  const catalogResponse = await request.get('/api/catalog');
  expect(catalogResponse.ok()).toBe(true);
  const catalog = await catalogResponse.json() as Catalog;
  const city = catalog.areas.find(area => area.id === 'city');
  expect(city).toBeDefined();
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(async () => page.evaluate(() => window.__officeMapDebug?.state())).toMatchObject({webgl2: true, interleaved: true, deckCanvasShared: true, geometryCount: 4});
  const projected = await page.evaluate(center => window.__officeMapDebug?.project(center), city!.center);
  expect(projected).not.toBeNull();
  const box = await page.locator('#map').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + projected!.x, box!.y + projected!.y);
  await expect(page.locator('#map-tooltip')).toBeVisible();
  await expect(page.locator('#map-tooltip')).toContainText('Illustrative selector — not a reporting boundary.');
  await expect(page.locator('#map-tooltip')).toContainText('Value:');
  const westEnd = catalog.areas.find(area => area.id === 'west_end');
  expect(westEnd).toBeDefined();
  const westPoint = await page.evaluate(center => window.__officeMapDebug?.project(center), westEnd!.center);
  expect(westPoint).not.toBeNull();
  await page.mouse.click(box!.x + westPoint!.x, box!.y + westPoint!.y);
  await expect(page.locator('.area-row[data-area="west_end"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#detail-content h3')).toHaveText('West End');
  await mkdir('../artifacts', {recursive: true});
  await page.locator('.map-wrap').screenshot({path: '../artifacts/london-map.png'});
  expect(errors).toEqual([]);
});

test('unavailable external background preserves real data and deck selection geometry', async ({page}) => {
  // Only block the third-party map service. Our catalog and market API are never mocked.
  await page.route('https://tiles.openfreemap.org/**', route => route.abort());
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await expect(page.locator('#map-state')).toContainText('Background service unavailable', {timeout: 15000});
  await expect.poll(async () => page.evaluate(() => window.__officeMapDebug?.state())).toMatchObject({webgl2: true, interleaved: true, deckCanvasShared: true, baseMapStatus: 'unavailable', geometryCount: 4});
  await expect(page.locator('.area-row[data-area="city"]')).toContainText('£');
  const catalog = await (await page.request.get('/api/catalog')).json() as Catalog;
  const center = catalog.areas.find(a => a.id === 'city')!.center;
  const point = await page.evaluate(coordinates => window.__officeMapDebug?.project(coordinates), center);
  const rect = await page.locator('#map').boundingBox();
  expect(point).not.toBeNull();
  expect(rect).not.toBeNull();
  await page.mouse.move(rect!.x + point!.x, rect!.y + point!.y);
  await expect(page.locator('#map-tooltip')).toContainText('City');
});

test('question suggestions do not silently call the agent', async ({page}) => {
  const chatRequests: string[] = [];
  page.on('request', req => { if (req.url().includes('/api/chat')) chatRequests.push(req.url()); });
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await page.getByRole('button', {name: 'City rent change ↗'}).click();
  await expect(page.getByRole('textbox', {name: 'YOUR QUESTION'})).toHaveValue(/City average prime achieved rent/);
  expect(chatRequests).toEqual([]);
  await expect(page.locator('#agent-result')).toBeEmpty();
});

test('offline Agent errors are visible and never presented as an AI answer', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await page.getByRole('textbox', {name: 'YOUR QUESTION'}).fill('Compare City rent from the two historical reports.');
  await page.getByRole('button', {name: 'Ask assistant'}).click();
  await expect(page.locator('#agent-result')).toContainText('agent_disabled');
  await expect(page.locator('#agent-result .answer')).toHaveCount(0);
});
