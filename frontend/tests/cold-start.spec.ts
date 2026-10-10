import {test,expect,type Page} from '@playwright/test';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const state = (page: Page) => page.evaluate(()=>window.__officeMapDebug!.state());
const artifactDir = process.env.OFFICE_EVIDENCE_DIR ? `${process.env.OFFICE_EVIDENCE_DIR}/cold` : '../artifacts/ticket-4';
const userRenderer = process.env.OFFICE_USER_RENDERER==='1';
// The complete regression runs every scenario once. Explicit performance
// acceptance repeats the identical input in three independent contexts.
const samples = userRenderer && process.env.OFFICE_PERFORMANCE_REPEAT==='1' ? 3 : 1;
test.describe.configure({retries:0});

test('pending background degrades by the first navigation deadline while business stays usable',async({page},testInfo)=>{
  test.skip(!userRenderer,'First-navigation presentation budgets use the user renderer; SwiftShader functional failover is covered by market.spec.ts.');
  test.setTimeout(19000);
  await page.setViewportSize({width:1600,height:1000});
  await page.addInitScript(()=>{
    const probe = {status:[] as {at:number;text:string}[],longTasks:[] as {startTime:number;duration:number}[]};
    Object.assign(window,{__deadlineProbe:probe});
    new MutationObserver(()=>{
      const text = document.querySelector('#map-state')?.textContent ?? '';
      if (text && probe.status.at(-1)?.text!==text) probe.status.push({at:performance.now(),text});
    }).observe(document,{subtree:true,childList:true,characterData:true});
    new PerformanceObserver(list=>{ for (const entry of list.getEntries()) probe.longTasks.push({startTime:entry.startTime,duration:entry.duration}); }).observe({type:'longtask',buffered:true});
  });
  const client = await page.context().newCDPSession(page);
  if (process.env.TICKET4_PROFILE) { await client.send('Profiler.enable'); await client.send('Profiler.start'); }
  // Explicit fault injection, not normal-map acceptance: a delayed application
  // bundle followed by a map style request that never completes.
  await page.route('**/assets/index-*.js',async route=>{
    await new Promise(resolve=>setTimeout(resolve,700));
    await route.continue();
  });
  await page.route('https://tiles.openfreemap.org/styles/dark',()=>{});
  let chats = 0;
  await page.route('**/api/chat',route=>{ chats++; return route.abort(); });
  try {
    await page.goto('/',{waitUntil:'domcontentloaded'});
    await page.getByRole('button',{name:'Rents',exact:true}).click();
    await expect(page.locator('#detail-content .selected-observation')).toContainText('£105.26');
    await page.locator('.area-row[data-area="west_end"]').click();
    await expect(page.locator('#detail-content .selected-observation')).toContainText('£166.61');
    await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
    await page.getByRole('button',{name:'2024 year-end',exact:true}).click();
    await expect(page.locator('#detail-content .selected-observation')).toContainText('£157.50');
    const business = await page.screenshot();
    const businessPresentedUpperMs = await page.evaluate(()=>performance.now());
    await testInfo.attach('usable-before-background',{body:business,contentType:'image/png'});
    expect(businessPresentedUpperMs).toBeLessThanOrEqual(2000);
    const remaining = await page.evaluate(()=>15000-performance.now());
    await page.waitForFunction(()=>document.querySelector('#map-state')?.textContent?.includes('Background service unavailable'),undefined,{polling:50,timeout:Math.max(1,remaining)});
    const degraded = await page.screenshot();
    const degradedPresentedUpperMs = await page.evaluate(()=>performance.now());
    await testInfo.attach('navigation-degradation',{body:degraded,contentType:'image/png'});
    console.log(JSON.stringify({fault:'700ms application bundle delay + pending remote style',businessPresentedUpperMs,degradedPresentedUpperMs,chats}));
    expect(degradedPresentedUpperMs).toBeLessThanOrEqual(15000);
    await expect.poll(()=>state(page)).toMatchObject({baseMapStatus:'unavailable',webgl2:true,interleaved:true,geometryCount:4});
    await expect(page.locator('#detail-content .selected-observation')).toContainText('£157.50');
    // The earlier real West End selection focused that camera even while the
    // style was pending. Bring City into view before measuring its GPU pick.
    await page.getByRole('button',{name:'Reset map',exact:true}).click();
    await page.waitForFunction(()=>!window.__officeMapDebug!.state().moving);
    const point = await page.evaluate(()=>window.__officeMapDebug!.project([-.089,51.516])!);
    const box = (await page.locator('#map').boundingBox())!;
    expect(point.x).toBeGreaterThan(0); expect(point.x).toBeLessThan(box.width);
    expect(point.y).toBeGreaterThan(0); expect(point.y).toBeLessThan(box.height);
    await page.mouse.click(box.x+point.x,box.y+point.y);
    await expect(page.locator('#detail-content h3')).toHaveText('City');
    await expect(page.locator('#detail-content .selected-observation')).toContainText('£98.60');
    expect(chats).toBe(0);
  } finally {
    await mkdir(artifactDir,{recursive:true});
    if (process.env.TICKET4_PROFILE) {
      const {profile} = await client.send('Profiler.stop');
      await writeFile(`${artifactDir}/${process.env.TICKET4_PROFILE}-pending-cpu-profile.json`,JSON.stringify(profile));
    }
    const evidence = await page.evaluate(()=>({at:performance.now(),probe:(window as unknown as {__deadlineProbe:unknown}).__deadlineProbe,status:document.querySelector('#map-state')?.textContent,state:window.__officeMapDebug?.state(),resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON())}));
    await writeFile(`${artifactDir}/${process.env.TICKET4_EVIDENCE ?? process.env.TICKET4_PROFILE ?? 'deadline'}-pending.json`,JSON.stringify({fault:'700ms application bundle delay + pending remote style',...evidence,chats},null,2));
  }
});

test('explicit vector background failure promptly preserves real data and GPU selectors',async({page},testInfo)=>{
  test.skip(!userRenderer,'Prompt presented-error latency uses the user renderer; software failover is measured separately.');
  test.setTimeout(8000);
  await page.setViewportSize({width:1600,height:1000});
  let failedAt = 0;
  await page.route(/tiles\.openfreemap\.org\/planet/,async route=>{
    if (!failedAt) failedAt = await page.evaluate(()=>performance.now());
    await route.abort('failed');
  });
  let chats = 0;
  await page.route('**/api/chat',route=>{ chats++; return route.abort(); });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#map-state')).toContainText('Background service unavailable');
  const presented = await page.screenshot();
  const failurePresentedUpperMs = await page.evaluate(()=>performance.now());
  expect(failedAt).toBeGreaterThan(0);
  expect(failurePresentedUpperMs-failedAt).toBeLessThanOrEqual(1000);
  await expect.poll(()=>state(page)).toMatchObject({baseMapStatus:'unavailable',interleaved:true,webgl2:true,geometryCount:4});
  const point = await page.evaluate(()=>window.__officeMapDebug!.project([-.089,51.516])!);
  const box = (await page.locator('#map').boundingBox())!;
  await page.mouse.click(box.x+point.x,box.y+point.y);
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  await expect(page.locator('#detail-content .selected-observation')).toContainText('£105.26');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
  await testInfo.attach('vector-failure',{body:presented,contentType:'image/png'});
  console.log(JSON.stringify({fault:'remote vector TileJSON aborted',failedAt,failurePresentedUpperMs,chats}));
  expect(chats).toBe(0);
});

test('WebGL unavailable explicitly retains list selection, historical data and sources',async({page})=>{
  // A capability failure injection, never a fake canvas or a normal-map sample.
  await page.addInitScript(()=>{
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(this: HTMLCanvasElement,...args: Parameters<typeof getContext>) {
      if (String(args[0]).startsWith('webgl')) return null;
      return getContext.apply(this,args);
    } as typeof getContext;
  });
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#map-state')).toContainText('WebGL2 unavailable · map cannot render');
  await expect.poll(()=>state(page)).toMatchObject({baseMapStatus:'unavailable',webgl2:false,interleaved:false});
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  await page.locator('.area-row[data-area="west_end"]').click();
  await expect(page.locator('#detail-content .selected-observation')).toContainText('£166.61');
  await page.locator('#detail-content .evidence-card').last().locator('summary').click();
  await expect(page.locator('#detail-content .evidence-card').last().locator('blockquote')).toContainText('£166.61');
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await expect(page.locator('#detail-content .detail-pill')).toHaveText('COVERAGE GAP');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(0);
});

test('Market Interface failure is an API error, not a missing observation or background error',async({page})=>{
  // Isolate the workspace error path; normal real background has its own tests.
  await page.route('https://tiles.openfreemap.org/**',route=>route.abort());
  await page.route('**/api/market?*',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({status:'error',error:{code:'market_test_failure',message:'Injected Market failure'}})}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  await expect(page.locator('#global-status')).toContainText('Market API error · market_test_failure');
  await expect(page.locator('#detail-content')).toContainText('This is not a missing observation');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await expect(page.locator('.area-row[data-area="city"]')).toContainText('Market API unavailable');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(0);
  await expect(page.locator('#map-state')).toContainText('Background service unavailable');
  await page.getByRole('button',{name:'Vacancy & availability',exact:true}).click();
  await expect(page.locator('#global-status')).toContainText('Market API error');
});

test('Catalog errors remain independent of background readiness and section navigation',async({page},testInfo)=>{
  test.setTimeout(10000);
  // Explicit local Interface failure injection, not historical Market data.
  await page.route('**/api/catalog',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({status:'error',error:{code:'catalog_test_failure',message:'Injected Catalog failure'}})}));
  await page.goto('/',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  await expect(page.locator('#global-status')).toContainText('Catalog API error');
  await page.getByRole('button',{name:'Vacancy & availability',exact:true}).click();
  await expect(page.locator('#global-status')).toContainText('Catalog API error');
  await expect(page.locator('#area-list')).toContainText('Area catalog unavailable');
  await expect(page.locator('.area-row')).toHaveCount(0);
  await expect(page.locator('#detail-content')).toContainText('Catalog unavailable');
  await page.waitForFunction(()=>window.__officeMapDebug!.state().baseMapStatus==='available',undefined,{timeout:8000});
  expect((await state(page)).renderedBuildingCount).toBeGreaterThan(20);
  await testInfo.attach('catalog-failure-with-real-background',{body:await page.screenshot(),contentType:'image/png'});
});

// Each Playwright test gets a fresh context; additionally disable HTTP caching.
// The OS/network route and GPU process are not claimed to be cold or reset.
for (const viewport of [{width:1600,height:1000},{width:390,height:844}]) {
  test.describe(`cold startup ${viewport.width} / ${userRenderer ? 'user budgets' : 'software functional'}`,()=>{
    test.use({viewport,hasTouch:viewport.width===390});
    test.describe.configure({retries:0});
    for (let attempt=0;attempt<samples;attempt++) {
      test(`real business and explorable 3D from first navigation ${attempt+1}`,async({page},testInfo)=>{
        test.setTimeout(15000);
        await mkdir(artifactDir,{recursive:true});
        const prefix = `${process.env.TICKET4_EVIDENCE ?? process.env.TICKET4_PROFILE ?? 'cold'}-${process.env.OFFICE_USER_RENDERER==='1' ? 'user' : 'swiftshader'}-${viewport.width}-${attempt+1}`;
        const client = await page.context().newCDPSession(page);
        await client.send('Network.enable');
        await client.send('Network.setCacheDisabled',{cacheDisabled:true});
        const network: unknown[] = [];
        client.on('Network.requestWillBeSent',event=>network.push({kind:'request',id:event.requestId,url:event.request.url,at:event.timestamp}));
        client.on('Network.responseReceived',event=>network.push({kind:'response',id:event.requestId,url:event.response.url,status:event.response.status,fromDiskCache:event.response.fromDiskCache,fromServiceWorker:event.response.fromServiceWorker,at:event.timestamp}));
        client.on('Network.requestServedFromCache',event=>network.push({kind:'cache',id:event.requestId}));
        client.on('Network.loadingFailed',event=>network.push({kind:'failed',id:event.requestId,error:event.errorText,at:event.timestamp}));
        const errors: string[] = [];
        const warnings: string[] = [];
        page.on('pageerror',error=>errors.push(error.message));
        page.on('console',message=>{ if (['error','warning'].includes(message.type())) warnings.push(message.text()); });
        let chats = 0;
        await page.route('**/api/chat',route=>{ chats++; return route.abort(); });
        const samples: Record<string,unknown> = {viewport,attempt:attempt+1,sampleCount:userRenderer && process.env.OFFICE_PERFORMANCE_REPEAT==='1' ? 3 : 1,benchmark:userRenderer ? 'user 2s/10s budgets' : 'software functional; not user performance acceptance',cache:'new browser context; HTTP cache disabled; no page/storage reuse',build:process.env.OFFICE_PRODUCTION==='1' ? 'production' : 'development'};
        if (process.env.TICKET4_PROFILE) { await client.send('Profiler.enable'); await client.send('Profiler.start'); }
        try {
          await page.goto('/',{waitUntil:'domcontentloaded'});
          const rents = page.getByRole('button',{name:'Rents',exact:true});
          if (viewport.width===390) await rents.tap(); // Native two-step touch preview.
          if (viewport.width===390) await rents.tap(); else await rents.click();
          await expect(page.locator('#market-panel')).toBeVisible();
          await expect(page.locator('#detail-content .selected-observation')).toContainText('£105.26');
          await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
          await expect(page.locator('.area-row')).toHaveCount(4);
          await page.locator('#detail-content .snapshot-chart').scrollIntoViewIfNeeded();
          await expect(page.locator('#detail-content .selected-observation')).toBeInViewport();
          const business = await page.screenshot();
          samples.businessPresentedUpperMs = await page.evaluate(()=>performance.now());
          await writeFile(`${artifactDir}/${prefix}-business.png`,business);
          if (userRenderer) expect.soft(samples.businessPresentedUpperMs).toBeLessThanOrEqual(2000);
          await page.waitForFunction(()=>{
            const s = window.__officeMapDebug!.state();
            return s.baseMapStatus==='available' && s.renderedBuildingCount>20 && !s.moving;
          },undefined,{polling:100,timeout:10000});
          const firstMap = await page.screenshot();
          samples.firstMapPresentedUpperMs = await page.evaluate(()=>performance.now());
          await writeFile(`${artifactDir}/${prefix}-map.png`,firstMap);
          const initial = await state(page);
          expect(initial).toMatchObject({webgl2:true,buildings3d:true,interleaved:true,deckCanvasShared:true,geometryCount:4});
          expect(initial.pitch).toBeCloseTo(55,1);
          await expect(page.locator('.maplibregl-ctrl-scale')).toBeVisible();
          await expect(page.locator('#coverage-summary')).toContainText('2 of 4');
          await page.getByRole('button',{name:'Map information',exact:true}).click();
          await expect(page.locator('#map-info')).toContainText('not verified height surveys');
          // The information card overlaps its toggle in the narrow layout;
          // close through the same focused button's real keyboard activation.
          await page.getByRole('button',{name:'Map information',exact:true}).press('Enter');
          // Actual camera input and a second composed frame prove this is a live
          // spatial background, not a style-loaded flag or a static picture.
          await page.getByRole('button',{name:'Zoom in',exact:true}).click();
          await page.waitForFunction(()=>!window.__officeMapDebug!.state().moving);
          const explored = await page.screenshot();
          samples.explorablePresentedUpperMs = await page.evaluate(()=>performance.now());
          await writeFile(`${artifactDir}/${prefix}-explored.png`,explored);
          const next = await state(page);
          expect(next.zoom).toBeGreaterThan(initial.zoom+.8);
          expect(next.renderedBuildingCount).toBeGreaterThan(20);
          const roof = await page.evaluate(()=>{
            const box = document.querySelector('#map')!.getBoundingClientRect();
            // City's centroid is offscreen to the right on the narrow overview;
            // sample the visible City roofs below the heading in that layout.
            const p = innerWidth<760 ? {x:box.width/2,y:box.height/2} : window.__officeMapDebug!.project([-.089,51.516])!;
            return [Math.round(box.x+p.x)-70,Math.round(box.y+p.y)+35];
          });
          const amber = Number(execFileSync('../.venv/bin/python',['-c',
            'import io,sys; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB"); x,y=map(int,sys.argv[1:]); p=im.crop((x,y,x+140,y+90)).tobytes(); print(sum(r>=180 and 115<=g<=230 and b<=130 for r,g,b in zip(p[0::3],p[1::3],p[2::3])))',
            ...roof.map(String)],{input:explored}).toString());
          samples.roofAmberPixels = amber;
          expect(amber).toBeGreaterThan(100);
          samples.meetsUserColdBudgets = Number(samples.businessPresentedUpperMs)<=2000 && Number(samples.firstMapPresentedUpperMs)<=10000 && Number(samples.explorablePresentedUpperMs)<=10000;
          if (userRenderer) {
            expect.soft(samples.firstMapPresentedUpperMs).toBeLessThanOrEqual(10000);
            expect.soft(samples.explorablePresentedUpperMs).toBeLessThanOrEqual(10000);
          }
          expect(errors).toEqual([]);
        } finally {
          if (process.env.TICKET4_PROFILE) {
            const {profile} = await client.send('Profiler.stop');
            await writeFile(`${artifactDir}/${prefix}-cpu-profile.json`,JSON.stringify(profile));
          }
          const environment = await page.evaluate(()=>{
            const canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas'), gl = canvas?.getContext('webgl2');
            const extension = gl?.getExtension('WEBGL_debug_renderer_info');
            return {browser:navigator.userAgent,renderer:gl && (extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)),dpr:devicePixelRatio,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,navigation:performance.getEntriesByType('navigation').map(entry=>entry.toJSON()),resources:performance.getEntriesByType('resource').map(entry=>entry.toJSON()),state:window.__officeMapDebug?.state(),status:document.querySelector('#map-state')?.textContent};
          });
          const evidence = {...samples,environment,errors,warnings,chats,network};
          await writeFile(`${artifactDir}/${prefix}.json`,JSON.stringify(evidence,null,2));
          await testInfo.attach('cold-navigation',{body:JSON.stringify(evidence),contentType:'application/json'});
          console.log(JSON.stringify({...samples,renderer:environment.renderer,status:environment.status,errors,chats}));
          expect(chats).toBe(0);
          expect(environment.reducedMotion).toBe(false);
          if (process.env.OFFICE_USER_RENDERER==='1') expect(environment.renderer).not.toContain('SwiftShader');
          else expect(environment.renderer).toContain('SwiftShader');
        }
      });
    }
  });
}
