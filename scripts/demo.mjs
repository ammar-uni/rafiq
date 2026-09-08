import assert from 'node:assert/strict';
import { Store, MINUTE } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';
import { ReminderEngine, LEAVE_GRACE } from '../src/reminders.mjs';

let now = 1_800_000_000_000;
const store = new Store(':memory:');
const queue = new SerialQueue();
const sent = [];
const sendDM = async (userId, payload) => { sent.push(payload); console.log(`محاكاة رسالة خاصة: ${payload.components[0].components[0].content}`); };
const engine = new ReminderEngine({ store, queue, sendDM, now: () => now });
const app = new RafiqApp({ store, queue, sendDM, now: () => now, cancelUser: userId => engine.cancelUser(userId) });
try {
  await app.handle({ userId: '1', guildId: '10', action: 'enable' });
  engine.join({ userId: '1', guildId: '10', channelId: '100', hasCompany: true });
  now += 10 * MINUTE;
  engine.leave({ userId: '1', guildId: '10' });
  now += LEAVE_GRACE;
  await engine.tick();
  await app.handle({ userId: '1', action: 'break_15' });
  now += 15 * MINUTE;
  await engine.tick();
  await app.handle({ userId: '1', action: 'forget_confirm' });
  assert.equal(sent.length, 2);
  assert.equal(store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
  console.log('اكتملت المحاكاة: تذكير مجلس، ومؤقّت واحد، ثم حذف البيانات. لم نتصل بديسكورد.');
} finally { store.close(); }
