import {test, expect} from '@playwright/test';
import {openSection} from './navigation';
import {mkdir} from 'node:fs/promises';
import type {Catalog} from '../src/types';

const state = (page: import('@playwright/test').Page) => page.evaluate(() => window.__officeMapDebug!.state());
const roundedPose = (s: Awaited<ReturnType<typeof state>>) => ({
  zoom:Number(s.zoom.toFixed(5)),bearing:Number(s.bearing.toFixed(5)),pitch:Number(s.pitch.toFixed(5)),
  center:s.center.map(n=>Number(n.toFixed(5)))
});

test('London scene renders actual map-provided 3D building volumes, not a screenshot background', async ({page}) => {
  test.setTimeout(45000);
  const errors: string[] = [];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/');
  await expect(page.locator('.maplibregl-canvas')).toBeVisible();
  await expect.poll(()=>state(page),{timeout:30000}).toMatchObject({webgl2:true,buildings3d:true});
  await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(55,1);
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await expect(page.locator('.maplibregl-ctrl-scale')).toBeVisible();
  await expect(page.locator('#coverage-summary')).toContainText('2 of 4');
  await openSection(page);
  await expect(page.locator('.snapshot-chart .chart-bar')).toHaveCount(2);
  await mkdir('../artifacts/left-detail',{recursive:true});
  await page.screenshot({path:'../artifacts/left-detail/london-overview-e2e.png'});
  await page.getByRole('button',{name:'Map information',exact:true}).click();
  await expect(page.locator('#map-info')).toContainText('not verified height surveys');
  expect(errors).toEqual([]);
});

test('camera controls change real WebGL pose, support native drag, and reset the city overview', async ({page}) => {
  test.setTimeout(45000);
  await page.goto('/');
  await expect.poll(()=>state(page)).toMatchObject({buildings3d:true});
  await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(55,1);
  const initial = await state(page);
  await page.getByRole('button',{name:'Zoom in',exact:true}).click();
  await expect.poll(async()=>(await state(page)).zoom).toBeGreaterThan(initial.zoom+.8);
  await page.getByRole('button',{name:'Zoom out',exact:true}).click();
  await expect.poll(async()=>(await state(page)).zoom).toBeCloseTo(initial.zoom,1);
  await page.getByRole('button',{name:'Rotate view',exact:true}).click();
  await expect.poll(async()=>(await state(page)).bearing).toBeCloseTo(initial.bearing+45,0);
  await page.getByRole('button',{name:'Tilt view',exact:true}).click();
  await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(70,0);
  await page.getByRole('button',{name:'Top-down view',exact:true}).click();
  await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(0,0);
  await expect(page.locator('#camera-caption')).toContainText('TOP-DOWN');
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await expect.poll(async()=>roundedPose(await state(page))).toEqual(roundedPose(initial));
  const box = (await page.locator('#map').boundingBox())!;
  const x = box.x+box.width*.5, y = box.y+box.height*.5;
  await page.mouse.move(x,y);
  await page.mouse.down();
  await page.mouse.move(x+100,y+25,{steps:12});
  await page.mouse.up();
  await expect.poll(async()=>(await state(page)).center).not.toEqual(initial.center);
  await page.mouse.move(x,y);
  await page.mouse.down({button:'right'});
  await page.mouse.move(x+80,y+50,{steps:12});
  await page.mouse.up({button:'right'});
  await expect.poll(async()=>Math.abs((await state(page)).bearing-initial.bearing)).toBeGreaterThan(5);
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await expect.poll(async()=>roundedPose(await state(page))).toEqual(roundedPose(initial));
});

test('selecting all four submarkets focuses the real camera and filters keep its pose and missingness', async ({page,request}) => {
  test.setTimeout(45000);
  const catalog = await (await request.get('/api/catalog')).json() as Catalog;
  await page.goto('/');
  await expect.poll(()=>state(page)).toMatchObject({buildings3d:true});
  await openSection(page);
  for (const area of catalog.areas) {
    await page.locator(`.area-row[data-area="${area.id}"]`).click();
    await expect(page.locator('#detail-content h3')).toHaveText(area.name);
    await expect.poll(async()=>(await state(page)).zoom).toBeGreaterThan(14.5);
    await expect.poll(async()=>{
      const center=(await state(page)).center;
      return Math.abs(center[0]-area.center[0])+Math.abs(center[1]-area.center[1]);
    }).toBeLessThan(.001);
  }
  await page.locator('.area-row[data-area="canary_wharf"]').click();
  await expect(page.locator('#detail-content')).toContainText('Missing does not mean zero');
  await expect(page.locator('.snapshot-chart .chart-bar')).toHaveCount(0);
  await expect.poll(async()=>(await state(page)).pitch).toBeCloseTo(60,0);
  const canary=catalog.areas.find(a=>a.id==='canary_wharf')!;
  await expect.poll(async()=>{
    const center=(await state(page)).center;
    return Math.abs(center[0]-canary.center[0])+Math.abs(center[1]-canary.center[1]);
  }).toBeLessThan(.00001);
  const focus=await state(page);
  await page.getByRole('button',{name:'2024 year-end',exact:true}).click();
  await expect(page.locator('#period-caption')).toHaveText('2024 year-end');
  await expect.poll(async()=>roundedPose(await state(page))).toEqual(roundedPose(focus));
  await mkdir('../artifacts/left-detail',{recursive:true});
  await page.screenshot({path:'../artifacts/left-detail/canary-wharf-gap-e2e.png'});
});

test('narrow screens retain usable map controls, readable data, and no horizontal overflow', async ({page}) => {
  test.setTimeout(45000);
  await page.setViewportSize({width:390,height:844});
  await page.goto('/');
  await expect.poll(()=>state(page)).toMatchObject({webgl2:true,buildings3d:true});
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await expect(page.getByRole('button',{name:'Reset map',exact:true})).toBeVisible();
  await expect(page.locator('.area-row')).toHaveCount(4);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Reset map',exact:true}).click();
  await expect.poll(async()=>(await state(page)).renderedBuildingCount,{timeout:30000}).toBeGreaterThan(20);
  await mkdir('../artifacts/left-detail',{recursive:true});
  await page.screenshot({path:'../artifacts/left-detail/mobile-overview-e2e.png',fullPage:true});
});
