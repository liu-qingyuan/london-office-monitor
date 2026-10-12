import {test,expect} from '@playwright/test';
import {openSection} from './navigation';
import type {Market} from '../src/types';

test('nine icons are visible by default and the same glass bar expands labels on hover without an orb or data panel',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  const chats:string[]=[];
  page.on('request',r=>{if(r.url().endsWith('/api/chat'))chats.push(r.url());});
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  const content=page.locator('.inspector'),nav=page.locator('#workspace-nav');
  await expect(content).toBeHidden();
  // The rejected orb implementation hid every actual navigation icon.
  await expect(nav).toBeVisible();
  await expect(nav).toHaveCSS('width','64px');
  await expect(page.locator('.explore-orb, #market-toggle')).toHaveCount(0);
  const icons=nav.locator('.nav-item-icon');
  await expect(icons).toHaveCount(9);
  for (const symbol of await icons.all()) await expect(symbol).toBeVisible();
  await expect(nav.locator('.nav-item-label').first()).toHaveCSS('opacity','0');
  const before=(await icons.first().boundingBox())!;
  const railBefore=(await nav.boundingBox())!;
  expect(railBefore.x).toBeGreaterThan(1500);
  await page.getByRole('button',{name:'Submarkets',exact:true}).hover();
  await expect(nav).toHaveCSS('width','248px');
  await expect(nav.locator('.nav-item-label').first()).toHaveCSS('opacity','1');
  await expect(content).toBeHidden();
  const expanded=(await icons.first().boundingBox())!;
  expect(Math.abs(expanded.x-before.x)).toBeLessThan(2);
  expect(Math.abs(expanded.y-before.y)).toBeLessThan(2);
  const railExpanded=(await nav.boundingBox())!;
  const label=(await nav.locator('.nav-item-label').first().boundingBox())!;
  expect(railExpanded.x).toBeLessThan(railBefore.x);
  expect(Math.abs(railExpanded.x+railExpanded.width-railBefore.x-railBefore.width)).toBeLessThan(2);
  expect(label.x+label.width).toBeLessThan(expanded.x);
  await page.getByRole('button',{name:'Macro economy',exact:true}).hover();
  await expect(content).toBeHidden();
  await page.mouse.move(700,790);
  await expect(nav).toHaveCSS('width','64px');
  await expect(nav).toBeVisible();
  await expect(content).toBeHidden();
  expect(chats).toEqual([]);
});

test('topic selection reuses primary observations and admitted research without inventing map-bound series',async({page,request})=>{
  await page.setViewportSize({width:1600,height:1000});
  const source=await (await request.get('/api/market?metric=prime_rent&period=2025-YE')).json() as Market;
  await page.goto('/');
  await openSection(page,'Macro economy');
  await expect(page.locator('#panel-title')).toHaveText('Macro economy');
  const macro=page.locator('[data-research-topic="macro"]');
  await expect(macro).toContainText('Connected');
  await expect(macro).toContainText('3.75');
  await expect(macro.locator('.research-card[data-research-id]')).toHaveCount(source.research!.records.filter(r=>r.topic_ids.includes('macro')).length);
  await expect(macro).not.toContainText('£');
  await expect(page.locator('.area-panel')).toBeHidden();
  await expect(page.locator('.detail-panel')).toBeHidden();
  await expect(page.locator('.workspace-nav-item[aria-pressed="true"]')).toHaveCount(1);
  // Switch actual sections in the open workspace. Repeated close/reopen
  // allocations are covered by the isolated resize/keyboard/touch flows.
  await openSection(page,'Rents');
  await expect(page.locator('#panel-title')).toHaveText('Rents');
  await expect(page.locator('#detail-content .snapshot-chart')).toContainText('£105.26');
  await expect(page.getByRole('button',{name:'Overall vacancy rate',exact:true})).toBeHidden();
  await openSection(page,'Vacancy & availability');
  await expect(page.locator('#detail-content .snapshot-chart')).toContainText('7%');
  await expect(page.locator('#detail-content .snapshot-chart')).toContainText('Unit: %');
  const vacancy=page.locator('[data-research-topic="vacancy"]');
  await expect(vacancy).toContainText('Connected');
  const missingAvailability=source.research!.records.filter(r=>r.topic_ids.includes('vacancy')&&r.status==='missing');
  expect(missingAvailability.length).toBeGreaterThan(0);
  for(const row of missingAvailability) await expect(vacancy.locator(`[data-research-id="${row.id}"]`)).toContainText('Missing — not zero');
  for (const [label,kind] of [['Leasing activity','report_leasing_event'],['Supply pipeline','report_supply_context'],['Demand drivers','report_demand_driver'],['News & events',null]] as const) {
    await openSection(page,label);
    const expected=source.notes.filter(n=>kind===null||n.kind===kind);
    await expect(page.locator('#section-content .event-card')).toHaveCount(expected.length);
    for (const note of expected) await expect(page.locator('#section-content')).toContainText(note.summary);
    await expect(page.locator('#section-content')).toContainText('Historical report context');
    await expect(page.locator('#section-content')).toContainText('not an individual-submarket series or live news');
    await expect(page.locator('#section-content .event-card a').first()).toHaveAttribute('href',/^https:\/\/www\.savills\.co\.uk\//);
  }
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await expect(page.locator('.inspector')).toBeHidden();
});

test('keyboard focus reveals labels and Escape returns to the icon column without immediately reopening',async({page})=>{
  await page.goto('/');
  const entry=page.getByRole('button',{name:'Submarkets',exact:true});
  await page.keyboard.press('Tab');
  await entry.focus();
  await expect(page.locator('#workspace-nav')).toHaveClass(/labels-open/);
  await expect(page.locator('.inspector')).toBeHidden();
  await entry.press('Escape');
  await expect(page.locator('#workspace-nav')).not.toHaveClass(/labels-open/);
  await expect(entry).toBeFocused();
  await expect(page.locator('.inspector')).toBeHidden();
});

test('short viewport scrolls the icon column to layers while keeping the source-backed lens usable',async({page})=>{
  await page.setViewportSize({width:800,height:600});
  await page.goto('/');
  await openSection(page,'Map layers');
  await expect(page.locator('#panel-title')).toHaveText('Map layers');
  await expect(page.locator('#section-content')).toContainText('approximate spatial context');
  await expect(page.getByRole('button',{name:'Average Grade A rent',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Average Grade A rent',exact:true}).click();
  await expect(page.getByRole('button',{name:'Average Grade A rent',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Close workspace',exact:true}).click();
  await expect(page.getByRole('button',{name:'Map layers',exact:true})).toBeVisible();
});
