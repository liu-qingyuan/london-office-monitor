import {defineConfig, devices} from '@playwright/test';

// Test only this project's dedicated servers and Playwright-managed Chromium.
// A port collision fails instead of attaching to somebody else's process.
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: true,
  retries: process.env.CI ? 2 : 0,
  reporter: [
    ['list'],
    ['json', {outputFile: '../artifacts/playwright-results/results.json'}],
    ['html', {outputFolder: '../artifacts/playwright-results/report', open: 'never'}]
  ],
  outputDir: '../artifacts/playwright-results/test-results',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {args: ['--enable-webgl', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader']}
  },
  webServer: [
    {command: 'cd .. && .venv/bin/python -m london_office serve --port 8018 --no-agent', url: 'http://127.0.0.1:8018/api/catalog', reuseExistingServer: false, timeout: 30000},
    {command: 'npm run dev', url: 'http://127.0.0.1:5178/', env: {BACKEND_URL: 'http://127.0.0.1:8018'}, reuseExistingServer: false, timeout: 30000}
  ]
});
