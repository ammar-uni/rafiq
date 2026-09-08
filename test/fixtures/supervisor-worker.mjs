import { readFileSync, writeFileSync } from 'node:fs';

const mode = process.env.TEST_WORKER_MODE;
const countFile = process.env.TEST_COUNT_FILE;
let count = 1;
try { count = Number(readFileSync(countFile, 'utf8')) + 1; } catch {}
writeFileSync(countFile, String(count));
if (mode === 'fatal') process.exit(78);
if (mode === 'crash-once' && count === 1) process.exit(1);
if (mode === 'crash-always') process.exit(1);
const heartbeat = setInterval(() => { if (process.connected) process.send({ type: 'rafiq:health', ready: mode !== 'offline' }); }, 20);
if (mode === 'hang-once' && count === 1) { clearInterval(heartbeat); while (true) {} }
process.on('message', message => {
  if (message?.type === 'rafiq:stop') { clearInterval(heartbeat); process.disconnect(); }
});
process.once('disconnect', () => clearInterval(heartbeat));
