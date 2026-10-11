import {defineConfig, devices} from '@playwright/test';
import {projectRoot, pythonExecutable} from './scripts/python.mjs';

// Test only this project's dedicated servers and Playwright-managed Chromium.
// A port collision fails instead of attaching to somebody else's process.
const production = process.env.OFFICE_PRODUCTION === '1';
const userRenderer = process.env.OFFICE_USER_RENDERER === '1';
const evidenceDir = process.env.OFFICE_EVIDENCE_DIR ?? '../artifacts/playwright-results';
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Two independent contexts overlap startup without sharing UI state.
  // Higher concurrency polluted presentation budgets and did not close the
  // software-renderer deadline. Use --workers=1 for isolated acceptance.
  workers: 2,
  forbidOnly: true,
  retries: 0,
  reporter: [
    ['list'],
    ['json', {outputFile: `${evidenceDir}/results.json`}],
    ['html', {outputFolder: `${evidenceDir}/report`, open: 'never'}]
  ],
  outputDir: `${evidenceDir}/test-results`,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: production ? 'http://127.0.0.1:8018' : 'http://127.0.0.1:5178',
    headless: !userRenderer,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {args: userRenderer ? ['--enable-webgl'] : ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
  },
  webServer: [
    {command: `"${pythonExecutable()}" -m london_office serve --port 8018 --no-agent`, cwd: projectRoot, env: {PYTHONUTF8: '1'}, url: 'http://127.0.0.1:8018/api/catalog', reuseExistingServer: false, timeout: 30000},
    ...(production ? [] : [{command: 'npm run dev', url: 'http://127.0.0.1:5178/', env: {BACKEND_URL: 'http://127.0.0.1:8018'}, reuseExistingServer: false, timeout: 30000}])
  ]
});
