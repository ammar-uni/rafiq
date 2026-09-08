import { resolve } from 'node:path';
import { supervise } from '../src/supervisor.mjs';
import { runtimeLog, safeErrorCode } from '../src/runtime-log.mjs';

const statusPath = resolve(process.env.RAFIQ_STATUS_PATH || 'output/rafiq-status.json');
try {
  const databasePath = resolve(process.env.RAFIQ_DATABASE_PATH || 'data/rafiq.enc');
  const normalize = path => process.platform === 'win32' ? path.toLowerCase() : path;
  const relatedFiles = path => [path, path + '.guard', path + '.lock'].map(normalize);
  const dataFiles = new Set(relatedFiles(databasePath));
  if (relatedFiles(statusPath).some(path => dataFiles.has(path))) {
    throw Object.assign(new Error('Health status and encrypted storage paths must be separate.'), { code: 'RAF_CONFIG' });
  }
  const runner = supervise({ entrypoint: new URL('../src/index.mjs', import.meta.url), statusPath });
  process.once('SIGINT', () => { void runner.stop(); });
  process.once('SIGTERM', () => { void runner.stop(); });
  process.exitCode = await runner.done;
} catch (error) {
  runtimeLog('supervisor-failed', { code: safeErrorCode(error) });
  process.exitCode = error.code === 'RAF_STORAGE' ? 73 : error.code === 'RAF_CONFIG' ? 78 : 1;
}
