import {test, expect} from '@playwright/test';
import {openSection} from './navigation';

for (const width of [1600, 390]) {
  test(`frosted rounded dashboard and source-backed chart fit ${width}px without losing navigation`, async ({page}, info) => {
    await page.setViewportSize({width, height: 1000});
    await page.goto('/');
    const mapBefore = await page.locator('#map').boundingBox();
    await openSection(page, 'Leasing activity');
    const panel = page.locator('#market-panel');
    const bar = page.locator('[data-research-chart="take-up-bars"]');
    await expect(bar).toBeVisible();
    await expect(bar).toContainText('373,298 sq ft');
    const geometry = await panel.evaluate(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {radius: parseFloat(style.borderRadius), background: style.backgroundColor, blur: style.backdropFilter,
        x: rect.x, y: rect.y, bottom: rect.bottom, right: rect.right, width: rect.width, client: element.clientWidth, scroll: element.scrollWidth};
    });
    const mapAfter = await page.locator('#map').boundingBox();
    expect(mapAfter).toEqual(mapBefore);
    expect(mapAfter!.x).toBe(0);
    expect(mapAfter!.width).toBe(width);
    expect(mapAfter!.height).toBe(1000);
    expect(geometry.radius).toBeGreaterThanOrEqual(20);
    expect(geometry.background).toMatch(/rgba\(.+, 0\./);
    expect(geometry.blur).toContain('blur');
    expect(geometry.x).toBeGreaterThanOrEqual(0);
    expect(geometry.y).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(1000);
    await expect(panel).toBeInViewport();
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.scroll).toBeLessThanOrEqual(geometry.client + 1);
    await expect(page.locator('.snapshot-current')).toContainText('2026');
    await expect(page.locator('.snapshot-map-period')).toContainText('2024 — 2025');
    await bar.scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath(`glass-charts-${width}.png`)});
    await openSection(page, 'Demand drivers');
    const ring = page.locator('[data-research-chart="professional-services-ring"]');
    await ring.scrollIntoViewIfNeeded();
    await expect(ring).toContainText('31%');
    const bounds = await ring.locator('svg').evaluate(element => {
      const parent = element.parentElement!.getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      return {left: rect.left, right: rect.right, containerLeft: parent.left, containerRight: parent.right};
    });
    expect(bounds.left).toBeGreaterThanOrEqual(bounds.containerLeft);
    expect(bounds.right).toBeLessThanOrEqual(bounds.containerRight);
    await page.screenshot({path: info.outputPath(`glass-ring-${width}.png`)});
    await expect(page.locator('#workspace-nav')).toBeVisible();
    await info.attach('real-dashboard-surface', {body: JSON.stringify({geometry, bounds, mapBefore, mapAfter}), contentType:'application/json'});
  });
}
