import {test, expect, type Page} from '@playwright/test';

// These routes supply synthetic responses. They do not call a model, search, fetch a source, or write research state.
const noAuthorization = {
  schema_version: 1, status: 'not_configured', authorization_id: null, authorization_source: null,
  authorized_at: null, expires_at: null,
  google: {cap: 0, starts: 0, remaining: 0}, model_turns: {cap: 0, starts: 0, remaining: 0}, warnings: []
};
const authorized = {
  ...noAuthorization, status: 'active', authorization_id: 'fixture-web-grant', authorization_source: 'web',
  authorized_at: '2026-10-12T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
  google: {cap: 2, starts: 0, remaining: 2}, model_turns: {cap: 3, starts: 0, remaining: 3}
};

async function openIntake(page: Page) {
  await page.getByRole('button', {name: 'Ask Agent', exact: true}).click();
  await page.getByRole('button', {name: 'Research intake', exact: true}).click();
  await expect(page.locator('.research-intake')).toBeVisible();
}

function candidate(id: string, status: 'eligible' | 'needs_confirmation' | 'blocked', state: string) {
  return {
    id, record: {id: `record-${id}`, topic_ids: ['rents'], kind: 'reported_statistic', metric: 'achieved_rent',
      label: id === 'candidate-1' ? 'City rent' : 'West End rent', value: id === 'candidate-1' ? 100 : 110,
      unit: 'GBP/sq ft', display_value: id === 'candidate-1' ? '100 GBP/sq ft' : '110 GBP/sq ft', status: 'available',
      source_geography: 'City', statistical_window: '2025-YE', release_vintage: null, forecast_as_of: null,
      target_window: null, definition: 'Achieved rent', denominator: null, billing_period: null,
      source_ids: ['source-1'], evidence_ids: ['evidence-1'], caveats: [], map_binding: null, reference_observation_ids: []},
    sources: [{id: 'source-1', publisher: 'Fixture Publisher', title: 'Uploaded report <img src=x onerror=alert(1)>',
      url: 'https://example.org/report', published_at: null, report_period: '2025-YE', retrieved_at: '2026-10-12',
      verification_status: 'user_uploaded_original', usage_note: 'Fixture only'}],
    evidence: [{id: 'evidence-1', source_id: 'source-1', section: 'p.1 <svg/onload=alert(1)>',
      quote: 'City rent was 100 GBP/sq ft. <img src=x onerror=alert(1)>'}],
    assessment: {status, reasons: status === 'eligible' ? [] : [{code: status === 'blocked' ? 'missing_original' : 'conflict',
      message: 'Check the exact definition, not the search snippet.', related_record_ids: ['older-record-7']}]}, state
  };
}

function batch(authorizedAt: string | null, secondStatus: 'needs_confirmation' | 'blocked', secondState: string) {
  return {schema_version: 1, data_kind: 'research_candidate_batches', revision: authorizedAt ? 2 : 1,
    batches: [{id: 'batch-fixture', content_revision: 'f'.repeat(64), created_at: '2026-10-12T00:00:00Z', authorized_at: authorizedAt,
      candidates: [candidate('candidate-1', 'eligible', authorizedAt ? 'accepted' : 'unapproved'),
        candidate('candidate-2', secondStatus, authorizedAt ? secondState : 'unapproved')]}]};
}

test('a question and finite separate grant precede the first discovery search; no passive POST or renewal', async ({page}) => {
  let state: typeof noAuthorization | typeof authorized = noAuthorization;
  const actions: {path: string; body: any; headers: Record<string, string>}[] = [];
  await page.route('**/api/chat', async route => {
    if (route.request().method() === 'POST') actions.push({path:'unexpected chat',body:route.request().postDataJSON(),headers:route.request().headers()});
    await route.fulfill({status:403,json:{status:'error',error:{code:'fixture_forbidden',message:'No live model in this suite'}}});
  });
  await page.route('**/api/discovery/authorization', async route => {
    if (route.request().method() === 'GET') { await route.fulfill({json: state}); return; }
    const r = route.request();
    actions.push({path: 'grant', body: r.postDataJSON(), headers: r.headers()});
    state = authorized;
    await route.fulfill({json: state});
  });
  await page.route('**/api/discovery', async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    const r = route.request();
    actions.push({path: 'search', body: r.postDataJSON(), headers: r.headers()});
    await route.fulfill({json: {schema_version: 1, data_kind: 'source_discovery', run_id: 'synthetic-only', status: 'partial',
      assessment: 'Synthetic screening; no real source searched.', assessment_basis: 'ai_generated_source_screening',
      selected_candidate_ids: [], pool: {schema_version: 1, data_kind: 'source_candidates', source_count: 0,
        occurrence_count: 0, candidates: [], runs: [], warnings: [], topics: []}, tool_calls: [], warnings: [],
      provider_states: {serpapi_google: {status: 'not_executed', successful_runs: 0},
        codex_native: {status: 'not_executed', searches_started_observed: 0, searches_completed_observed: 0,
          candidate_occurrences_captured: 0, http_request_count: null}}}});
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Ask Agent', exact: true}).click();
  await page.locator('#agent-mode').selectOption('discovery');
  await expect(page.locator('.discovery-authorization')).toBeVisible();
  expect(actions).toHaveLength(0);
  await page.getByRole('button', {name: 'Authorize this allowance and search'}).click();
  await expect(page.locator('.discovery-authorization [role=alert]')).toContainText('Enter a search question');
  expect(actions).toHaveLength(0);
  await page.locator('#question').fill('Find an original report');
  await page.getByRole('button', {name: 'Ask assistant', exact: true}).click();
  await expect(page.locator('.discovery-authorization')).toBeVisible();
  expect(actions).toHaveLength(0); // Arrow/Enter only guides when there is no active grant.
  await page.locator('.authorization-form [name=google_cap]').fill('2');
  await page.locator('.authorization-form [name=model_turn_cap]').fill('3');
  await page.locator('.authorization-form [name=valid_for_minutes]').fill('60');
  await page.getByRole('button', {name: 'Authorize this allowance and search'}).click();
  await expect(page.locator('#agent-result')).toContainText('Synthetic screening');
  expect(actions.map(action => action.path)).toEqual(['grant', 'search']);
  expect(actions[0]?.body).toMatchObject({google_cap: 2, model_turn_cap: 3, valid_for_minutes: 60});
  expect(actions[0]?.body.request_id).toMatch(/^[0-9a-f-]{36}$/i);
  expect(actions[1]?.body.authorization_id).toBe('fixture-web-grant');
  expect(actions.every(action => action.headers['x-office-user-action'] === 'confirm')).toBe(true);
  expect(actions.every(action => action.headers['content-type']?.includes('application/json'))).toBe(true);
  await page.locator('#language-settings select').selectOption('zh-Hans');
  await expect(page.locator('.authorization-form [name=valid_for_minutes]')).toHaveValue('60');
  expect(actions).toHaveLength(2);
});

test('zero remaining is exhausted, not unconfigured; changing language does not renew it', async ({page}) => {
  const exhausted = {...authorized, status: 'exhausted', google: {cap: 1, starts: 1, remaining: 0},
    model_turns: {cap: 1, starts: 1, remaining: 0}, warnings: ['Started calls may consume the allowance.']};
  let writes = 0;
  await page.route('**/api/discovery/authorization', async route => {
    if (route.request().method() === 'POST') writes++;
    await route.fulfill({json: exhausted});
  });
  await page.route('**/api/discovery', async route => {
    if (route.request().method() === 'POST') {
      writes++;
      await route.fulfill({status: 403, json: {status: 'error', error: {code: 'fixture_forbidden', message: 'No live search in this suite'}}});
    } else await route.continue();
  });
  await page.goto('/');
  await page.getByRole('button', {name: 'Ask Agent', exact: true}).click();
  await page.locator('#agent-mode').selectOption('discovery');
  await expect(page.locator('.authorization-state')).toContainText('Exhausted');
  await expect(page.locator('.authorization-state')).toContainText('0 / 1');
  await expect(page.locator('.control-warnings')).toContainText('Started calls may consume the allowance.');
  await page.locator('#question').fill('Do not search');
  await page.getByRole('button', {name: 'Ask assistant', exact: true}).click();
  await page.locator('#language-settings select').selectOption('zh-Hans');
  await expect(page.locator('.authorization-state')).toContainText('已耗尽');
  expect(writes).toBe(0);
});

test('five-megabyte original-byte batch limit stops draft growth without reading or posting files', async ({page}) => {
  let posts = 0;
  await page.route('**/api/research/batches', async route => {
    if (route.request().method() !== 'GET') { posts++; await route.abort(); return; }
    await route.fulfill({json: {schema_version: 1, data_kind: 'research_candidate_batches', revision: 0, batches: []}});
  });
  await page.goto('/');
  await openIntake(page);
  const form = page.locator('.material-form');
  await form.locator('[name=url]').fill('https://example.test/synthetic-original');
  await form.locator('[name=publisher]').fill('Synthetic publisher');
  await form.locator('[name=title]').fill('Size-limit fixture, not market evidence');
  await form.locator('[name=usage_note]').fill('Synthetic bytes only');
  await form.locator('[name=file]').setInputFiles({name: 'first.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2_500_000, 32)});
  await page.getByRole('button', {name: 'Add material to this draft', exact: true}).click();
  await expect(page.locator('.draft-documents p')).toHaveCount(1);
  await form.locator('[name=file]').setInputFiles({name: 'second.txt', mimeType: 'text/plain', buffer: Buffer.alloc(2_500_001, 32)});
  await page.getByRole('button', {name: 'Add material to this draft', exact: true}).click();
  await expect(page.locator('.research-intake [role=alert]')).toContainText('total batch size must not exceed 5 MB');
  await expect(page.locator('.draft-documents p')).toHaveCount(1);
  expect(await form.locator('[name=file]').evaluate((input: HTMLInputElement) => input.files?.[0]?.name)).toBe('second.txt');
  expect(posts).toBe(0);
});

test('upload and two scalar candidates stage only, then batch approval and a reasoned decision', async ({page}) => {
  let staged = false, approved = false, decided = false;
  const writes: {path: string; body: any; headers: Record<string,string>}[] = [];
  const passive: string[] = [];
  let marketGets = 0;
  page.on('request', request => {
    if (request.method() === 'GET' && new URL(request.url()).pathname === '/api/market') marketGets++;
  });
  await page.route(/\/api\/(chat|discovery)(\/|$)/, async route => {
    if (route.request().method() !== 'POST') { await route.continue(); return; }
    passive.push(route.request().url());
    await route.fulfill({status: 403, json: {status: 'error', error: {code: 'fixture_forbidden', message: 'No live search/model in this suite'}}});
  });
  await page.route('**/api/research/batches**', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') {
      await route.fulfill({json: staged ? batch(approved ? '2026-10-12T00:01:00Z' : null,
        'needs_confirmation', decided ? 'accepted' : 'awaiting_confirmation') :
        {schema_version: 1, data_kind: 'research_candidate_batches', revision: 0, batches: []}});
      return;
    }
    writes.push({path, body: request.postDataJSON(), headers: request.headers()});
    if (path.endsWith('/authorize')) approved = true;
    else if (path.endsWith('/decisions')) decided = true;
    else staged = true;
    await route.fulfill({json: {schema_version: 1}});
  });
  await page.goto('/');
  await openIntake(page);
  expect(writes).toHaveLength(0);
  await page.evaluate(() => { (window as Window & {__intakeMap?: Element | null}).__intakeMap = document.querySelector('#map'); });
  const beforeStageGets = marketGets;
  const form = page.locator('.material-form');
  await form.locator('[name=file]').setInputFiles({name: 'report.txt', mimeType: 'text/plain',
    buffer: Buffer.from('City rent was 100 GBP/sq ft. West End rent was 110 GBP/sq ft.')});
  await form.locator('[name=url]').fill('https://example.org/report.txt');
  await form.locator('[name=publisher]').fill('Fixture Publisher');
  await form.locator('[name=title]').fill('Synthetic original report');
  await form.locator('[name=usage_note]').fill('Fixture material for UI validation only');
  await page.getByRole('button', {name: 'Add material to this draft'}).click();
  const record = page.locator('.candidate-form');
  await record.locator('input[value=rents]').check();
  await record.locator('[name=metric]').fill('achieved_rent');
  await record.locator('[name=label]').fill('City rent');
  await record.locator('[name=value]').fill('100');
  await record.locator('[name=unit]').fill('GBP/sq ft');
  await record.locator('[name=source_geography]').fill('City');
  await record.locator('[name=statistical_window]').fill('2025-YE');
  await record.locator('[name=definition]').fill('Achieved rent');
  await record.locator('[name=quote]').fill('City rent was 100 GBP/sq ft.');
  await record.locator('[name=section]').fill('p.1');
  await record.locator('[name=value_anchor]').fill('100 GBP/sq ft');
  await page.getByRole('button', {name: 'Add candidate to this draft'}).click();
  await record.locator('[name=label]').fill('West End rent');
  await record.locator('[name=value]').fill('110');
  await record.locator('[name=quote]').fill('West End rent was 110 GBP/sq ft.');
  await record.locator('[name=value_anchor]').fill('110 GBP/sq ft');
  await page.getByRole('button', {name: 'Add candidate to this draft'}).click();
  await page.locator('#language-settings select').selectOption('zh-Hant');
  await expect(page.locator('.draft-candidates p')).toHaveCount(2);
  expect(await form.locator('[name=file]').evaluate((input: HTMLInputElement) => input.files?.length)).toBe(1);
  await page.locator('#language-settings select').selectOption('en');
  expect(writes).toHaveLength(0);
  await page.getByRole('button', {name: 'Stage this batch only · do not admit'}).click();
  await expect(page.locator('.intake-batch')).toHaveCount(1);
  expect(writes[0]?.path).toBe('/api/research/batches');
  expect(writes[0]?.body.documents).toHaveLength(1);
  expect(Buffer.from(writes[0]?.body.documents[0].content_base64, 'base64').toString()).toContain('City rent was 100');
  expect(writes[0]?.body.candidates).toHaveLength(2);
  expect(writes[0]?.body.candidates.map((c: any) => c.document_id)).toEqual(['document-1','document-1']);
  expect(writes[0]?.body.candidates[0]).toMatchObject({id: 'candidate-1', topic_ids: ['rents'], kind: 'reported_statistic',
    value: 100, denominator: null, billing_period: null, context_quote: '', value_anchor: '100 GBP/sq ft'});
  expect(writes[0]?.body.documents[0]).toMatchObject({id: 'document-1', published_at: null});
  expect(marketGets).toBe(beforeStageGets); // Staging cannot publish research or refresh market facts.
  expect(passive).toEqual([]);
  await page.getByRole('button', {name: 'Authorize admission for this batch'}).click();
  await expect(page.locator('.intake-candidate').first()).toContainText('Admitted');
  await expect.poll(() => marketGets).toBeGreaterThan(beforeStageGets);
  expect(await page.evaluate(() => document.querySelector('#map') === (window as Window & {__intakeMap?: Element | null}).__intakeMap)).toBe(true);
  const afterApprovalGets = marketGets;
  expect(writes[1]?.body).toEqual({content_revision: 'f'.repeat(64)});
  const pending = page.locator('.intake-candidate').nth(1);
  await expect(pending).toContainText('older-record-7');
  await pending.getByRole('button', {name: 'Accept with reason'}).click();
  expect(writes).toHaveLength(2);
  await pending.locator('.decision-reason').fill('Checked the different definition and original material.');
  await page.locator('#language-settings select').selectOption('zh-Hans');
  await expect(page.locator('.intake-candidate').nth(1).locator('.decision-reason')).toHaveValue('Checked the different definition and original material.');
  await page.locator('#language-settings select').selectOption('en');
  await page.locator('.intake-candidate').nth(1).getByRole('button', {name: 'Accept with reason'}).click();
  await expect(page.locator('.intake-candidate').nth(1)).toContainText('Admitted');
  await expect.poll(() => marketGets).toBeGreaterThan(afterApprovalGets);
  expect(await page.evaluate(() => document.querySelector('#map') === (window as Window & {__intakeMap?: Element | null}).__intakeMap)).toBe(true);
  expect(writes[2]?.body).toEqual({content_revision: 'f'.repeat(64), candidate_id: 'candidate-2', decision: 'accept',
    reason: 'Checked the different definition and original material.'});
  expect(writes.every(write => write.headers['x-office-user-action'] === 'confirm')).toBe(true);
  expect(passive).toEqual([]);
});

test('blocked evidence has no accept action; original strings are text and only HTTPS links are clickable', async ({page}) => {
  const blocked = batch('2026-10-12T00:01:00Z', 'blocked', 'blocked');
  blocked.batches[0]!.candidates[1]!.sources[0]!.url = 'javascript:alert(1)';
  let posts = 0;
  await page.route(/\/api\/(chat|discovery)(\/|$)/, async route => {
    if (route.request().method() === 'POST') posts++;
    await route.fulfill({status:403,json:{status:'error',error:{code:'fixture_forbidden',message:'No live model/search in this suite'}}});
  });
  await page.route('**/api/research/batches**', async route => {
    if (route.request().method() === 'POST') posts++;
    await route.fulfill({json: blocked});
  });
  await page.goto('/');
  await openIntake(page);
  await expect(page.locator('.intake-candidate')).toHaveCount(2);
  const candidate = page.locator('.intake-candidate').nth(1);
  await expect(candidate).toContainText('older-record-7');
  await expect(candidate.getByRole('button', {name: /Accept/})).toHaveCount(0);
  await expect(page.locator('.intake-batch img, .intake-batch svg')).toHaveCount(0);
  await expect(candidate.locator('a')).toHaveCount(0);
  await expect(page.locator('.intake-candidate').first().locator('a[href="https://example.org/report"]')).toHaveCount(1);
  expect(posts).toBe(0);
});
