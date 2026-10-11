// Portable Implementation of the existing check commands and their deadlines.
// Node launches pinned local CLIs directly, without bash/npm.cmd argument quoting.
import {spawnSync} from 'node:child_process';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {frontendRoot, projectRoot, pythonExecutable} from './python.mjs';

const [mode, ...filters] = process.argv.slice(2);
const budgets = {quick: 10, focused: 30, full: 60, e2e: null};
if (!(mode in budgets) || (mode === 'focused' && filters.length === 0)) {
  console.error('Pass a test file and optional -g filter to check:focused; modes: quick, focused, full, e2e');
  process.exit(2);
}
const budget = budgets[mode];
const start = performance.now();
const elapsed = () => (performance.now() - start) / 1000;
const env = {...process.env, PYTHONUTF8: '1'};
if (mode !== 'quick') env.PLAYWRIGHT_BROWSERS_PATH = join(frontendRoot, '.pw-browsers');
if (mode === 'focused' || mode === 'full') {
  env.OFFICE_PRODUCTION = '1';
  env.OFFICE_EVIDENCE_DIR = join(projectRoot, 'artifacts', 'checks', `${new Date().toISOString().replace(/[-:.]/g, '')}-${process.pid}`);
  mkdirSync(env.OFFICE_EVIDENCE_DIR, {recursive: true});
  console.log(`Evidence: ${env.OFFICE_EVIDENCE_DIR}`);
}

function run(command, args, cwd = frontendRoot) {
  const remaining = budget === null ? undefined : Math.floor((budget - 1 - elapsed()) * 1000);
  if (remaining !== undefined && remaining <= 0) throw new Error('Existing check deadline exhausted');
  const result = spawnSync(command, args, {cwd, env, stdio: 'inherit', timeout: remaining});
  if (result.error || result.status !== 0) {
    if (result.error) console.error(result.error.message);
    const failure = new Error('Check command failed');
    failure.status = result.status || 1;
    throw failure;
  }
}
const nodeCli = (name, ...args) => run(process.execPath, [join(frontendRoot, 'node_modules', name), ...args]);
let status = 0;
try {
  if (mode === 'quick' || mode === 'full') {
    run(pythonExecutable(), ['-m', 'unittest', 'discover', '-s', 'tests', '-v'], projectRoot);
  }
  if (mode !== 'e2e') nodeCli('typescript/bin/tsc', '--noEmit');
  if (mode === 'focused' || mode === 'full') nodeCli('vite/bin/vite.js', 'build');
  if (mode !== 'quick') {
    const deadline = budget === null ? [] : ['--global-timeout', String(Math.floor((budget - 2 - elapsed()) * 1000))];
    if (budget !== null && Number(deadline[1]) <= 0) throw new Error('Existing browser deadline exhausted');
    nodeCli('@playwright/test/cli.js', 'test', ...deadline, ...filters);
  }
} catch (error) {
  console.error(error.message);
  status = error.status || 1;
} finally {
  console.log(`${mode} wall: ${elapsed().toFixed(2)}s${budget === null ? '' : ` (budget ${budget}s; 1s exit margin)`}`);
  if (budget !== null && elapsed() >= budget - 1) status = 1;
}
process.exitCode = status;
