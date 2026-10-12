import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import * as ui from '../src/i18n';
const {createI18n} = ui;

test('a new i18n instance defaults to English UI text', () => {
  const i18n = createI18n();
  expect(i18n.language).toBe('en');
  expect(i18n.t('nav.market')).toBe('Submarkets');
});

test('language changes translate UI labels without changing another in-memory instance', () => {
  const i18n = createI18n();
  const separate = createI18n();
  i18n.setLanguage('zh-Hans');
  expect(i18n.language).toBe('zh-Hans');
  expect(i18n.t('nav.market')).toBe('子市场');
  i18n.setLanguage('zh-Hant');
  expect(i18n.language).toBe('zh-Hant');
  expect(i18n.t('nav.market')).toBe('子市場');
  i18n.setLanguage('en');
  expect(i18n.t('nav.market')).toBe('Submarkets');
  expect(separate.language).toBe('en');
});

test('interpolation preserves supplied numbers, names and statistical windows verbatim', () => {
  const i18n = createI18n();
  expect(i18n.t('workspace.coverage', {available: 2, total: 4})).toBe('2 of 4 areas have reported values for this selection.');
  const parameters = {area: 'City / West End', metric: '£105.30 / sq ft', period: 'Q4 2025'};
  i18n.setLanguage('zh-Hans');
  expect(i18n.t('agent.context', parameters)).toBe('地图选择：City / West End · £105.30 / sq ft · Q4 2025。你也可以询问其他市场。');
  i18n.setLanguage('zh-Hant');
  expect(i18n.t('agent.context', parameters)).toBe('地圖選擇：City / West End · £105.30 / sq ft · Q4 2025。你也可以詢問其他市場。');
  expect(i18n.t('error.market', {detail: '<b>Savills & CBRE</b> {period}'})).toBe('市場 API 錯誤 · <b>Savills & CBRE</b> {period}');
});

test('only real language changes notify subscribers, and unsubscribe stops notifications', () => {
  const i18n = createI18n();
  const seen: string[] = [];
  const unsubscribe = i18n.subscribe(language => {
    expect(i18n.language).toBe(language);
    seen.push(language);
  });
  expect(seen).toEqual([]);
  i18n.setLanguage('en');
  i18n.setLanguage('zh-Hans');
  i18n.setLanguage('zh-Hans');
  i18n.setLanguage('zh-Hant');
  i18n.setLanguage('en');
  expect(seen).toEqual(['zh-Hans', 'zh-Hant', 'en']);
  unsubscribe();
  unsubscribe();
  i18n.setLanguage('zh-Hans');
  expect(seen).toEqual(['zh-Hans', 'zh-Hant', 'en']);
});

test('explicit language application changes only the supplied root language', () => {
  const root = {lang: 'en', originalQuote: 'Savills: £105.30 / sq ft', statisticalWindow: 'Q4 2025'};
  ui.applyLanguage(root, 'zh-Hans');
  expect(root).toEqual({lang: 'zh-Hans', originalQuote: 'Savills: £105.30 / sq ft', statisticalWindow: 'Q4 2025'});
  ui.applyLanguage(root, 'zh-Hant');
  expect(root.lang).toBe('zh-Hant');
  ui.applyLanguage(root, 'en');
  expect(root.lang).toBe('en');
});

const placeholders = (text: string): string[] => Array.from(text.matchAll(/\{([A-Za-z][A-Za-z0-9_]*)\}/g), match => match[1]!).sort();
const messageKeys = Object.keys(ui.dictionaries.en) as ui.MessageKey[];

for (const language of ui.languages) {
  test(`${language} dictionary has every English key and matching interpolation placeholders`, () => {
    const dictionary = ui.dictionaries[language];
    expect(Object.keys(dictionary).sort()).toEqual([...messageKeys].sort());
    const i18n = createI18n();
    i18n.setLanguage(language);
    for (const key of messageKeys) {
      expect(dictionary[key].trim(), `${language}/${key}`).not.toBe('');
      expect(placeholders(dictionary[key]), `${language}/${key}`).toEqual(placeholders(ui.dictionaries.en[key]));
      const parameters = Object.fromEntries(placeholders(ui.dictionaries.en[key]).map(name => [name, `<${name}>`]));
      const translated = i18n.t(key, parameters);
      expect(translated, `${language}/${key}`).not.toMatch(/\{[A-Za-z][A-Za-z0-9_]*\}/);
      for (const name of placeholders(ui.dictionaries.en[key])) expect(translated).toContain(`<${name}>`);
      if (language !== 'en') expect(dictionary[key], `${language}/${key}`).toMatch(/\p{Script=Han}/u);
    }
  });
}

test('all nine navigation labels, controls and evidence constraints have explicit translations', () => {
  const sections = ['market', 'rents', 'vacancy', 'leasing', 'supply', 'macro', 'demand', 'news', 'layers'];
  for (const language of ui.languages) {
    expect(Object.keys(ui.dictionaries[language]).filter(key => key.startsWith('nav.')).sort()).toEqual(sections.map(id => `nav.${id}`).sort());
  }
  const i18n = createI18n();
  i18n.setLanguage('zh-Hans');
  expect(i18n.t('filter.measure')).toBe('指标');
  expect(i18n.t('button.originalSource')).toBe('阅读原始来源 ↗');
  expect(i18n.t('research.statisticalWindow')).toBe('统计窗口');
  expect(i18n.t('research.forecastLimit')).toContain('预测不是实际报告值');
  expect(i18n.t('research.evidenceLimit')).toContain('缺失或未发布值不是零');
  i18n.setLanguage('zh-Hant');
  expect(i18n.t('filter.measure')).toBe('指標');
  expect(i18n.t('button.originalSource')).toBe('閱讀原始來源 ↗');
  expect(i18n.t('status.noVerifiedData')).toBe('無已核驗資料');
  expect(i18n.t('research.forecastLimit')).toContain('未知日期仍為未知');
  expect(i18n.t('research.evidenceLimit')).toContain('僅來源引文保留原文');
  expect(i18n.t('research.evidenceLimit')).toContain('頁面研究說明按介面語言展示');
});

test('invalid languages, unknown keys and absent interpolation parameters fail explicitly', () => {
  const i18n = createI18n();
  const notifications: string[] = [];
  i18n.subscribe(language => notifications.push(language));
  for (const value of ['zh', 'zh-CN', 'fr', 'constructor', '', null]) expect(ui.isLanguage(value)).toBe(false);
  expect(() => i18n.setLanguage('fr' as ui.Language)).toThrow('Unsupported UI language');
  expect(i18n.language).toBe('en');
  expect(notifications).toEqual([]);
  expect(ui.isMessageKey('nav.market')).toBe(true);
  expect(ui.isMessageKey('constructor')).toBe(false);
  expect(ui.isMessageKey('Market research conclusion')).toBe(false);
  expect(() => i18n.t('constructor' as ui.MessageKey)).toThrow('Unknown UI message');
  expect(() => i18n.t('workspace.coverage', {available: 2})).toThrow('Missing interpolation parameter "total"');
  const inherited = Object.create({available: 2, total: 4}) as ui.MessageParams;
  expect(() => i18n.t('workspace.coverage', inherited)).toThrow('Missing interpolation parameter');
  const root = {lang: 'en'};
  expect(() => ui.applyLanguage(root, 'zh' as ui.Language)).toThrow('Unsupported UI language');
  expect(root.lang).toBe('en');
});

test('language choice names remain self-identifying in all three languages', () => {
  expect(ui.languages).toEqual(['en', 'zh-Hans', 'zh-Hant']);
  expect(ui.languageNames).toEqual({en: 'English', 'zh-Hans': '简体中文', 'zh-Hant': '繁體中文'});
  for (const language of ui.languages) expect(ui.isLanguage(language)).toBe(true);
});

test('memory-only switching does not use browser storage or make a fetch request', () => {
  const requests: unknown[] = [];
  const fetch = globalThis.fetch;
  const blockedStorage = new Proxy({}, {get: () => { throw new Error('Storage must not be read'); }});
  const storageDescriptors = ['localStorage', 'sessionStorage'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)] as const);
  globalThis.fetch = async (...args) => { requests.push(args); throw new Error('Switch must not fetch'); };
  for (const [name] of storageDescriptors) Object.defineProperty(globalThis, name, {configurable: true, value: blockedStorage});
  try {
    const i18n = createI18n();
    for (const language of ui.languages) { i18n.setLanguage(language); i18n.t('nav.market'); }
    expect(requests).toEqual([]);
    expect(createI18n().language).toBe('en');
  } finally {
    globalThis.fetch = fetch;
    for (const [name, descriptor] of storageDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else Reflect.deleteProperty(globalThis, name);
    }
  }
});

test('language CSS selects installed system font stacks for text and numeric-label fallbacks', () => {
  const css = readFileSync(new URL('../src/i18n/style.css', import.meta.url), 'utf8');
  expect(css).not.toMatch(/@import|@font-face|url\s*\(/i);
  const fontStacks = Object.fromEntries([...css.matchAll(/--((?:font|mono)-[a-z-]+):\s*([^;]+);/g)].map(match => [match[1]!, match[2]!]));
  const suffixes: Record<ui.Language, string> = {en: 'en', 'zh-Hans': 'zh-hans', 'zh-Hant': 'zh-hant'};
  for (const language of ui.languages) {
    const suffix = suffixes[language];
    expect(css).toContain(`:root[lang='${language}'] { --ui-font: var(--font-${suffix}); --mono: var(--mono-${suffix}); }`);
    expect(fontStacks[`font-${suffix}`]).toMatch(/sans-serif$/);
    expect(fontStacks[`mono-${suffix}`]).toMatch(/monospace$/);
  }
  expect(fontStacks['font-en']).toContain("'Segoe UI'");
  for (const prefix of ['font', 'mono']) {
    expect(fontStacks[`${prefix}-zh-hans`]).toContain("'PingFang SC'");
    expect(fontStacks[`${prefix}-zh-hans`]).toContain("'Microsoft YaHei'");
    expect(fontStacks[`${prefix}-zh-hans`]).toContain("'Noto Sans CJK SC'");
    expect(fontStacks[`${prefix}-zh-hant`]).toContain("'PingFang TC'");
    expect(fontStacks[`${prefix}-zh-hant`]).toContain("'Microsoft JhengHei'");
    expect(fontStacks[`${prefix}-zh-hant`]).toContain("'Noto Sans CJK TC'");
  }
  expect(css).toContain('font-family: var(--ui-font)');
  expect(css).toContain('button, input, select, textarea { font-family: inherit; }');
});
