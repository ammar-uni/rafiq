import { fork } from 'node:child_process';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { runtimeLog, safeErrorCode } from './runtime-log.mjs';
import { StorageLease } from './storage-lease.mjs';

export const FATAL_EXIT_CODES = new Set([65, 73, 78]);

export function supervise({ entrypoint, cwd = process.cwd(), env = process.env, statusPath,
  restartBaseMs = 5000, restartMaxMs = 60000, stableMs = 300000,
  heartbeatTimeoutMs = 30000, offlineTimeoutMs = 90000, shutdownGraceMs = 20000,
  checkEveryMs = 5000, log = runtimeLog } = {}) {
  if (!entrypoint) throw new TypeError('An entrypoint is required');
  let child, restartTimer, killTimer, stopping = false, failures = 0;
  let lastHeartbeat = 0, offlineSince = 0, healthySince = 0, ready = false, restarting = false;
  let finished = false, resolveDone;
  const done = new Promise(resolve => { resolveDone = resolve; });
  if (statusPath) mkdirSync(dirname(statusPath), { recursive: true, mode: 0o700 });
  const statusLease = statusPath ? new StorageLease(statusPath) : null;

  function status(state) {
    if (!statusPath) return;
    try {
      const temporary = `${statusPath}.${process.pid}.tmp`;
      writeFileSync(temporary, JSON.stringify({ updatedAt: new Date().toISOString(), supervisorPid: process.pid,
        childPid: child?.pid ?? null, state, ready, lastHeartbeat, restartCount: failures }), { mode: 0o600 });
      renameSync(temporary, statusPath);
    } catch (error) { log('status-write-failed', { code: safeErrorCode(error) }); }
  }
  function finish(code) {
    if (finished) return;
    finished = true;
    clearInterval(watchdog);
    clearTimeout(restartTimer);
    clearTimeout(killTimer);
    ready = false;
    status(code ? 'failed' : 'stopped');
    statusLease?.close();
    resolveDone(code);
  }
  function stopChild() {
    if (!child) return finish(0);
    const current = child;
    if (current.connected) current.send({ type: 'rafiq:stop' }, () => {});
    else current.kill('SIGTERM');
    clearTimeout(killTimer);
    killTimer = setTimeout(() => {
      if (child === current) { log('shutdown-deadline'); current.kill('SIGKILL'); }
    }, shutdownGraceMs);
  }
  function stop() {
    if (stopping || finished) return done;
    stopping = true;
    ready = false;
    clearTimeout(restartTimer);
    status('stopping');
    stopChild();
    return done;
  }
  function spawn() {
    if (stopping) return finish(0);
    const startedAt = Date.now();
    lastHeartbeat = startedAt; offlineSince = startedAt; healthySince = 0; ready = false; restarting = false;
    const current = child = fork(entrypoint, [], { cwd, env, execArgv: [], stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    log('worker-started', { pid: current.pid });
    status('starting');
    current.on('message', message => {
      if (child !== current || stopping || restarting || message?.type !== 'rafiq:health' || typeof message.ready !== 'boolean') return;
      lastHeartbeat = Date.now();
      if (message.ready && !ready) { healthySince = lastHeartbeat; log('gateway-ready'); }
      if (!message.ready && ready) { offlineSince = lastHeartbeat; healthySince = 0; log('gateway-offline'); }
      ready = message.ready;
      if (ready) offlineSince = 0;
      else if (!offlineSince) offlineSince = lastHeartbeat;
      if (healthySince && lastHeartbeat - healthySince >= stableMs) failures = 0;
      status(ready ? 'ready' : 'connecting');
    });
    current.on('error', error => log('worker-error', { code: safeErrorCode(error) }));
    current.once('close', (code, signal) => {
      if (child !== current) return;
      clearTimeout(killTimer);
      child = null; ready = false;
      if (stopping) return finish(0);
      if (FATAL_EXIT_CODES.has(code)) {
        log('worker-needs-attention', { code });
        return finish(code);
      }
      failures++;
      const delayMs = Math.min(restartMaxMs, restartBaseMs * 2 ** Math.min(failures - 1, 16));
      log('worker-restart-scheduled', { code: code ?? signal ?? 'unknown', attempt: failures, delayMs });
      status('restarting');
      restartTimer = setTimeout(spawn, delayMs);
    });
  }
  const watchdog = setInterval(() => {
    if (!child || stopping || restarting) return;
    const now = Date.now();
    if (now - lastHeartbeat <= heartbeatTimeoutMs && (!offlineSince || now - offlineSince <= offlineTimeoutMs)) return;
    restarting = true; ready = false;
    log(now - lastHeartbeat > heartbeatTimeoutMs ? 'worker-heartbeat-lost' : 'gateway-reconnect-deadline');
    status('restarting');
    stopChild();
  }, checkEveryMs);
  try { spawn(); } catch (error) { clearInterval(watchdog); statusLease?.close(); throw error; }
  return { done, stop };
}
