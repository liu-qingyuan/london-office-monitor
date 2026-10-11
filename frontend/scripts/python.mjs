import {fileURLToPath} from 'node:url';
import {join} from 'node:path';

export const projectRoot = fileURLToPath(new URL('../../', import.meta.url));
export const frontendRoot = join(projectRoot, 'frontend');

export function pythonExecutable() {
  return join(projectRoot, '.venv', ...(process.platform === 'win32' ? ['Scripts', 'python.exe'] : ['bin', 'python']));
}
