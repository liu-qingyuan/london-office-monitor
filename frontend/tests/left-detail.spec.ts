import {test,expect,type Page} from '@playwright/test';
import type {Catalog,Market} from '../src/types';

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
