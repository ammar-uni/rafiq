import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

try {
  const status = JSON.parse(readFileSync(resolve(process.env.RAFIQ_STATUS_PATH || 'output/rafiq-status.json'), 'utf8'));
  const ageMs = Date.now() - status.lastHeartbeat;
  if (status.state !== 'ready' || status.ready !== true || !Number.isFinite(ageMs) || ageMs < 0 || ageMs > 20000) throw new Error();
  console.log('Rafiq gateway is ready and its worker heartbeat is current.');
} catch {
  console.error('Rafiq is not ready or its worker heartbeat is stale. Check the runtime log.');
  process.exitCode = 1;
}
