// Production UI capture with a labelled saved-real-run replay. ZERO SDK turns.
// /api/chat is intercepted before navigation; unexpected submits are aborted.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
const root=fileURLToPath(new URL('../',import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH=resolve(root,'frontend/.pw-browsers');
const {chromium,expect}=createRequire(new URL('../frontend/package.json',import.meta.url))('@playwright/test');
const fixture=JSON.parse(await readFile(resolve(root,'frontend/tests/fixtures/city-rent-recorded-run.json'),'utf8'));
const dir=resolve(root,'artifacts/left-detail');
const openSection=async(page,name='Submarkets')=>{
  await page.getByRole('button',{name,exact:true}).click();
};
await mkdir(dir,{recursive:true});
const record={kind:'production_integrated_left_details_amber_area_and_real_buildings_with_recorded_real_run_replay',url:'http://127.0.0.1:8017',recorded_run_id:fixture.recorded_run_id,
  design_references:['test1.png','https://developer.apple.com/design/human-interface-guidelines/tab-bars',
    'https://developer.apple.com/tutorials/images/com.apple.HIG/visionos-tab-bar-collapsed@2x.png',
    'https://developer.apple.com/tutorials/images/com.apple.HIG/visionos-tab-bar-expanded@2x.png'],
  model_requests_this_script:0,replayed_requests:0,errors:[],passed:false,
  limits:['Recorded answer is not a new SDK response','CSS glass, not native Apple Liquid Glass','User visual acceptance pending','No research/publication implementation']};
const browser=await chromium.launch({args:['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{
  const page=await browser.newPage({viewport:{width:1600,height:1000}});
  let replayAllowed=false;
  page.on('pageerror',error=>record.errors.push(error.message));
  await page.route('**/api/chat',async route=>{
    const request=route.request().postDataJSON();
    if(!replayAllowed||request.question!==fixture.question||JSON.stringify(request.context)!==JSON.stringify(fixture.context)){
      record.errors.push('Unexpected chat request was aborted, not sent to SDK');await route.abort();return;
    }
    replayAllowed=false;record.replayed_requests++;
    await route.fulfill({json:fixture.response});
  });
  await page.goto(record.url);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug?.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  await expect(page.locator('.inspector')).toBeHidden();
  await page.screenshot({path:resolve(dir,'default-map-production.png')});
  await expect(page.locator('#workspace-nav')).toHaveCSS('width','64px');
  await expect(page.locator('.explore-orb, #market-toggle')).toHaveCount(0);
  record.collapsed_navigation_bounds=await page.locator('#workspace-nav').boundingBox();
  expect(record.collapsed_navigation_bounds.x).toBeGreaterThan(1500);
  record.collapsed_icon_bounds=await page.locator('.nav-item-icon').first().boundingBox();
  record.default_icon_count=await page.locator('#workspace-nav .nav-item-icon').count();
  await page.locator('#workspace-nav').screenshot({path:resolve(dir,'navigation-collapsed.png')});
  await page.getByRole('button',{name:'Submarkets',exact:true}).hover();
  await expect(page.locator('#workspace-nav')).toHaveCSS('width','248px');
  record.expanded_icon_bounds=await page.locator('.nav-item-icon').first().boundingBox();
  record.expanded_label_bounds=await page.locator('.nav-item-label').first().boundingBox();
  expect(Math.abs(record.expanded_icon_bounds.x-record.collapsed_icon_bounds.x)).toBeLessThan(2);
  expect(record.expanded_label_bounds.x+record.expanded_label_bounds.width).toBeLessThan(record.expanded_icon_bounds.x);
  await expect(page.locator('.inspector')).toBeHidden();
  await expect(page.locator('#workspace-nav')).toBeVisible();
  await expect(page.locator('#workspace-nav')).toHaveCSS('opacity','1');
  await expect(page.locator('#workspace-nav [data-section]')).toHaveCount(9);
  record.navigation_material=await page.locator('#workspace-nav').evaluate(e=>{const s=getComputedStyle(e);return{backdropFilter:s.backdropFilter,background:s.backgroundColor,radius:s.borderRadius,ancestorBackdropFilter:getComputedStyle(e.parentElement).backdropFilter};});
  await page.screenshot({path:resolve(dir,'hover-navigation-production.png')});
  await page.locator('#workspace-nav').screenshot({path:resolve(dir,'navigation-expanded.png')});
  await page.getByRole('button',{name:'Macro economy',exact:true}).click();
  await page.mouse.move(200,50);
  await expect(page.locator('#workspace-nav')).toHaveCSS('width','64px');
  await expect(page.locator('#section-content')).toContainText('Not connected');
  await expect(page.locator('.inspector')).toHaveCSS('opacity','1');
  await page.screenshot({path:resolve(dir,'macro-section-production.png')});
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await openSection(page,'Rents');
  await expect(page.locator('.snapshot-chart .chart-bar')).toHaveCount(2);
  await expect(page.locator('.inspector')).toHaveCSS('opacity','1');
  await page.mouse.move(200,50);
  await expect(page.locator('#workspace-nav')).toHaveCSS('width','64px');
  await expect(page.locator('#detail-content .selected-observation')).toContainText('2025 year-end');
  await expect(page.locator('#detail-content .evidence-card summary')).toHaveCount(2);
  record.left_layout=await page.evaluate(()=>({
    map:document.querySelector('#map').getBoundingClientRect().toJSON(),
    panel:document.querySelector('#market-panel').getBoundingClientRect().toJSON(),
    panelRadius:getComputedStyle(document.querySelector('#market-panel')).borderRadius
  }));
  expect(record.left_layout.panel.x).toBe(0);
  expect(record.left_layout.panel.y).toBe(88);
  expect(record.left_layout.panel.bottom).toBe(1000);
  expect(record.left_layout.map.x).toBe(record.left_layout.panel.right);
  expect(record.left_layout.panelRadius).toBe('0px');
  await page.screenshot({path:resolve(dir,'rents-section-production.png')});
  await page.locator('.area-row[data-area="city"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().moving)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  await page.mouse.move(200,50);
  record.selected_city_map=await page.evaluate(()=>window.__officeMapDebug.state());
  await page.screenshot({path:resolve(dir,'selected-city-buildings-production.png')});
  await page.locator('#detail-content .evidence-card summary').first().click();
  await expect(page.locator('#detail-content .evidence-body blockquote').first()).toBeVisible();
  await page.screenshot({path:resolve(dir,'source-evidence-production.png')});
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await openSection(page,'Supply pipeline');
  await expect(page.locator('#section-content .event-card')).toHaveCount(1);
  await expect(page.locator('.inspector')).toHaveCSS('opacity','1');
  await page.screenshot({path:resolve(dir,'supply-section-production.png')});
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await openSection(page);
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await expect(page.locator('#detail-content .detail-pill')).toHaveText('COVERAGE GAP');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(0);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().moving)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  record.selected_missing_map=await page.evaluate(()=>window.__officeMapDebug.state());
  await page.mouse.move(200,50);
  await page.screenshot({path:resolve(dir,'canary-wharf-gap-production.png')});
  await page.getByRole('button',{name:'Average Grade A rent',exact:true}).click();
  await page.getByRole('button',{name:'2024 year-end',exact:true}).click();
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill(fixture.question);
  replayAllowed=true;
  await page.getByRole('button',{name:'Ask assistant',exact:true}).click();
  await expect(page.locator('#answer-scope')).toContainText('City');
  await expect(page.locator('.answer-fact').last()).toContainText('£105.26');
  await expect(page.locator('.answer .comparison')).toContainText('+6.75 %');
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug?.state().moving)).toBe(false);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug?.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  record.map=await page.evaluate(()=>window.__officeMapDebug.state());
  record.material=await page.locator('.agent-expansion').evaluate(e=>{const s=getComputedStyle(e);return{backdropFilter:s.backdropFilter,background:s.backgroundColor,radius:s.borderRadius,ancestorBackdropFilter:getComputedStyle(e.parentElement).backdropFilter};});
  await page.screenshot({path:resolve(dir,'recorded-answer-production.png')});
  const call=page.locator('.tool-call').first();
  await call.locator('summary').first().click();
  await call.getByText('Complete Python output (JSON)',{exact:false}).click();
  await expect(call.locator('.tool-output')).toHaveText(JSON.stringify(fixture.response.tool_calls[0].output,null,2));
  await call.locator('.tool-arguments').scrollIntoViewIfNeeded();
  await page.screenshot({path:resolve(dir,'recorded-tool-output-production.png')});
  await page.locator('#agent-result').getByRole('button',{name:'View City on map',exact:true}).click();
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  await expect(page.locator('#answer-scope')).toContainText('City');
  await page.locator('#agent-expansion').evaluate(e=>e.scrollTop=0);
  await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().moving)).toBe(false);
  await page.screenshot({path:resolve(dir,'recorded-answer-and-left-detail-production.png')});
  await page.getByRole('button',{name:'Close Agent',exact:true}).click();
  const mobile=await browser.newPage({viewport:{width:390,height:844},hasTouch:true});
  mobile.on('pageerror',error=>record.errors.push(error.message));
  await mobile.route('**/api/chat',async route=>{record.errors.push('Unexpected mobile chat aborted');await route.abort();});
  await mobile.goto(record.url);
  await expect.poll(()=>mobile.evaluate(()=>window.__officeMapDebug?.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  await mobile.screenshot({path:resolve(dir,'mobile-rail-production.png')});
  await mobile.getByRole('button',{name:'Submarkets',exact:true}).tap();
  await expect(mobile.locator('#workspace-nav')).toHaveClass(/labels-open/);
  await expect(mobile.locator('.inspector')).toBeHidden();
  await mobile.screenshot({path:resolve(dir,'mobile-navigation-production.png')});
  await mobile.getByRole('button',{name:'Submarkets',exact:true}).tap();
  await expect(mobile.locator('.inspector')).toBeVisible();
  await expect(mobile.locator('.inspector')).toHaveCSS('opacity','1');
  record.mobile_layout=await mobile.evaluate(()=>({
    map:document.querySelector('#map').getBoundingClientRect().toJSON(),
    panel:document.querySelector('#market-panel').getBoundingClientRect().toJSON()
  }));
  expect(record.mobile_layout.panel.x).toBe(0);
  expect(record.mobile_layout.panel.width).toBe(390);
  expect(record.mobile_layout.panel.y).toBe(record.mobile_layout.map.bottom);
  expect(record.mobile_layout.panel.bottom).toBe(844);
  await mobile.screenshot({path:resolve(dir,'mobile-details-production.png')});
  await mobile.locator('.area-row[data-area="canary_wharf"]').tap();
  await expect(mobile.locator('#detail-content h3')).toHaveText('Canary Wharf');
  await expect(mobile.locator('#detail-content .chart-bar')).toHaveCount(0);
  await expect.poll(()=>mobile.evaluate(()=>window.__officeMapDebug.state().moving)).toBe(false);
  await expect.poll(()=>mobile.evaluate(()=>window.__officeMapDebug.state().renderedBuildingCount),{timeout:35000}).toBeGreaterThan(20);
  await mobile.locator('#detail-content .snapshot-chart').scrollIntoViewIfNeeded();
  await mobile.screenshot({path:resolve(dir,'mobile-gap-chart-production.png')});
  expect(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(record.errors.length||record.replayed_requests!==1)throw new Error(JSON.stringify(record.errors));
  record.passed=true;
}catch(error){record.error=String(error);process.exitCode=1;}
finally{
  record.executed_at=new Date().toISOString();
  await writeFile(resolve(dir,'production-verification.json'),JSON.stringify(record,null,2));
  console.log(JSON.stringify(record,null,2));await browser.close();
}
