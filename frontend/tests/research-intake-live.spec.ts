import {test, expect, type Page} from '@playwright/test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';
import {projectRoot} from '../scripts/python.mjs';
import type {Market} from '../src/types';
type ResearchMarket = Market & {research: NonNullable<Market['research']>};

// Real local HTTP/storage/UI, with a synthetic uploaded report. The server is
// --no-agent: creating an isolated test grant cannot call any external provider.
// Run only with dedicated LONDON_RESEARCH_DIR and LONDON_DISCOVERY_DIR directories.
test.skip(!process.env.OFFICE_INTAKE_E2E_DIR, 'Requires an isolated intake/search archive; never write a test grant into the user archive.');
test.use({viewport: {width: 1600, height: 1000}});

async function openIntake(page: Page) {
  await page.getByRole('button', {name: 'Ask Agent', exact: true}).click();
  await page.getByRole('button', {name: 'Research intake', exact: true}).click();
  await expect(page.locator('.research-intake')).toBeVisible();
}
const camera = async (page: Page) => page.evaluate(() => {
  const state = window.__officeMapDebug!.state();
  return {zoom: state.zoom, pitch: state.pitch, bearing: state.bearing, geometryCount: state.geometryCount};
});

test('actual upload, separate batch admission, persisted research and web grant preserve desktop/mobile map', async ({page, request}, testInfo) => {
  const isolated = process.env.OFFICE_INTAKE_E2E_DIR!;
  expect(process.env.LONDON_RESEARCH_DIR).toBe(join(isolated, 'research'));
  expect(process.env.LONDON_DISCOVERY_DIR).toBe(join(isolated, 'discovery'));
  const originalSnapshot = await readFile(join(projectRoot, 'data/snapshot.json'));
  const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  const before = await (await request.get('/api/market')).json() as ResearchMarket;
  const poolBefore = await (await request.get('/api/discovery')).json();
  expect((await (await request.get('/api/catalog')).json()).agent.enabled).toBe(false);
  const posts: string[] = [];
  const errors: string[] = [];
  page.on('request', r => { if (r.method() === 'POST') posts.push(new URL(r.url()).pathname); });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect.poll(() => page.evaluate(() => window.__officeMapDebug?.state())).toMatchObject({webgl2: true, geometryCount: 4});
  const desktopMap = await page.locator('#map').boundingBox();
  const originalCamera = await camera(page);
  await openIntake(page);
  expect(posts).toEqual([]);
  expect(await page.locator('#map').boundingBox()).toEqual(desktopMap);
  const text = 'City office rent for 2026-Q3: Prime achieved rent is 110 GBP/sq ft.';
  const material = page.locator('.material-form');
  await material.locator('[name=file]').setInputFiles({name: 'synthetic-report.txt', mimeType: 'text/plain', buffer: Buffer.from(text)});
  await material.locator('[name=url]').fill('https://example.test/synthetic-report');
  await material.locator('[name=publisher]').fill('Synthetic fixture publisher');
  await material.locator('[name=title]').fill('Synthetic browser test, not market evidence');
  await material.locator('[name=usage_note]').fill('Synthetic uploaded fixture for isolated local API/browser verification only.');
  await page.getByRole('button', {name: 'Add material to this draft'}).click();
  const candidate = page.locator('.candidate-form');
  await candidate.locator('input[value=rents]').check();
  const fields = {metric: 'prime_rent', label: 'Synthetic browser rent', value: '110', unit: 'GBP/sq ft',
    source_geography: 'City', statistical_window: '2026-Q3', definition: 'Prime achieved rent', quote: text,
    section: 'Synthetic line 1', value_anchor: '110 GBP/sq ft'};
  for (const [name, value] of Object.entries(fields)) await candidate.locator(`[name=${name}]`).fill(value);
  await page.getByRole('button', {name: 'Add candidate to this draft'}).click();
  expect(posts).toEqual([]);
  const stagedResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/research/batches' && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Stage this batch only · do not admit'}).click();
  const stagedHttp = await stagedResponse;
  expect(stagedHttp.status()).toBe(200);
  const staged = await stagedHttp.json();
  const batch = staged.batches[0];
  const panel = page.locator(`[data-batch-id="${batch.id}"]`);
  await expect(panel).toContainText('Eligible for admission after batch approval');
  expect(batch.authorized_at).toBeNull();
  expect((await (await request.get('/api/market')).json()).research.records).toEqual(before.research.records);
  const approval = page.waitForResponse(r => new URL(r.url()).pathname.endsWith(`/${batch.id}/authorize`) && r.request().method() === 'POST');
  await panel.getByRole('button', {name: 'Authorize admission for this batch'}).click();
  const approvalHttp = await approval;
  expect(approvalHttp.status()).toBe(200);
  const approved = await approvalHttp.json();
  await expect(panel).toContainText('Admitted');
  const after = await (await request.get('/api/market')).json() as ResearchMarket;
  const admitted = after.research.records.find(row => row.id === approved.batches[0].candidates[0].id)!;
  expect(admitted.value).toBe(110);
  expect(admitted.map_binding).toBeNull();
  expect(after.research.records).toHaveLength(before.research.records.length + 1);
  expect(after.observations).toEqual(before.observations);
  expect(after.geometry).toEqual(before.geometry);
  expect(await camera(page)).toEqual(originalCamera);
  expect(await page.locator('#map').boundingBox()).toEqual(desktopMap);
  const archive = JSON.parse(await readFile(join(isolated, 'research', 'state.json'), 'utf8'));
  expect(archive.accepted.records.map((row: {id: string}) => row.id)).toContain(admitted.id);
  expect(archive.batches[batch.id].documents[0].sha256).toBe(hash(Buffer.from(text)));
  expect(after.research.sources.find(source => admitted.source_ids.includes(source.id))?.verification_status).toBe('user_supplied_document_excerpt_not_live');
  await page.screenshot({path: testInfo.outputPath('desktop-batch-admitted.png')});

  await page.setViewportSize({width: 390, height: 844});
  await page.reload();
  const mobileMap = await page.locator('#map').boundingBox();
  await openIntake(page);
  await expect(page.locator(`[data-batch-id="${batch.id}"]`)).toContainText('Admitted');
  expect(await page.locator('#map').boundingBox()).toEqual(mobileMap);
  expect(mobileMap?.width).toBe(390);
  expect(mobileMap?.height).toBe(844);
  await page.screenshot({path: testInfo.outputPath('mobile-batch-admitted.png')});

  await page.locator('#agent-mode').selectOption('discovery');
  await expect(page.locator('.authorization-state')).toContainText('Not configured');
  await page.locator('#question').fill('Synthetic no-agent browser check; do not search a real provider.');
  const grantResponse = page.waitForResponse(r => new URL(r.url()).pathname === '/api/discovery/authorization' && r.request().method() === 'POST');
  await page.getByRole('button', {name: 'Authorize this allowance and search'}).click();
  const grantHttp = await grantResponse;
  expect(grantHttp.status()).toBe(200);
  const grant = await grantHttp.json();
  await expect(page.locator('#agent-result')).toContainText('agent_disabled');
  await expect(page.locator('.authorization-state')).toContainText('Active');
  const balance = await (await request.get('/api/discovery/authorization')).json();
  expect(balance.authorization_id).toBe(grant.authorization_id);
  expect(balance.google.starts).toBe(0);
  expect(balance.model_turns.starts).toBe(0);
  expect(await (await request.get('/api/discovery')).json()).toEqual(poolBefore);
  expect(posts).toEqual(['/api/research/batches', `/api/research/batches/${batch.id}/authorize`, '/api/discovery/authorization', '/api/discovery']);
  expect(hash(await readFile(join(projectRoot, 'data/snapshot.json')))).toBe(hash(originalSnapshot));
  expect(errors).toEqual([]);
  await testInfo.attach('actual-local-intake-evidence', {body: JSON.stringify({basis: 'actual local HTTP/UI with synthetic uploaded material and disabled Agent',
    batch_id: batch.id, content_revision: batch.content_revision, state_revision: archive.revision, admitted_id: admitted.id,
    before_research_count: before.research.records.length, after_research_count: after.research.records.length,
    original_snapshot_sha256: hash(originalSnapshot), desktopMap, mobileMap, originalCamera,
    grant: balance, posts, external_search_and_model_calls: 0}), contentType: 'application/json'});
});
