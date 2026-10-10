import type {Page} from '@playwright/test';

// User-facing navigation only; no test setter or alternate application mode.
export async function openSection(page: Page,label = 'Submarkets'): Promise<void> {
  await page.getByRole('button',{name:label,exact:true}).click();
}
