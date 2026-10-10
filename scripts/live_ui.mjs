// Two REAL model requests against this project's already-running local server.
// Separate from offline E2E: never mock /api/chat or retry a model turn.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {writeFile} from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'frontend/.pw-browsers');
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const {chromium, expect} = require('@playwright/test');
const browser = await chromium.launch({args: ['--enable-webgl','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const evidence = {kind:'real_model_ui_multiturn',base_url:'http://127.0.0.1:8017',turns:[],passed:false};
try {
  const page = await browser.newPage({viewport:{width:1440,height:1100}});
  const catalog = await (await page.request.get(evidence.base_url+'/api/catalog')).json();
  if (!catalog.agent.enabled || catalog.agent.auth_mode !== 'subscription') throw new Error('Real UI smoke requires explicit subscription-mode local server');
  await page.goto(evidence.base_url);
  await expect(page.locator('.area-row')).toHaveCount(4);
  await page.getByRole('button',{name:'Submarkets',exact:true}).click();
  await page.getByRole('button',{name:'Ask Agent',exact:true}).first().click();
  const questions = [
    'Compare City overall vacancy in the two historical report periods. Use the Python calculation and show percentage points, not Grade A tower vacancy. Keep answer/warnings qualitative; Python cards carry all figures and dates.',
    'Now, is there a verified comparable average prime achieved rent observation for Canary Wharf in the selected report period? Do not estimate. Keep answer/warnings qualitative; Python fact cards show missingness.'
  ];
  for (let i=0;i<questions.length;i++) {
    if (i===1) {
      await expect.poll(() => page.evaluate(() => window.__officeMapDebug?.state().geometryCount)).toBe(4);
      // The detailed City view does not place Canary Wharf inside the canvas.
      // Use the actual zoom controls before projecting and clicking its selector.
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().zoom)).toBeLessThan(13.2);
      await page.getByRole('button',{name:'Zoom out',exact:true}).click();
      await expect.poll(()=>page.evaluate(()=>window.__officeMapDebug.state().zoom)).toBeLessThan(12.2);
      const area=catalog.areas.find(a=>a.id==='canary_wharf');
      const point=await page.evaluate(center=>window.__officeMapDebug.project(center),area.center);
      const box=await page.locator('#map').boundingBox();
      await page.mouse.click(box.x+point.x,box.y+point.y);
      await expect(page.locator('.area-row[data-area="canary_wharf"]')).toHaveAttribute('aria-pressed','true');
    }
    await page.getByRole('textbox',{name:'YOUR QUESTION'}).fill(questions[i]);
    const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/chat')&&r.request().method()==='POST',{timeout:180000});
    await page.getByRole('button',{name:'Ask assistant'}).click();
    const response=await responsePromise;
    const answer=await response.json();
    evidence.turns.push({question:questions[i],http_status:response.status(),answer});
    if (response.status()!==200 || answer.status!=='completed') throw new Error(JSON.stringify(answer));
    if (i===0) {
      const change=answer.calculations.find(c=>c.area_id==='city'&&c.metric==='vacancy_rate');
      if (change?.change_value!==-0.9 || change.change_unit!=='percentage points') throw new Error('Wrong vacancy calculation');
    } else {
      const fact=answer.facts.find(f=>f.area_id==='canary_wharf'&&f.metric==='prime_rent');
      if (fact?.status!=='missing' || fact.value!==null || fact.source_id!==null) throw new Error('Missingness was invented or converted to zero');
      if (answer.session_id!==evidence.turns[0].answer.session_id) throw new Error('UI did not preserve the actual SDK conversation');
    }
    await expect(page.locator('#agent-result .answer')).toBeVisible();
    await expect(page.locator('#agent-result')).toContainText(answer.run_id);
    await page.locator('#agent-result').screenshot({path:resolve(root,`artifacts/live-agent-${i+1}.png`)});
  }
  evidence.passed=true;
  await page.screenshot({path:resolve(root,'artifacts/dashboard-live.png'),fullPage:true});
  console.log('Real UI two-turn Agent validation passed; actual Python vacancy and missingness, same SDK session.');
} catch(error) {
  evidence.error=String(error);
  console.error(evidence.error);
  process.exitCode=1;
} finally {
  await writeFile(resolve(root,'artifacts/live-ui.json'),JSON.stringify(evidence,null,2));
  await browser.close();
}
