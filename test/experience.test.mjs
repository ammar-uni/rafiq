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
  for (const action of ['home','reminder_intro','preview','idea','idea_source_parents_all','report_parents','favorites','saved_dhikr','saved_ideas','unsubscribe_here','break_cancel']) await h.act(action);
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
  assert.match(JSON.stringify(await h.act('favorites')), /saved_dhikr/);
  const saved = JSON.stringify(await h.act('saved_dhikr'));
  assert.match(saved, /source_majlis_saved/);
  assert.match(saved, /card_guidance_saved/);
  assert.match(JSON.stringify(await h.act('source_majlis_saved')), /card_majlis_saved/);
  const after = JSON.stringify(await h.act('favorite_majlis_saved'));
  assert.match(after, /دعاء جامع/);
  assert.doesNotMatch(after, /كفارة المجلس/);
  const empty = JSON.stringify(await h.act('favorite_guidance_saved'));
  assert.match(empty, /محفوظاتك تنتظرك/);
});

test('saved ideas retain their source and context, and removing the last shows an empty state', async t => {
  const h = experience(t);
  await h.act('idea_save_parents_family'); await h.act('idea_save_calm_play');
  assert.deepEqual(h.store.savedIdeas('1'), ['calm', 'parents']);
  assert.deepEqual(h.store.favorites('1'), []);
  assert.match(JSON.stringify(await h.act('favorites')), /عدد المحفوظات: ٢/);
  assert.match(JSON.stringify(await h.act('saved_ideas')), /idea_source_parents_saved/);
  assert.match(JSON.stringify(await h.act('idea_source_parents_saved')), /idea_saved_0/);
  assert.match(JSON.stringify(await h.act('idea_save_parents_saved')), /قبل أن تردّ بغضب/);
  assert.match(JSON.stringify(await h.act('idea_save_calm_saved')), /أفكارك المحفوظة تنتظرك/);
  assert.deepEqual(h.store.savedIdeas('1'), []);
  assert.deepEqual(h.store.subscriptions('1'), []);
  assert.deepEqual(h.sent, []);
});

test('idea bookmarks are isolated by user and reject unknown IDs and malformed actions', async t => {
  const h = experience(t);
  await h.act('idea_save_parents_all');
  assert.deepEqual(h.store.savedIdeas('2'), []);
  assert.throws(() => h.store.toggleIdeaFavorite('1', 'unknown'), /Unknown idea/);
  for (const action of ['idea_save_unknown_all','idea_save_parents_invalid','idea_saved_999']) {
    assert.match(JSON.stringify(await h.act(action)), /لم يعد متاحًا/);
  }
  assert.deepEqual(h.store.savedIdeas('1'), ['parents']);
});

test('timer controls show delivery and blocked state, and do not restore an expired timer', async t => {
  const h = experience(t);
  await h.act('break_extend_15');
  assert.equal(h.store.getUser('1').breakAt, null);
  await h.act('delivery', ['normal']); await h.act('break_15');
  const original = h.store.getUser('1').breakAt;
  const extended = JSON.stringify(await h.act('break_extend_15'));
  assert.equal(h.store.getUser('1').breakAt, original + 15 * 60000);
  assert.match(extended, /بتنبيه حسب إعدادات ديسكورد/);
  for (let n = 0; n < 12; n++) await h.act('break_extend_15');
  assert.equal(h.store.getUser('1').breakAt, 1800000000000 + 120 * 60000);
  h.store.updateUser('1', { breakAt: 1799999999999 });
  assert.match(JSON.stringify(await h.act('break_extend_15')), /انتهى المؤقّت السابق/);
  assert.equal(h.store.getUser('1').breakAt, 1799999999999);
  h.store.updateUser('1', { breakAt: null, dmBlocked: true });
  assert.match(JSON.stringify(await h.act('break')), /وصول الخاص معلّق/);
  assert.match(JSON.stringify(await h.act('home')), /إصلاح وصول الخاص/);
  await h.act('break_15'); assert.equal(h.store.getUser('1').breakAt, null);
  assert.deepEqual(h.sent, []);
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
