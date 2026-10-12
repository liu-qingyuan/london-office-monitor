import {test, expect} from '@playwright/test';
import type {Market, SourceTopicId} from '../src/types';
import {localizeDescription} from '../src/i18n/descriptions';

test('all eight research pages localize real descriptions while every original quotation, URL and Python value is preserved', async ({page, request}, info) => {
  const response = await request.get('/api/market?metric=prime_rent&period=2025-YE');
  expect(response.ok()).toBe(true);
  const market = await response.json() as Market;
  const topics: readonly SourceTopicId[] = ['submarkets','rents','vacancy','leasing','supply','macro','demand','news'];
  const originals = new Map<SourceTopicId, {quotes: string[]; urls: string[]}>();
  const calls: string[] = [];
  page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/')) calls.push(`${request.method()} ${request.url()}`); });
  await page.goto('/');
  await expect(page.locator('.area-row')).toHaveCount(4);
  for (const language of ['en','zh-Hans','zh-Hant'] as const) {
    // Explicit navigation can legitimately select the vacancy metric and fetch its data.
    // Finish that action first; switching the UI language itself must make no API request.
    await expect(page.locator('#global-status')).toBeEmpty();
    await expect(page.locator('#detail-content .comparison')).toHaveCount(1);
    const beforeSwitch = calls.length;
    await page.locator('#language-settings select').selectOption(language);
    await expect(page.locator('html')).toHaveAttribute('lang', language);
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
    expect(calls.slice(beforeSwitch)).toEqual([]);
    for (const topic of topics) {
      await page.locator(`#workspace-nav [data-section="${topic === 'submarkets' ? 'market' : topic}"]`).click();
      const section = page.locator(`#section-content [data-research-topic="${topic}"]`);
      await expect(section).toBeVisible();
      const actual = await section.evaluate(root => ({
        cards: [...root.querySelectorAll<HTMLElement>('[data-research-id]')].map(card => ({
          id: card.dataset.researchId,
          label: card.querySelector('h4')!.textContent,
          value: card.querySelector('.research-value')!.textContent,
          metadata: [...card.querySelectorAll('dd')].map(item => item.textContent),
          caveats: card.querySelector('.warning')?.textContent
        })),
        quotes: [...root.querySelectorAll('blockquote')].map(quote => quote.textContent!),
        urls: [...root.querySelectorAll<HTMLAnchorElement>('.research-source a')].map(link => link.href),
        limit: root.querySelector(':scope > .section-limit')!.textContent,
        warnings: root.querySelector(':scope > .warning')?.textContent,
        gaps: [...root.querySelectorAll('.research-exclusions p strong')].map(item => item.textContent)
      }));
      const records = market.research!.records.filter(record => record.topic_ids.includes(topic));
      expect(actual.cards).toHaveLength(records.length);
      for (const record of records) {
        const card = actual.cards.find(item => item.id === record.id)!;
        expect(card, `Every admitted record ${record.id} remains rendered once`).toBeDefined();
        expect(card.id).toBe(record.id);
        expect(card.label).toBe(localizeDescription(record.label, language));
        expect(card.value).toBe(localizeDescription(record.display_value, language));
        expect(card.metadata[0]).toBe(localizeDescription(record.source_geography, language));
        expect(card.metadata[1]).toBe(localizeDescription(record.statistical_window, language));
        expect(card.metadata).toContain(localizeDescription(record.definition, language));
        for (const caveat of record.caveats) expect(card.caveats).toContain(localizeDescription(caveat, language));
      }
      expect(actual.limit).toContain(localizeDescription(market.research!.scope_note, language));
      for (const warning of market.research!.warnings) expect(actual.warnings).toContain(localizeDescription(warning, language));
      expect(actual.gaps).toEqual(market.research!.exclusions.filter(item => item.topic_ids.includes(topic)).map(item => localizeDescription(item.label, language)));
      if (language === 'en') originals.set(topic, {quotes: actual.quotes, urls: actual.urls});
      else expect({quotes: actual.quotes, urls: actual.urls}).toEqual(originals.get(topic));
    }
    await page.locator('#workspace-nav [data-section="demand"]').click();
    await page.locator('.research-exclusions').scrollIntoViewIfNeeded();
    await page.screenshot({path: info.outputPath(`permission-gaps-${language}.png`)});
  }
  expect(calls.filter(call => call.startsWith('POST ') || /\/api\/(chat|discovery)/.test(call))).toEqual([]);
  await info.attach('real-eight-topic-input-and-request-trace', {body: JSON.stringify({market, calls}, null, 2), contentType: 'application/json'});
});
