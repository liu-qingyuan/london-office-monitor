import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import type {ChatResult, Market} from '../src/types';
import {localizeDescription} from '../src/i18n/descriptions';

const copy = [
  {language: 'en', selector: 'Interface language', heading: 'London office markets', panel: 'Submarkets', measure: 'Average prime rent', window: 'Statistical window', source: 'Read original source ↗', font: 'Segoe UI'},
  {language: 'zh-Hans', selector: '界面语言', heading: '伦敦写字楼市场', panel: '子市场', measure: '平均 Prime 成交租金', window: '统计窗口', source: '阅读原始来源 ↗', font: 'PingFang SC'},
  {language: 'zh-Hant', selector: '介面語言', heading: '倫敦寫字樓市場', panel: '子市場', measure: '平均 Prime 成交租金', window: '統計窗口', source: '閱讀原始來源 ↗', font: 'PingFang TC'}
] as const;

// Real Python Market + production map. Browser locale is not the application preference.
for (const width of [1600, 1000, 390]) {
  test.describe(`three-language real workspace ${width}`, () => {
    test.use({viewport: {width, height: width === 390 ? 844 : 1000}, hasTouch: width === 390, locale: 'zh-TW'});
    test('upper-left switch preserves real evidence, map, panels and input without any API refresh', async ({page, request}, testInfo) => {
      const apiCalls: string[] = [], errors: string[] = [];
      page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) apiCalls.push(`${request.method()} ${request.url()}`); });
      page.on('pageerror', error => errors.push(error.message));
      const response = await request.get('/api/market?metric=prime_rent&period=2025-YE');
      expect(response.ok()).toBe(true);
      const market = await response.json() as Market;
      await testInfo.attach('real-market-input', {body: JSON.stringify(market, null, 2), contentType: 'application/json'});
      await page.goto('/');
      await expect(page.locator('.area-row')).toHaveCount(4);
      await expect(page.getByRole('combobox', {name: 'Interface language'})).toBeVisible();
      const nav = page.getByRole('button', {name: 'Submarkets', exact: true});
      if (width === 390) { await nav.tap(); await nav.tap(); } else await nav.click();
      await expect(page.locator('#detail-content .comparison')).toBeVisible();
      await expect.poll(() => page.evaluate(() => window.__officeMapDebug!.state().renderedBuildingCount)).toBeGreaterThan(20);
      await expect.poll(() => page.evaluate(() => window.__officeMapDebug!.state().moving)).toBe(false);
      const mapBefore = await page.evaluate(() => window.__officeMapDebug!.state());
      const selectedValue = await page.locator('.selected-observation strong').textContent();
      const evidence = page.locator('#detail-content .evidence-card').last();
      await evidence.locator('summary').click();
      const quote = await evidence.locator('blockquote').textContent();
      const sourceHref = await evidence.getByRole('link').getAttribute('href');
      const record = market.research!.records.find(record => record.topic_ids.includes('submarkets'))!;
      const card = page.locator(`[data-research-id="${record.id}"]`);
      await page.locator('#question').fill('Keep this unsent question · 原始问题');
      const before = apiCalls.length;
      const fonts: unknown[] = [];
      const cdp = await page.context().newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      for (const expected of copy) {
        await page.locator('#language-settings select').selectOption(expected.language);
        await expect(page.locator('html')).toHaveAttribute('lang', expected.language);
        await expect(page.locator('#page-title')).toHaveText(expected.heading);
        await expect(page.locator('#panel-title')).toHaveText(expected.panel);
        await expect(page.locator('#metrics')).toContainText(expected.measure);
        await expect(page.locator('#question')).toHaveValue('Keep this unsent question · 原始问题');
        await expect(page.locator('#market-panel')).toBeVisible();
        await expect(page.locator('#agent-expansion')).toBeVisible();
        await expect(page.locator('#workspace-nav .workspace-nav-item')).toHaveCount(9);
        await expect(page.locator('#workspace-nav .nav-item-icon svg')).toHaveCount(9);
        await expect(page.locator('.selected-observation strong')).toHaveText(selectedValue!);
        await expect(evidence).toHaveAttribute('open', '');
        await expect(evidence.locator('blockquote')).toHaveText(quote!);
        await expect(evidence.getByRole('link', {name: expected.source})).toHaveAttribute('href', sourceHref!);
        await expect(card.locator('dt').filter({hasText: expected.window})).toHaveCount(1);
        await expect(card).toContainText(localizeDescription(record.statistical_window, expected.language));
        await expect(card).toContainText(localizeDescription(record.source_geography, expected.language));
        await expect(card.locator('.research-value')).toHaveText(localizeDescription(record.display_value, expected.language));
        await expect(page.locator('#page-title')).toHaveCSS('font-family', new RegExp(expected.font));
        const bounds = await page.locator('#language-settings').boundingBox();
        expect(bounds!.x).toBeGreaterThanOrEqual(0); expect(bounds!.x + bounds!.width).toBeLessThan(width / 2 + (width === 390 ? 170 : 0));
        expect(bounds!.y + bounds!.height).toBeLessThan(80);
        const agentBounds = await page.locator('.agent-shell').boundingBox();
        expect(bounds!.x + bounds!.width <= agentBounds!.x || bounds!.y + bounds!.height <= agentBounds!.y).toBe(true);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        expect(await page.locator('#reset-map span').evaluate(label => {
          const text = document.createRange(); text.selectNodeContents(label);
          return text.getClientRects().length === 1;
        })).toBe(true);
        const mapAfter = await page.evaluate(() => window.__officeMapDebug!.state());
        for (const key of ['zoom','bearing','pitch','center'] as const) expect(mapAfter[key]).toEqual(mapBefore[key]);
        await expect(page.locator('.area-row.selected')).toHaveAttribute('data-area', 'city');
        expect(mapAfter.baseMapStatus).toBe('available');
        const {root} = await cdp.send('DOM.getDocument');
        const {nodeId} = await cdp.send('DOM.querySelector', {nodeId: root.nodeId, selector: '#page-title'});
        const platformFonts = await cdp.send('CSS.getPlatformFontsForNode', {nodeId});
        expect(platformFonts.fonts.some(font => !font.isCustomFont && font.glyphCount > 0)).toBe(true);
        fonts.push({language: expected.language, ...platformFonts});
        await page.screenshot({path: testInfo.outputPath(`${expected.language}-${width}.png`)});
      }
      await cdp.detach();
      expect(apiCalls.slice(before)).toEqual([]);
      expect(errors).toEqual([]);
      await testInfo.attach('languages-and-platform-fonts', {body: JSON.stringify({viewport: {width}, fonts, apiCalls, mapBefore}, null, 2), contentType: 'application/json'});
    });
  });
}

test('selector is keyboard-focusable and its language preference resets on reload', async ({page}) => {
  await page.goto('/');
  const selector = page.getByRole('combobox', {name: 'Interface language'});
  await selector.focus();
  await expect(selector).toBeFocused();
  // Choice is driven through Playwright's native select support; macOS native popup
  // ArrowDown is not handled by the automation protocol even in a plain-select repro.
  await selector.selectOption('zh-Hans');
  await expect(page.locator('html')).toHaveAttribute('lang', 'zh-Hans');
  await expect(page.getByRole('combobox', {name: '界面语言'})).toBeFocused();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('combobox', {name: 'Interface language'})).toHaveValue('en');
});

test('research descriptions, permission gaps and warnings are localized rather than treated as quotations', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await page.getByRole('button', {name: 'Demand drivers', exact: true}).click();
  await page.locator('#language-settings select').selectOption('zh-Hans');
  await expect(page.locator('.research-exclusions')).toContainText('历史门禁刷卡出勤占最大容量的比例');
  await expect(page.locator('.research-exclusions')).toContainText('需要外部复用许可；数值和摘录尚未获准接纳');
  await expect(page.locator('.research-exclusions')).not.toContainText('External reuse permission required');
  await expect(page.locator('#section-content')).not.toContainText('Historical research, not current/live');
  await page.locator('#language-settings select').selectOption('zh-Hant');
  await expect(page.locator('.research-exclusions')).toContainText('歷史門禁刷卡出勤占最大容量的比例');
  await expect(page.locator('.research-exclusions')).toContainText('需要外部複用許可；數值和摘錄尚未獲准接納');
});

const recorded = JSON.parse(readFileSync(new URL('./fixtures/city-rent-recorded-run.json', import.meta.url), 'utf8')) as {question: string; response: ChatResult};
test('recorded Agent replay localizes its description without rewriting evidence or expected tool JSON', async ({page}, testInfo) => {
  // Recorded historical answer + fixture's expected tool-output extension, not a new model run.
  // Interception occurs before the Python backend.
  let release!: () => void;
  const released = new Promise<void>(resolve => { release = resolve; });
  const posts: unknown[] = [];
  await page.route('**/api/chat', async route => { posts.push(route.request().postDataJSON()); await released; await route.fulfill({json: recorded.response}); });
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  await page.locator('#question').fill(recorded.question);
  await page.getByRole('button', {name: 'Ask assistant', exact: true}).click();
  await expect(page.locator('#agent-result')).toContainText('Waiting for the assistant');
  await page.locator('#language-settings select').selectOption('zh-Hans');
  await expect(page.locator('#agent-result')).toContainText('正在等待助手');
  await expect(page.locator('.ask-button')).toBeDisabled();
  await expect(page.locator('#question')).toHaveValue(recorded.question);
  release();
  await expect(page.locator('.answer-text')).toHaveText('City 平均 Prime 成交租金在所请求的两次年末快照之间上涨，达到报告中的纪录高位。这是成交租金，不是最高租金或标价租金。');
  const call = page.locator('.tool-call').first();
  await call.locator('summary').first().click();
  await call.locator('.raw-tool-details summary').click();
  const raw = JSON.stringify(recorded.response.tool_calls[0]!.output, null, 2);
  await expect(call.locator('.tool-output')).toHaveText(raw);
  for (const language of ['zh-Hant', 'en', 'zh-Hans'] as const) {
    await page.locator('#language-settings select').selectOption(language);
    await expect(page.locator('.answer-text')).toHaveText(localizeDescription(recorded.response.answer, language));
    await expect(page.locator('#answer-question')).toHaveText(recorded.question);
    await expect(call).toHaveAttribute('open', '');
    await expect(call.locator('.raw-tool-details')).toHaveAttribute('open', '');
    await expect(call.locator('.tool-output')).toHaveText(raw);
    await expect(page.locator('.answer-fact strong').first()).toContainText('£');
  }
  expect(posts).toHaveLength(1);
  await testInfo.attach('historical-replay-input-not-new-model', {body: JSON.stringify(recorded, null, 2), contentType: 'application/json'});
  await page.screenshot({path: testInfo.outputPath('historical-agent-replay-zh-Hans.png')});
});
