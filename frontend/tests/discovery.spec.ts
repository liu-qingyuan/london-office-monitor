import {test,expect} from '@playwright/test';

// Real Python source inventory; no model or external search in this suite.
test('reading the real candidate pool does not submit chat or discovery',async({page,request})=>{
  const pool=await (await request.get('/api/discovery')).json();
  const submissions:string[]=[];
  page.on('request',r=>{if(r.method()==='POST' && /\/api\/(chat|discovery)$/.test(r.url()))submissions.push(r.url());});
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
  await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill('Find primary London office reports');
  expect(submissions).toEqual([]);
  await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
  await expect(page.locator('#agent-result')).toContainText('AI source screening · unverified');
  await expect(page.locator('#agent-result')).toContainText('Native Web Search: Metadata unavailable');
  await expect(page.locator('#agent-result .answer-fact')).toHaveCount(0);
  await expect(page.locator('#agent-result .view-answer-market')).toHaveCount(0);
  expect(submissions).toEqual([{question:'Find primary London office reports',
    topic_ids:['rents','vacancy','leasing','supply','submarkets','macro','demand','news'],context:{area_id:'city'}}]);
});
