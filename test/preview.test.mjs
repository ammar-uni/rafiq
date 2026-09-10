import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../src/store.mjs';
import { PreviewStore } from '../design/preview-store.mjs';
import { RafiqApp } from '../src/app.mjs';
import { SerialQueue } from '../src/serial.mjs';

test('the browser preview and persisted app return identical payloads for the main user journeys', async t => {
  const store = new Store(':memory:'); t.after(() => store.close());
  const stores = [store, new PreviewStore()];
  const apps = stores.map(store => new RafiqApp({ store, queue: new SerialQueue(), sendDM: async () => {}, now: () => 1800000000000 }));
  const steps = [
    ['home'], ['favorites'], ['saved_ideas'], ['idea_save_parents_family'], ['idea_save_calm_play'],
    ['favorites'], ['saved_ideas'], ['idea_source_parents_saved'], ['idea_save_parents_saved'], ['idea_save_calm_saved'],
    ['favorite_guidance'], ['favorite_majlis'], ['saved_dhikr'], ['source_majlis_saved'], ['favorite_majlis_saved'],
    ['reminder_intro'], ['enable'], ['settings'], ['frequency', ['session']], ['frequency', ['session5']], ['reminder_intro'], ['delivery', ['normal']],
    ['break_15'], ['break_extend_15'], ['home'], ['unsubscribe_here'], ['home'], ['enable'],
    ['pause_today'], ['break'], ['resume'], ['break_90'], ['break_cancel'], ['disable'],
    ['test_dm'], ['test_dm'], ['privacy'], ['forget_confirm'], ['home'], ['favorites']
  ];
  for (const [action, values = []] of steps) {
    const input = { userId: '1', guildId: '10', action, values };
    const expected = await apps[0].handle(input);
    const actual = await apps[1].handle(input);
    assert.deepEqual(actual, expected, `preview differs at ${action}`);
  }
});
