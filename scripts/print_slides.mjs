// Print only this project's self-contained HTML with a dedicated Chromium.
import {createRequire} from 'node:module';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
process.env.PLAYWRIGHT_BROWSERS_PATH = resolve(root, 'frontend/.pw-browsers');
const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const {chromium} = require('@playwright/test');
const browser = await chromium.launch();
try {
  const page = await browser.newPage({viewport: {width: 1280, height: 720}});
  await page.goto(pathToFileURL(resolve(root, 'artifacts/presentation/london-office-monitor.html')).href);
  await page.pdf({path: resolve(root, 'artifacts/presentation/london-office-monitor.pdf'), printBackground: true, preferCSSPageSize: true});
  for (let i = 0; i < 5; i++) {
    await page.locator('.slide').nth(i).screenshot({path: resolve(root, `artifacts/presentation/slide-${i + 1}.png`)});
  }
  console.log('Printed PDF and captured five slide images. Check PDF page count independently.');
} finally {
  await browser.close();
}
