import { resolve } from 'node:path';
import { supervise } from '../src/supervisor.mjs';
import { runtimeLog, safeErrorCode } from '../src/runtime-log.mjs';

const statusPath = resolve(process.env.RAFIQ_STATUS_PATH || 'output/rafiq-status.json');
try {
  const runner = supervise({ entrypoint: new URL('../src/index.mjs', import.meta.url), statusPath });
  process.once('SIGINT', () => { void runner.stop(); });
  process.once('SIGTERM', () => { void runner.stop(); });
  process.exitCode = await runner.done;
} catch (error) {
  runtimeLog('supervisor-failed', { code: safeErrorCode(error) });
  process.exitCode = error.code === 'RAF_STORAGE' ? 73 : 1;
}
