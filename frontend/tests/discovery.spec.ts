import {test,expect} from '@playwright/test';

// Synthetic authorized state only. These tests never obtain or spend a real allowance.
const activeAuthorization = {
  schema_version: 1, status: 'active', authorization_id: 'fixture-existing', authorization_source: 'web',
  authorized_at: '2026-10-12T00:00:00Z', expires_at: '2099-01-01T00:00:00Z',
  google: {cap: 2, starts: 0, remaining: 2}, model_turns: {cap: 2, starts: 0, remaining: 2}, warnings: []
};

test.beforeEach(async ({page}) => {
  await page.route('**/api/chat', route => route.fulfill({status:403,json:{status:'error',error:{code:'fixture_forbidden',message:'No live model in this suite'}}}));
});

for (const scenario of [
  {code:'discovery_authorization_required', message:'An existing, explicitly authorized budget receipt is required; no automatic renewal.',
    text:{en:'No usable search authorization is bound to this request.', 'zh-Hans':'本次请求未绑定可用的搜索授权。', 'zh-Hant':'本次請求未綁定可用的搜尋授權。'}},
  {code:'discovery_authorization_expired', message:'Source-discovery authorization has expired; a new explicit approval is required.',
    text:{en:'The search authorization has expired.', 'zh-Hans':'搜索授权已过期。', 'zh-Hant':'搜尋授權已過期。'}},
  {code:'model_budget_exhausted', message:'Authorized model starts exhausted; no retry, renewal or API-key fallback.',
    text:{en:'The authorized model allowance has been used.', 'zh-Hans':'本次已授权的模型次数已用完。', 'zh-Hant':'本次已授權的模型次數已用完。'}}
]) {
  test(`discovery authorization feedback is readable in all languages: ${scenario.code}`, async ({page}) => {
    let submissions=0, grants=0;
    await page.route('**/api/discovery/authorization', route => {
      if (route.request().method() === 'POST') grants++;
      return route.fulfill({json:activeAuthorization});
    });
    // Synthetic discovery response; this test must never spend live discovery allowance.
    await page.route('**/api/discovery', async route => {
      if(route.request().method()!=='POST'){await route.continue();return;}
      submissions++;
      await route.fulfill({status:503,json:{status:'error',error:{code:scenario.code,message:scenario.message}}});
    });
    await page.goto('/');
    await page.getByRole('button',{name:'Ask Agent',exact:true}).click();
    await page.locator('#agent-mode').selectOption('discovery');
    await expect(page.locator('.authorization-state')).toContainText('Active');
    await page.locator('#question').fill('Fixture request, do not execute a real search');
    await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
    for (const language of ['en','zh-Hans','zh-Hant'] as const) {
      await page.locator('#language-settings select').selectOption(language);
      await expect(page.locator('#agent-result [role="alert"]')).toContainText(scenario.text[language]);
      await expect(page.locator('#agent-result [role="alert"]')).not.toContainText(scenario.message);
    }
    expect(submissions).toBe(1);
    expect(grants).toBe(0);
  });
}

// Real Python source inventory; no model or external search in this suite.
test('reading the real candidate pool does not submit chat or discovery',async({page,request})=>{
  const pool=await (await request.get('/api/discovery')).json();
  const submissions:string[]=[];
  await page.route(/\/api\/(chat|discovery|research)(\/|$)/, async route => {
    if (route.request().method() !== 'POST') {await route.continue();return;}
    submissions.push(route.request().url());
    await route.fulfill({status:403,json:{status:'error',error:{code:'fixture_forbidden',message:'No live operation in this test'}}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Ask Agent',exact:true}).click();
  await expect(page.getByRole('button',{name:'View source pool',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'View source pool',exact:true}).click();
  await expect(page.locator('.source-pool-summary')).toContainText(`${pool.source_count} exact URL strings`);
  await expect(page.locator('.source-topic')).toHaveCount(8);
  await expect(page.locator('#agent-result')).toContainText('Not verified market observations');
  await expect(page.locator('#agent-result .answer-fact')).toHaveCount(0);
  expect(submissions).toEqual([]);
});

test('only explicit discovery submits search; fixture screening stays separate from facts and map scope',async({page,request})=>{
  const pool=await (await request.get('/api/discovery')).json();
  const submissions:unknown[]=[];
  let grants=0;
  await page.route('**/api/discovery/authorization', route => {
    if (route.request().method() === 'POST') grants++;
    return route.fulfill({json:activeAuthorization});
  });
  // This AI-screening DTO is synthetic, not a live-model/search acceptance.
  await page.route('**/api/discovery',async route=>{
    if(route.request().method()!=='POST'){await route.continue();return;}
    submissions.push(route.request().postDataJSON());
    await route.fulfill({json:{schema_version:1,data_kind:'source_discovery',run_id:'offline-ui-source-fixture',status:'partial',
      assessment:'Fixture source screening: document contents remain unverified.',assessment_basis:'ai_generated_source_screening',
      pool,selected_candidate_ids:[],tool_calls:[],warnings:['Source metadata is not market evidence.'],
      provider_states:{serpapi_google:{status:'completed_metadata_only',successful_runs:1},
        codex_native:{status:'metadata_unavailable',searches_started_observed:1,searches_completed_observed:1,candidate_occurrences_captured:0,http_request_count:null}}}});
  });
  await page.goto('/');
  await page.getByRole('button',{name:'Ask Agent',exact:true}).click();
  await expect(page.getByRole('combobox',{name:'Assistant operation',exact:true})).toBeVisible();
  await page.getByRole('combobox',{name:'Assistant operation',exact:true}).selectOption('discovery');
  await expect(page.locator('.authorization-state')).toContainText('Active');
  await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill('Find primary London office reports');
  expect(submissions).toEqual([]);
  await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
  await expect(page.locator('#agent-result')).toContainText('AI source screening · unverified');
  await expect(page.locator('#agent-result')).toContainText('Native Web Search: Metadata unavailable');
  await expect(page.locator('#agent-result .answer-fact')).toHaveCount(0);
  await expect(page.locator('#agent-result .view-answer-market')).toHaveCount(0);
  expect(submissions).toEqual([{question:'Find primary London office reports',
    topic_ids:['rents','vacancy','leasing','supply','submarkets','macro','demand','news'],context:{area_id:'city'},authorization_id:'fixture-existing'}]);
  expect(grants).toBe(0);
});
