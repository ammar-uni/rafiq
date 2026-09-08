import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { SerialQueue } from '../src/serial.mjs';
import { RafiqApp } from '../src/app.mjs';

function experience(t) {
  const store = new Store(':memory:'); t.after(() => store.close());
  const sent = [];
  const app = new RafiqApp({store,queue:new SerialQueue(),sendDM:async (...args)=>sent.push(args),now:()=>1800000000000});
  const act = (action, values = []) => app.handle({userId:'1',guildId:'10',action,values});
  return {store,sent,act};
}
test('previewing reminders, idea categories and reporting instructions has no subscription or sending side effect', async t => {
  const h = experience(t);
  for (const action of ['home','reminder_intro','preview','idea','idea_source_parents_all','report_parents']) await h.act(action);
  await h.act('idea_category',['play']);
  assert.deepEqual(h.sent, []);
  assert.deepEqual(h.store.subscriptions('1'), []);
  assert.equal(h.store.db.prepare('SELECT count(*) AS n FROM users').get().n, 0);
});
test('idea navigation and source return preserve the chosen category', async t => {
  const h = experience(t);
  const first = JSON.stringify(await h.act('idea_category',['play']));
  assert.match(first, /قبل أن تردّ بغضب/);
  assert.match(first, /idea_play_5/);
  const second = JSON.stringify(await h.act('idea_play_5'));
  assert.match(second, /خلّ الجولة بلا إساءة/);
  assert.match(second, /idea_play_3/);
  const source = JSON.stringify(await h.act('idea_source_calm_play'));
  assert.match(source, /bukhari:6115/);
  assert.match(source, /سليمان بن صرد/);
  assert.match(source, /idea_play_3/);
  assert.match(JSON.stringify(await h.act('idea_category',['unknown'])), /اختيار غير صالح/);
});
test('source return and removing a bookmark retain the saved library context', async t => {
  const h = experience(t);
  await h.act('favorite_majlis'); await h.act('favorite_guidance');
  const saved = JSON.stringify(await h.act('favorites'));
  assert.match(saved, /source_majlis_saved/);
  assert.match(saved, /card_guidance_saved/);
  assert.match(JSON.stringify(await h.act('source_majlis_saved')), /card_majlis_saved/);
  const after = JSON.stringify(await h.act('favorite_majlis_saved'));
  assert.match(after, /دعاء جامع/);
  assert.doesNotMatch(after, /كفارة المجلس/);
  const empty = JSON.stringify(await h.act('favorite_guidance_saved'));
  assert.match(empty, /محفوظاتك تنتظرك/);
});
test('home reflects the current one-shot timer without creating another', async t => {
  const h = experience(t);
  await h.act('break_15');
  const before = h.store.getUser('1').breakAt;
  const home = JSON.stringify(await h.act('home'));
  assert.match(home, /إدارة المؤقّت/);
  assert.equal(h.store.getUser('1').breakAt, before);
  assert.deepEqual(h.sent, []);
});
test('the reminder introduction explains saved delivery preferences before opt-in', async t => {
  const h = experience(t);
  await h.act('frequency',['session']); await h.act('delivery',['normal']);
  const intro = JSON.stringify(await h.act('reminder_intro'));
  assert.match(intro, /بفاصل ساعتين/);
  assert.match(intro, /بتنبيه عادي/);
  assert.equal(h.store.getUser('1').enabled, false);
  assert.deepEqual(h.sent, []);
});
