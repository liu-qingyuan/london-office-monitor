import {test,expect} from '@playwright/test';
import {openSection} from './navigation';
import {readFileSync} from 'node:fs';
import {mkdir} from 'node:fs/promises';
import type {ChatResult,Market} from '../src/types';

// Saved real run, not a new model response. The expected DTO includes the
// actual output recorded by each Python tool, verified separately at its Seam.
const recorded=JSON.parse(readFileSync(new URL('./fixtures/city-rent-recorded-run.json',import.meta.url),'utf8')) as {
  question:string; context:{area_id:string;metric:string;period:string}; response:ChatResult;
};

test('selected content survives pointer leave and keyboard navigation can close the workspace',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const chats:string[]=[];
  page.on('request',r=>{if(r.url().endsWith('/api/chat'))chats.push(r.url());});
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  const panel=page.locator('.inspector');
  await openSection(page);
  await expect(page.locator('#workspace-nav')).toBeVisible();
  await expect(page.locator('#panel-title')).toHaveText('Submarkets');
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  await page.mouse.move(600,740);
  await expect(panel).toBeVisible();
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await expect(panel).toBeHidden();
  const entry=page.getByRole('button',{name:'Submarkets',exact:true});
  await page.keyboard.press('Tab');
  await entry.focus();
  await expect(page.locator('#workspace-nav')).toHaveClass(/labels-open/);
  await entry.press('Enter');
  await expect(panel).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(panel).toBeHidden();
  await expect(page.locator('#workspace-nav')).toHaveCSS('width','64px');
  expect(chats).toEqual([]);
});

test('recorded real City answer shows data immediately, preserves its scope, and exposes exact tool input/output',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const submissions:unknown[]=[];
  await page.route('**/api/chat',async route=>{
    submissions.push(route.request().postDataJSON());
    await route.fulfill({json:recorded.response});
  });
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await openSection(page);
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await page.getByRole('button',{name:'Average Grade A rent',exact:true}).click();
  await page.getByRole('button',{name:'2024 year-end',exact:true}).click();
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill(recorded.question);
  await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
  const result=page.locator('#agent-result');
  await expect(result.locator('.answer')).toBeVisible();
  await expect(result.getByText('£105.26 / sq ft',{exact:false}).first()).toBeVisible();
  await expect(result.locator('#answer-scope')).toContainText('City');
  await expect(result.locator('#answer-scope')).not.toContainText('Canary Wharf');
  await expect(result.locator('#answer-question')).toContainText(recorded.question);
  await expect(result.locator('.snapshot-chart .chart-bar')).toHaveCount(2);
  await expect(result.locator('.comparison')).toContainText('+6.75 %');
  await expect(result.locator('.comparison')).toContainText('6.8%');
  await expect(result.locator('.answer-source')).toHaveCount(2);
  await expect(page.locator('#agent-context')).toContainText('Map selection: Canary Wharf');
  expect(submissions).toEqual([{question:recorded.question,context:recorded.context}]);
  await mkdir('../artifacts/left-detail',{recursive:true});
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug!.state().moving)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug!.state().renderedBuildingCount),{timeout:30000}).toBeGreaterThan(20);
  await page.screenshot({path:'../artifacts/left-detail/recorded-city-answer-e2e.png'});
  const call=result.locator('.tool-call').first();
  await call.locator('summary').first().click();
  await expect(call.locator('.tool-arguments')).toContainText('"area": "city"');
  await expect(call.locator('.tool-arguments')).toContainText('"metric": "prime_rent"');
  await call.getByText('Complete Python output (JSON)',{exact:false}).click();
  await expect(call.locator('.tool-output')).toBeVisible();
  await expect(call.locator('.tool-output')).toContainText('"change_value": 6.75');
  await expect(call.locator('.tool-output')).toHaveText(JSON.stringify(recorded.response.tool_calls[0]!.output,null,2));
  await call.locator('.tool-arguments').scrollIntoViewIfNeeded();
  await page.screenshot({path:'../artifacts/left-detail/recorded-tool-output-e2e.png'});
  await result.getByRole('button',{name:'View City on map',exact:true}).click();
  await expect(page.locator('.inspector')).toBeVisible();
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  await expect(page.getByRole('button',{name:'Average prime rent',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.getByRole('button',{name:'2025 year-end',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(result.locator('#answer-scope')).toContainText('City');
  expect(submissions).toHaveLength(1);
});

test('offline missing payload renders genuine Python nulls without estimated values or zero bars',async({page,request})=>{
  // Real local Market payload with test prose. This is a UI regression fixture,
  // not an SDK/model answer or evidence of autonomous research.
  const data=await (await request.get('/api/market?area=canary_wharf&metric=prime_rent&period=2025-YE')).json() as Market;
  const response:ChatResult={schema_version:1,session_id:'offline-fixture',run_id:'offline-missing-ui-fixture',status:'completed',
    answer:'No comparable source-backed rent is available for this area in the reviewed snapshot.',
    facts:data.observations,calculations:data.comparisons,sources:data.sources,evidence:data.evidence,notes:[],warnings:data.warnings,
    tool_calls:[{name:'market_query',arguments:{area:'canary_wharf',metric:'prime_rent',period:'2025-YE'},ok:true,output:{...data}}]};
  expect(response.facts[0]?.value).toBeNull();
  await page.route('**/api/chat',r=>r.fulfill({json:response}));
  await page.goto('/');
  await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill('What rent evidence is available for Canary Wharf?');
  await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
  await expect(page.locator('#answer-scope')).toContainText('Canary Wharf');
  await expect(page.locator('.answer-fact')).toContainText('No verified data');
  await expect(page.locator('.answer-data .chart-bar')).toHaveCount(0);
  await expect(page.locator('.answer-data')).not.toContainText('£0');
  await expect(page.locator('.answer-data')).toContainText('Missing is not zero');
  await expect(page.locator('.answer .comparison')).toContainText('Not calculated');
});

test.describe('touch icon navigation',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true});
  test('first touch reveals labels and next touch selects content without hover',async({page})=>{
    await page.goto('/');
    const entry=page.getByRole('button',{name:'Submarkets',exact:true});
    await expect(page.locator('.inspector')).toBeHidden();
    await entry.tap();
    await expect(page.locator('#workspace-nav')).toHaveClass(/labels-open/);
    await expect(page.locator('.inspector')).toBeHidden();
    await page.getByRole('button',{name:'Submarkets',exact:true}).tap();
    await expect(page.locator('.inspector')).toBeVisible();
    await expect(page.locator('.workspace-nav-item[data-section="market"]')).toHaveAttribute('aria-pressed','true');
    await expect(page.getByRole('button',{name:'Reset map',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Reset map',exact:true}).tap();
    await expect(page.locator('.inspector')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Close workspace',exact:true}).tap();
    await expect(page.locator('.inspector')).toBeHidden();
    await expect(entry).toBeVisible();
  });
});
