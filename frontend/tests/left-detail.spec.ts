import {test,expect,type Page} from '@playwright/test';
import type {Catalog,Market} from '../src/types';
import {mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

// Observe real canvas allocations without changing the renderer or injecting a
// selection. Assigning an unchanged width/height still clears the drawing buffer.
test('same-size selections preserve the shared canvas while real layout changes keep picking aligned',async({page},testInfo)=>{
  test.setTimeout(25000);
  await page.setViewportSize({width:1600,height:1000});
  await page.addInitScript(()=>{
    const writes: {dimension:string;previous:number;next:number;at:number}[] = [];
    Object.assign(window,{__canvasWrites:writes});
    for (const dimension of ['width','height'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype,dimension)!;
      Object.defineProperty(HTMLCanvasElement.prototype,dimension,{...descriptor,set(value:number){
        if ((this as HTMLCanvasElement).classList.contains('maplibregl-canvas')) writes.push({dimension,previous:descriptor.get!.call(this),next:value,at:performance.now()});
        descriptor.set!.call(this,value);
      }});
    }
  });
  await page.goto('/');
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:15000}).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  await page.locator('.area-row[data-area="city"]').click();
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  // Wait for the target view's actual tile traffic, not only the camera flag.
  await page.waitForLoadState('networkidle');
  // Retain only the settled segment of the observer's original array.
  const start = await page.evaluate(()=>performance.now());
  const client = await page.context().newCDPSession(page);
  if (process.env.TICKET3_PROFILE) { await client.send('Profiler.enable'); await client.send('Profiler.start'); }
  try {
    for (let attempt=0;attempt<3;attempt++) {
      await page.locator('.area-row[data-area="city"]').click();
      await expect(page.locator('#detail-content h3')).toHaveText('City');
      await expect.poll(async()=>(await state(page)).moving).toBe(false);
      console.log('Settled same-size selection',attempt,await page.evaluate(()=>performance.now()));
    }
  } finally {
    await mkdir('../artifacts/ticket-3',{recursive:true});
    if (process.env.TICKET3_PROFILE) {
      const {profile} = await client.send('Profiler.stop');
      await writeFile(`../artifacts/ticket-3/${process.env.TICKET3_PROFILE}-cpu-profile.json`,JSON.stringify(profile));
    }
  }
  const evidence = await page.evaluate(start=>{
    const canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
    const gl = canvas.getContext('webgl2')!, renderer = gl.getExtension('WEBGL_debug_renderer_info');
    return {start,end:performance.now(),writes:(window as unknown as {__canvasWrites:{dimension:string;previous:number;next:number;at:number}[]}).__canvasWrites.filter(write=>write.at>=start),browser:navigator.userAgent,renderer:renderer ? gl.getParameter(renderer.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
  },start);
  await testInfo.attach('same-size-canvas',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
  console.log(JSON.stringify(evidence));
  expect(evidence.writes).toEqual([]);
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await expect(page.locator('.maplibregl-canvas')).toHaveCSS('width','1600px');
  const canvas = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const viewport = (await page.locator('#map').boundingBox())!;
  expect(canvas.width).toBe(viewport.width);
  await clickAreaOnMap(page,[-.089,51.516]);
  await expect(page.locator('#detail-content h3')).toHaveText('City');
});

const state = (page: Page) => page.evaluate(() => window.__officeMapDebug!.state());
async function clickAreaOnMap(page: Page,center: [number,number]): Promise<void> {
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  const point = await page.evaluate(coordinates=>window.__officeMapDebug!.project(coordinates),center);
  const box = (await page.locator('#map').boundingBox())!;
  expect(point).not.toBeNull();
  expect(point!.x).toBeGreaterThan(0);
  expect(point!.x).toBeLessThan(box.width);
  await page.mouse.click(box.x+point!.x,box.y+point!.y);
}

// Inspect pixels from the real WebGL canvas, not a selection setter or fake map.
async function amberPixelsNear(page: Page,center: [number,number],region = {dx:-140,dy:-23,width:280,height:46}): Promise<number> {
  const png = (await page.locator('.maplibregl-canvas').screenshot()).toString('base64');
  return page.evaluate(async({png,center,region})=>{
    const point = window.__officeMapDebug!.project(center)!;
    const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${png}`)).blob());
    const canvas = document.createElement('canvas');
    canvas.width = image.width; canvas.height = image.height;
    const context = canvas.getContext('2d')!;
    context.drawImage(image,0,0);
    const width = Math.min(region.width,image.width), height = Math.min(region.height,image.height);
    const x = Math.max(0,Math.min(image.width-width,Math.round(point.x)+region.dx));
    const y = Math.max(0,Math.min(image.height-height,Math.round(point.y)+region.dy));
    const pixels = context.getImageData(x,y,width,height).data;
    let amber = 0;
    for (let index=0;index<pixels.length;index+=4) {
      if (pixels[index]!>=180 && pixels[index+1]!>=115 && pixels[index+1]!<=230 && pixels[index+2]!<=130) amber++;
    }
    image.close();
    return amber;
  },{png,center,region});
}

// Chromium Event Timing includes input queueing and the next presented frame.
// A compositor screenshot gives a conservative upper bound for the *complete*
// result (including capture overhead), not a handler/rAF/debug-flag stopwatch.
for (const viewport of [{width:1600,height:1000},{width:390,height:844}]) {
  test.describe(`hot user-renderer selection ${viewport.width}`,()=>{
    test.use({viewport,hasTouch:viewport.width===390});
    test.describe.configure({retries:0});
    test('real navigation, list and GPU map inputs present feedback and complete results within budget',async({page},testInfo)=>{
      test.skip(process.env.OFFICE_USER_RENDERER !== '1','User-renderer acceptance runs explicitly with OFFICE_USER_RENDERER=1; SwiftShader is reported separately.');
      test.setTimeout(25000);
      await page.addInitScript(()=>{
        const probe = {inputs:[] as {at:number;trusted:boolean}[],events:[] as {name:string;startTime:number;duration:number}[]};
        Object.assign(window,{__hotProbe:probe});
        document.addEventListener('click',event=>probe.inputs.push({at:event.timeStamp,trusted:event.isTrusted}),true);
        new PerformanceObserver(list=>{
          for (const entry of list.getEntries()) probe.events.push({name:entry.name,startTime:entry.startTime,duration:entry.duration});
        }).observe({type:'event',durationThreshold:16} as PerformanceObserverInit);
      });
      let chats = 0;
      const tileRequests: string[] = [];
      page.on('request',request=>{
        if (request.url().includes('/api/chat')) chats++;
        if (request.url().includes('/planet')) tileRequests.push(request.url());
      });
      await page.goto('/');
      await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:10000}).toBeGreaterThan(20);
      const mobile = viewport.width===390;
      const activate = async(selector:string)=> mobile ? page.locator(selector).tap() : page.locator(selector).click();
      if (mobile) await activate('button[data-section="rents"]'); // Existing touch preview, not activation.
      await activate('button[data-section="rents"]');
      await activate('.area-row[data-area="city"]');
      await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
      await expect.poll(async()=>(await state(page)).moving).toBe(false);
      await page.waitForLoadState('networkidle'); // Explicit target-view warm-up, outside the input stopwatch.
      // Warm both real layout sizes at the target camera, not only the inset view.
      await page.getByRole('button',{name:'Close workspace',exact:true}).click();
      await expect(page.locator('.maplibregl-canvas')).toHaveCSS('width',`${viewport.width}px`);
      await page.waitForLoadState('networkidle');
      if (mobile) await activate('button[data-section="rents"]');
      await activate('button[data-section="rents"]');
      await page.waitForLoadState('networkidle');
      const environment = await page.evaluate(()=>{
        const gl = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!.getContext('webgl2')!;
        const extension = gl.getExtension('WEBGL_debug_renderer_info');
        return {renderer:extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),browser:navigator.userAgent,dpr:devicePixelRatio,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
      });
      const samples: {kind:string;attempt:number;feedbackUpperMs:number;completeUpperMs:number;amber:number;tilesRequested:string[]}[] = [];
      try {
        for (const kind of ['navigation','list','map']) for (let attempt=0;attempt<3;attempt++) {
          if (kind!=='navigation') {
            // Each measured City input changes a different selection, not an
            // idempotent reselect that could miss stale labels/paint/detail.
            await activate('.area-row[data-area="midtown_fringe"]');
            await expect(page.locator('#detail-content .detail-pill')).toHaveText('COVERAGE GAP');
            await expect.poll(async()=>(await state(page)).moving).toBe(false);
            await page.getByRole('button',{name:'Reset map',exact:true}).click();
            await expect.poll(async()=>(await state(page)).moving).toBe(false);
            await page.waitForLoadState('networkidle');
          }
          if (kind!=='list') {
            await page.getByRole('button',{name:'Close workspace',exact:true}).click();
            await page.waitForFunction(()=>{
              const map = document.querySelector<HTMLElement>('#map')!, canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
              return canvas.clientWidth===map.clientWidth && canvas.clientHeight===map.clientHeight;
            });
          }
          const tileStart = tileRequests.length;
          if (kind==='navigation') {
            if (mobile) await activate('button[data-section="rents"]');
            await activate('button[data-section="rents"]');
          } else if (kind==='list') await activate('.area-row[data-area="city"]');
          else {
            const point = await page.evaluate(()=>window.__officeMapDebug!.project([-.089,51.516])!);
            const box = (await page.locator('#map').boundingBox())!;
            if (mobile) await page.touchscreen.tap(box.x+point.x,box.y+point.y);
            else await page.mouse.click(box.x+point.x,box.y+point.y);
          }
          await page.waitForFunction(()=>{
            const state = window.__officeMapDebug!.state();
            const map = document.querySelector<HTMLElement>('#map')!, canvas = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas')!;
            return !state.moving && canvas.clientWidth===map.clientWidth && canvas.clientHeight===map.clientHeight && document.querySelector('#detail-content h3')?.textContent==='City' && document.querySelectorAll('#detail-content .chart-bar').length===2 && !document.querySelector<HTMLElement>('#market-panel')!.hidden;
          },undefined,{polling:50,timeout:3000});
          const png = await page.screenshot(); // Real composed UI, map labels, outlines and building roofs.
          const timing = await page.evaluate(()=>{
            const probe = (window as unknown as {__hotProbe:{inputs:{at:number;trusted:boolean}[];events:{name:string;startTime:number;duration:number}[]}}).__hotProbe;
            const input = probe.inputs.at(-1)!;
            const event = probe.events.find(event=>event.name==='click' && Math.abs(event.startTime-input.at)<1);
            // Chromium suppresses sub-16ms Event Timing entries; do not report a fabricated duration.
            return {trusted:input.trusted,feedbackUpperMs:event ? event.duration+4 : 16,completeUpperMs:performance.now()-input.at};
          });
          const roof = await page.evaluate(()=>{
            const point = window.__officeMapDebug!.project([-.089,51.516])!, box=document.querySelector('#map')!.getBoundingClientRect();
            return [Math.round(box.x+point.x)-70,Math.round(box.y+point.y)+35];
          });
          // Decode outside the application browser. Repeated 2D bitmap/GPU
          // allocations inside it contaminated the next input's presentation.
          const amber = Number(execFileSync('../.venv/bin/python',['-c',
            'import io,sys; from PIL import Image; im=Image.open(io.BytesIO(sys.stdin.buffer.read())).convert("RGB"); x,y=map(int,sys.argv[1:]); p=im.crop((x,y,x+140,y+90)).tobytes(); print(sum(r>=180 and 115<=g<=230 and b<=130 for r,g,b in zip(p[0::3],p[1::3],p[2::3])))',
            ...roof.map(String)],{input:png}).toString());
          const tilesRequested = tileRequests.slice(tileStart);
          samples.push({kind,attempt,feedbackUpperMs:timing.feedbackUpperMs,completeUpperMs:timing.completeUpperMs,amber,tilesRequested});
          await testInfo.attach(`${kind}-${attempt}`,{body:png,contentType:'image/png'});
          expect(timing.trusted).toBe(true);
          expect.soft(tilesRequested,'A request for new target-view tiles makes this a preserved non-hot sample, not hot acceptance').toEqual([]);
          expect.soft(timing.feedbackUpperMs).toBeLessThanOrEqual(100);
          expect.soft(timing.completeUpperMs).toBeLessThanOrEqual(1000);
          expect.soft(amber).toBeGreaterThan(100); // Roof patch below the label, not an HTML selection swatch.
        }
      } finally {
        const evidence = {environment,viewport,build:process.env.OFFICE_PRODUCTION==='1' ? 'production' : 'development',cache:'target view and real City detail warmed before measurement',samples,chats};
        console.log(JSON.stringify(evidence));
        await testInfo.attach('hot-input-measurements',{body:JSON.stringify(evidence,null,2),contentType:'application/json'});
      }
      expect(chats).toBe(0);
      expect(environment.reducedMotion).toBe(false);
      expect(environment.renderer).not.toContain('SwiftShader');
    });
  });
}

test('a real map click opens the integrated details and list selection keeps the resized map in sync',async({page,request})=>{
  test.setTimeout(45000);
  await page.setViewportSize({width:1600,height:1000});
  const catalog = await (await request.get('/api/catalog')).json() as Catalog;
  const city = catalog.areas.find(area=>area.id==='city')!;
  await page.goto('/');
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await expect(page.locator('#market-panel')).toBeHidden();
  await clickAreaOnMap(page,city.center);
  await expect(page.locator('#market-panel')).toBeVisible();
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  await expect(page.locator('.workspace-nav-item[data-section="market"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(2);
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  const canvas = (await page.locator('.maplibregl-canvas').boundingBox())!;
  const viewport = (await page.locator('#map').boundingBox())!;
  expect(canvas.width).toBe(viewport.width);
  expect(viewport.x).toBeGreaterThan(300);
  await page.locator('.area-row[data-area="west_end"]').click();
  await expect(page.locator('#detail-content h3')).toHaveText('West End');
  await expect(page.locator('.area-row[data-area="west_end"]')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#detail-content .snapshot-chart')).toContainText('£166.61');
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  const pose = await state(page);
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await expect(page.locator('#market-panel')).toBeHidden();
  await expect(page.locator('#map')).toHaveCSS('width','1600px');
  await expect.poll(async()=>{
    const next = await state(page);
    return {zoom:next.zoom,bearing:next.bearing,pitch:next.pitch,center:next.center};
  }).toEqual({zoom:pose.zoom,bearing:pose.bearing,pitch:pose.pitch,center:pose.center});
});

test('amber selection and visible labels remain independent of verified values and genuine data gaps',async({page,request})=>{
  test.setTimeout(45000);
  await page.setViewportSize({width:1600,height:1000});
  const catalog = await (await request.get('/api/catalog')).json() as Catalog;
  await page.goto('/');
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  for (const id of ['city','canary_wharf'] as const) {
    const area = catalog.areas.find(item=>item.id===id)!;
    await page.locator(`.area-row[data-area="${id}"]`).click();
    await expect(page.locator('#detail-content h3')).toHaveText(area.name);
    await expect.poll(async()=>(await state(page)).moving).toBe(false);
    await expect.poll(()=>amberPixelsNear(page,area.center),{timeout:20000}).toBeGreaterThan(70);
    await expect(page.locator('.area-row[aria-pressed="true"]')).toHaveCount(1);
  }
  await expect(page.locator('#detail-content .detail-pill')).toHaveText('COVERAGE GAP');
  await expect(page.locator('#detail-content')).toContainText('Missing does not mean zero');
  await expect(page.locator('#detail-content .chart-bar')).toHaveCount(0);
  await expect(page.locator('.map-legend')).toContainText('Selected area');
  await expect(page.locator('.map-legend')).toContainText('Data gap');
});

test('map-provided 3D buildings turn amber inside the current illustrative selector and revert when selection moves',async({page,request})=>{
  test.setTimeout(60000);
  await page.setViewportSize({width:1600,height:1000});
  const catalog = await (await request.get('/api/catalog')).json() as Catalog;
  const city = catalog.areas.find(area=>area.id==='city')!;
  const roofs = {dx:-170,dy:35,width:340,height:140};
  await page.goto('/');
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  await page.locator('.area-row[data-area="city"]').click();
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  // A roof sample below the label, well inside City: an amber outline alone
  // cannot satisfy this. It inspects the actual map, not a styled HTML swatch.
  await expect.poll(()=>amberPixelsNear(page,city.center,roofs),{timeout:20000}).toBeGreaterThan(800);
  const selectedRoofs = await amberPixelsNear(page,city.center,roofs);
  await page.getByRole('button',{name:'Top-down view',exact:true}).click();
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  // Southwark is south of the selector, not part of City. Test the actual
  // outside roofs too: a convincing selected screenshot alone is insufficient.
  await expect.poll(()=>amberPixelsNear(page,[-.097,51.505],{dx:-70,dy:-45,width:140,height:90}),{timeout:20000}).toBeLessThan(70);
  await page.locator('.area-row[data-area="west_end"]').click();
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await expect.poll(async()=>(await state(page)).moving).toBe(false);
  await expect.poll(()=>amberPixelsNear(page,city.center,roofs),{timeout:20000}).toBeLessThan(selectedRoofs/4);
  await expect.poll(async()=>(await state(page)).renderedBuildingCount).toBeGreaterThan(20);
});

test('the selected metric, period, chart and source summaries are readable in the left detail region',async({page,request})=>{
  await page.setViewportSize({width:1600,height:1000});
  const data = await (await request.get('/api/market?area=city&metric=prime_rent&period=2024-YE')).json() as Market;
  await page.goto('/');
  await page.getByRole('button',{name:'Rents',exact:true}).click();
  const detail = page.locator('#detail-content');
  await expect(detail.locator('.detail-metric')).toHaveText('Average prime rent');
  await expect(detail.locator('.selected-observation')).toContainText('2025 year-end');
  await expect(detail.locator('.selected-observation')).toContainText('£105.26 / sq ft');
  await expect(detail.locator('.snapshot-chart')).toBeInViewport({ratio:1});
  await expect(detail.locator('.evidence-card summary')).toHaveCount(2);
  for (const summary of await detail.locator('.evidence-card summary').all()) {
    await expect(summary).toContainText('Savills');
    await expect(summary).toBeInViewport({ratio:1});
  }
  await page.getByRole('button',{name:'2024 year-end',exact:true}).click();
  await expect(detail.locator('.selected-observation')).toContainText('2024 year-end');
  await expect(detail.locator('.selected-observation')).toContainText(String(data.observations[0]!.value));
  await detail.locator('.evidence-card summary').first().click();
  await expect(detail.locator('.evidence-body blockquote').first()).toContainText(data.evidence[0]!.quote);
  await expect(detail.getByRole('link',{name:'Read original source ↗'}).first()).toHaveAttribute('href',data.sources[0]!.url);
});

test.describe('integrated touch layout',()=>{
  test.use({viewport:{width:390,height:844},hasTouch:true});
  test('mobile details occupy a scrollable row below the map, with working selection, camera and collapse',async({page})=>{
    test.setTimeout(45000);
    await page.goto('/');
    await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
    const entry = page.getByRole('button',{name:'Submarkets',exact:true});
    await entry.tap();
    await expect(page.locator('#market-panel')).toBeHidden();
    await entry.tap();
    await expect(page.locator('#market-panel')).toBeVisible();
    const bounds = await page.evaluate(()=>({
      map:document.querySelector('#map')!.getBoundingClientRect().toJSON(),
      panel:document.querySelector('#market-panel')!.getBoundingClientRect().toJSON()
    }));
    expect(bounds.panel.x).toBe(0);
    expect(bounds.panel.width).toBe(390);
    expect(bounds.panel.y).toBe(bounds.map.bottom);
    expect(bounds.panel.bottom).toBe(844);
    await expect(page.locator('#market-panel')).toHaveCSS('border-radius','0px');
    await page.locator('.area-row[data-area="canary_wharf"]').tap();
    await expect(page.locator('#detail-content h3')).toHaveText('Canary Wharf');
    await expect(page.locator('#detail-content .detail-pill')).toHaveText('COVERAGE GAP');
    await expect(page.locator('#detail-content .chart-bar')).toHaveCount(0);
    await expect.poll(async()=>(await state(page)).moving).toBe(false);
    await page.getByRole('button',{name:'Top-down view',exact:true}).tap();
    await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(0,0);
    await page.locator('#detail-content .snapshot-chart').scrollIntoViewIfNeeded();
    await expect(page.locator('#detail-content .snapshot-chart')).toBeInViewport({ratio:1});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('button',{name:'Close workspace',exact:true}).tap();
    await expect(page.locator('#market-panel')).toBeHidden();
    await expect(page.locator('#map')).toHaveCSS('height','844px');
    await expect(entry).toBeVisible();
  });
});
