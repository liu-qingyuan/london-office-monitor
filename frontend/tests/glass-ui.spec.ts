import {test,expect} from '@playwright/test';
import {openSection} from './navigation';

test('market detail is integrated at the left edge and reserves real map space instead of floating',async({page})=>{
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await openSection(page);
  const layout=await page.evaluate(()=>{
    const panel=document.querySelector<HTMLElement>('.inspector')!;
    const map=document.querySelector<HTMLElement>('#map')!;
    const style=getComputedStyle(panel);
    return {map:map.getBoundingClientRect().toJSON(),panel:panel.getBoundingClientRect().toJSON(),background:style.backgroundColor,blur:style.backdropFilter,radius:parseFloat(style.borderRadius)};
  });
  expect(layout.panel.x).toBe(0);
  expect(layout.panel.y).toBe(88);
  expect(layout.panel.bottom).toBe(1000);
  expect(layout.radius).toBe(0);
  expect(layout.map.x).toBe(layout.panel.right);
  expect(layout.map.right).toBe(1600);
  expect(layout.map.height).toBe(1000);
  expect(layout.map.width).toBeLessThan(1600);
  expect(layout.blur).toContain('blur(');
  await expect(page.locator('.snapshot-chart')).toContainText('Unit: GBP/sq ft');
});

test('top-centred Agent capsule expands without hiding market data or silently sending a model request',async({page})=>{
  const requests:string[]=[];
  page.on('request',r=>{if(r.url().endsWith('/api/chat')) requests.push(r.url());});
  await page.setViewportSize({width:1600,height:1000});
  await page.goto('/');
  await openSection(page);
  await expect(page.locator('#detail-content h3')).toHaveText('City');
  const question=page.getByRole('textbox',{name:'YOUR QUESTION'});
  await expect(question).toBeVisible();
  const box=(await question.boundingBox())!;
  expect(box.y).toBeLessThan(100);
  expect(Math.abs(box.x+box.width/2-800)).toBeLessThan(50);
  await expect(page.locator('#agent-expansion')).toBeHidden();
  await question.fill('What is the reported City rent?');
  await expect(page.locator('#agent-expansion')).toBeVisible();
  await expect(page.locator('#detail-content h3')).toBeVisible();
  await page.getByRole('button',{name:'Close Agent',exact:true}).click();
  await expect(page.locator('#agent-expansion')).toBeHidden();
  await expect(question).toHaveValue('What is the reported City rent?');
  await question.focus();
  await expect(page.locator('#agent-expansion')).toBeVisible();
  await question.press('Escape');
  await expect(page.locator('#agent-expansion')).toBeHidden();
  expect(requests).toEqual([]);
});

test.describe('production-bundled material',()=>{
  // Same dedicated offline Python server, but its built assets instead of Vite.
  test.use({baseURL:'http://127.0.0.1:8018'});
  test('glass backdrop blur survives CSS production minification',async({page})=>{
    await page.goto('/');
    await expect(page.locator('.area-row')).toHaveCount(4);
    await page.getByRole('button',{name:'Submarkets',exact:true}).hover();
    await expect(page.locator('#workspace-nav')).toBeVisible();
    await expect(page.locator('#workspace-nav')).toHaveCSS('backdrop-filter',/blur\(/);
    await expect(page.locator('#navigation-dock')).toHaveCSS('backdrop-filter','none');
    await expect(page.locator('.inspector-shell')).toHaveCSS('backdrop-filter','none');
    await expect(page.locator('.inspector')).toBeHidden();
    await openSection(page);
    await expect(page.locator('.inspector')).toHaveCSS('backdrop-filter',/blur\(/);
    await expect(page.locator('.agent-capsule')).toHaveCSS('backdrop-filter',/blur\(/);
    await page.getByRole('textbox',{name:'YOUR QUESTION'}).focus();
    await expect(page.locator('.agent-expansion')).toHaveCSS('backdrop-filter',/blur\(/);
    // An ancestor backdrop root would stop the wider answer surface sampling
    // the map, even when its own computed blur reports the right value.
    await expect(page.locator('.agent-shell')).toHaveCSS('backdrop-filter','none');
  });
});
