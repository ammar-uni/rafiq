import test from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, readdirSync, rmSync, rmdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { Store } from '../src/store.mjs';
import { supervise } from '../src/supervisor.mjs';
import { safeErrorCode, runtimeLog } from '../src/runtime-log.mjs';

function temporary(t, beforeCleanup = async () => {}) {
  const folder = mkdtempSync(join(tmpdir(), 'rafiq-runtime-'));
  t.after(async () => {
    await beforeCleanup();
    for (const file of readdirSync(folder)) rmSync(join(folder, file));
    rmdirSync(folder);
  });
  return folder;
}

async function until(condition, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error('Condition timed out');
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

test('a killed process releases the storage lease and preserves encrypted preferences', async t => {
  const folder = temporary(t), filename = join(folder, 'data.enc');
  const key = randomBytes(32).toString('hex');
  const child = fork(new URL('./fixtures/lease-worker.mjs', import.meta.url), [], { execArgv: [],
    env: { ...process.env, TEST_DATA_FILE: filename, TEST_DATA_KEY: key }, stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
  t.after(() => child.kill('SIGKILL'));
  const [message] = await once(child, 'message');
  assert.equal(message.ready, true);
  assert.throws(() => new Store(filename, { encryptionKey: key }), /Cannot lock/);
  const closed = once(child, 'close'); child.kill('SIGKILL'); await closed;
  const recovered = new Store(filename, { encryptionKey: key });
  assert.equal(recovered.isSubscribed('123456789012345678', '234567890123456789'), true);
  recovered.close();
  assert.equal(readFileSync(filename + '.guard').length, 0);
  assert.equal(readFileSync(filename).includes(Buffer.from('123456789012345678')), false);
});

test('legacy locks and unexpected guard contents fail closed', t => {
  const folder = temporary(t), filename = join(folder, 'data.enc');
  const options = { encryptionKey: randomBytes(32).toString('hex') };
  writeFileSync(filename + '.lock', '123');
  assert.throws(() => new Store(filename, options), /legacy/);
  rmSync(filename + '.lock');
  writeFileSync(filename + '.guard', 'unrelated contents');
  assert.throws(() => new Store(filename, options), /guard must be empty/);
  assert.equal(readFileSync(filename + '.guard', 'utf8'), 'unrelated contents');
});

function runner(t, mode) {
  let handle;
  const folder = temporary(t, () => handle?.stop()), events = [];
  handle = supervise({ entrypoint: new URL('./fixtures/supervisor-worker.mjs', import.meta.url),
    env: { ...process.env, TEST_WORKER_MODE: mode, TEST_COUNT_FILE: join(folder, 'count') }, statusPath: join(folder, 'status.json'),
    restartBaseMs: 20, restartMaxMs: 80, stableMs: 60000, heartbeatTimeoutMs: 1000,
    offlineTimeoutMs: 1200, shutdownGraceMs: 80, checkEveryMs: 20,
    log: (event, fields) => events.push({ event, ...fields }) });
  return { ...handle, events, statusPath: join(folder, 'status.json'), status: () => JSON.parse(readFileSync(join(folder, 'status.json'), 'utf8')) };
}

test('a transient crash restarts once, reaches ready, and explicit stop does not restart', async t => {
  const r = runner(t, 'crash-once');
  await until(() => r.status().ready);
  assert.equal(r.events.filter(item => item.event === 'worker-restart-scheduled').length, 1);
  assert.equal(await r.stop(), 0);
  const starts = r.events.filter(item => item.event === 'worker-started').length;
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(r.events.filter(item => item.event === 'worker-started').length, starts);
  assert.equal(r.status().state, 'stopped');
});

test('a hung worker is killed after grace and replaced by a responsive worker', async t => {
  const r = runner(t, 'hang-once');
  await until(() => r.status().ready);
  assert.ok(r.events.some(item => item.event === 'worker-heartbeat-lost'));
  assert.ok(r.events.some(item => item.event === 'shutdown-deadline'));
  assert.ok(r.events.some(item => item.event === 'worker-restart-scheduled'));
});

test('a disconnected but responsive worker is restarted after its reconnect deadline', async t => {
  const r = runner(t, 'offline');
  await until(() => r.events.some(item => item.event === 'worker-restart-scheduled'));
  assert.ok(r.events.some(item => item.event === 'gateway-reconnect-deadline'));
  assert.equal(r.status().ready, false);
});

test('invalid credentials or configuration stop the supervisor without a retry loop', async t => {
  const r = runner(t, 'fatal');
  assert.equal(await r.done, 78);
  assert.ok(!r.events.some(item => item.event === 'worker-restart-scheduled'));
  assert.equal(r.status().state, 'failed');
  assert.equal(await r.stop(), 78);
  assert.equal(r.status().state, 'failed');
});

test('a second supervisor cannot overwrite the active health status', async t => {
  const r = runner(t, 'healthy');
  await until(() => r.status().ready);
  assert.throws(() => supervise({ entrypoint: new URL('./fixtures/supervisor-worker.mjs', import.meta.url),
    statusPath: r.statusPath }), /Cannot lock/);
  assert.equal(r.status().ready, true);
});

test('the real worker exits promptly when configuration is missing, even with IPC open', async () => {
  const child = fork(new URL('../src/index.mjs', import.meta.url), [], { execArgv: [],
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const deadline = setTimeout(() => child.kill('SIGKILL'), 5000);
  try {
    const [code, signal] = await once(child, 'close');
    assert.equal(signal, null);
    assert.equal(code, 78);
  } finally { clearTimeout(deadline); }
});

test('repeated failures back off up to the configured limit', async t => {
  const r = runner(t, 'crash-always');
  await until(() => r.events.filter(item => item.event === 'worker-restart-scheduled').length >= 4);
  assert.deepEqual(r.events.filter(item => item.event === 'worker-restart-scheduled').slice(0, 4).map(item => item.delayMs), [20, 40, 80, 80]);
});

test('runtime diagnostics omit messages, stacks and unrecognized fields', () => {
  const secret = 'secret.token/value';
  assert.equal(safeErrorCode({ code: secret, name: 'Error', message: secret }), 'Error');
  assert.equal(safeErrorCode({ code: 'ECONNRESET' }), 'ECONNRESET');
  const original = console.log, lines = [];
  console.log = line => lines.push(line);
  try { runtimeLog('test', { code: 'ECONNRESET', message: secret, token: secret, userId: 'private-user' }); }
  finally { console.log = original; }
  assert.equal(lines.length, 1);
  assert.ok(!lines[0].includes(secret) && !lines[0].includes('private-user'));
  assert.ok(JSON.parse(lines[0]).at);
});

test('the health command rejects stale, offline, missing and invalid status', t => {
  const folder = temporary(t), statusPath = join(folder, 'status.json');
  const check = () => spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/healthcheck.mjs', import.meta.url))],
    { env: { ...process.env, RAFIQ_STATUS_PATH: statusPath }, encoding: 'utf8', timeout: 5000 }).status;
  assert.equal(check(), 1);
  for (const status of [{ state: 'ready', ready: true, lastHeartbeat: Date.now() - 60000 },
    { state: 'connecting', ready: false, lastHeartbeat: Date.now() }, { state: 'ready', ready: true }]) {
    writeFileSync(statusPath, JSON.stringify(status));
    assert.equal(check(), 1);
  }
  writeFileSync(statusPath, '{invalid');
  assert.equal(check(), 1);
  writeFileSync(statusPath, JSON.stringify({ state: 'ready', ready: true, lastHeartbeat: Date.now() }));
  assert.equal(check(), 0);
});

test('a misconfigured health path cannot replace encrypted data or its lock', t => {
  const folder = temporary(t), filename = join(folder, 'data.enc');
  const sentinel = 'Existing data must not be overwritten';
  writeFileSync(filename, sentinel);
  for (const statusPath of [filename, filename + '.guard', filename + '.lock']) {
    const child = spawnSync(process.execPath, [fileURLToPath(new URL('../scripts/run.mjs', import.meta.url))],
      { env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
        RAFIQ_DATABASE_PATH: filename, RAFIQ_STATUS_PATH: statusPath }, encoding: 'utf8', timeout: 5000 });
    assert.equal(child.status, 78);
    assert.equal(readFileSync(filename, 'utf8'), sentinel);
    assert.deepEqual(readdirSync(folder), ['data.enc']);
  }
});
