import {test, expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {localizeDescription} from '../src/i18n/descriptions';
import {isMessageKey} from '../src/i18n';

const snapshot = JSON.parse(readFileSync(new URL('../../data/snapshot.json', import.meta.url), 'utf8'));
const sourceNames = new Set(['BNP Midtown','Farebrother Midtown','Farebrother WC1','Farebrother WC2','Savills Central London','Savills City','Savills West End']);
const latestIds = new Set<string>(snapshot.research.latest_update?.record_ids ?? []);
function fields(row: Record<string, unknown>, names: string[]): string[] {
  return names.flatMap(name => typeof row[name] === 'string' ? [row[name] as string] : Array.isArray(row[name]) ? (row[name] as unknown[]).filter((value): value is string => typeof value === 'string') : []);
}
const descriptions = [
  ...fields(snapshot.research, ['scope_note','warnings']),
  ...snapshot.research.records.filter((row: Record<string, unknown>) => !latestIds.has(String(row.id))).flatMap((row: Record<string, unknown>) => fields(row, ['label','definition','denominator','caveats','source_geography','statistical_window','target_window'])),
  ...snapshot.research.exclusions.flatMap((row: Record<string, unknown>) => fields(row, ['label','reason'])),
  ...snapshot.research.comparisons.flatMap((row: Record<string, unknown>) => fields(row, ['label','source_geography','previous_window','current_window','warnings'])),
  ...snapshot.notes.flatMap((row: Record<string, unknown>) => fields(row, ['title','summary','kind','period'])),
  ...snapshot.areas.flatMap((row: Record<string, unknown>) => fields(row, ['definition'])),
  ...snapshot.metrics.flatMap((row: Record<string, unknown>) => fields(row, ['definition'])),
  ...snapshot.limitations
];
for (const language of ['zh-Hans','zh-Hant'] as const) {
  test(`${language}: every current curated research/permission/definition description is translated`, () => {
    const untranslated = [...new Set<string>(descriptions)].filter(original =>
      /[a-z]/i.test(original) && !sourceNames.has(original) && !/^\d{4}(?:-Q[1-4]|-\d{2})?$/.test(original)
      && localizeDescription(original, language) === original
    );
    expect(untranslated).toEqual([]);
  });
}

test('historical research kinds retain UI keys and new original-language updates retain explicit kinds', () => {
  for (const record of snapshot.research.records) {
    if (latestIds.has(record.id)) expect(['country_context', 'source_period_actual']).toContain(record.kind);
    else expect(isMessageKey(`research.kind.${record.kind}`)).toBe(true);
    expect(isMessageKey(`status.${record.status}`)).toBe(true);
  }
});

test('latest verified descriptions stay original under the explicit no-new-translation scope', () => {
  for (const row of snapshot.research.records.filter((item: {id: string}) => latestIds.has(item.id))) {
    for (const language of ['zh-Hans', 'zh-Hant'] as const) {
      expect(localizeDescription(row.label, language)).toBe(row.label);
    }
  }
});

test('exact originals guard stale translations; unknown source text and numeric units remain original', () => {
  expect(localizeDescription('External reuse permission required; values/excerpts not admitted.', 'en')).toBe('External reuse permission required; values/excerpts not admitted.');
  expect(localizeDescription('External reuse permission policy changed.', 'zh-Hans')).toBe('External reuse permission policy changed.');
  for (const value of ['£105.26 / sq ft', '+6.75 %', '9,300,000 sq ft', '£118.1m']) expect(localizeDescription(value, 'zh-Hant')).toBe(value);
  expect(localizeDescription('59 % of space acquired', 'zh-Hans')).toBe('59 % 占已承租面积');
  expect(localizeDescription('circa 110,000 sq ft', 'zh-Hant')).toBe('約 110,000 sq ft');
  expect(localizeDescription('around a third — not converted to an exact percentage', 'zh-Hans')).toBe('约三分之一 — 未转换为精确百分比');
});

test('Python growth mismatch keeps exact figures and source place names while translating the explanation', () => {
  const original = 'reported_growth_mismatch: West End prime_rent snapshot change 3.15% versus publisher 9.3%. Baseline/sample revision or another reason has not been verified.';
  expect(localizeDescription(original, 'zh-Hans')).toBe('报告增长不一致：West End 平均 Prime 成交租金 快照变动 3.15%，发布方报告 9.3%。是否存在基期／样本修订或其他原因尚未核验。');
  expect(localizeDescription(original, 'en')).toBe(original);
});
