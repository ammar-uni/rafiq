import assert from 'node:assert/strict';
import { welcomePayload, reminderPayload, enabledPayload, settingsPayload, ideaPayload, pausedPayload, disabledPayload, homePayload, libraryPayload, sourcePayload, methodologyPayload, privacyPayload, supportPayload, forgetPromptPayload, breakPayload, breakReminderPayload, FLAGS } from '../src/messages.mjs';
import { DHIKR_CARDS, GOOD_DEEDS, IDEA_CATEGORIES } from '../src/content.mjs';
import { reminderIntroPayload, ideaSourcePayload, favoritesPayload } from '../src/messages.mjs';
import { prayerPayload, prayerLocationPayload, prayerCitiesPayload, prayerCalculationPayload, prayerAudioPayload, prayerReminderPayload, prayerTestPayload } from '../src/messages.mjs';
import { DEFAULT_PRAYER, PRAYER_METHODS } from '../src/prayer-config.mjs';
import { prayerSchedule } from '../src/prayer-times.mjs';
import { loadPrayerSounds } from '../src/prayer-sounds.mjs';
loadPrayerSounds();
const samples = [welcomePayload(), reminderPayload(), reminderPayload({silent:false}), reminderPayload({preview:true}), reminderPayload({preview:true,enabled:false}), reminderPayload({preview:true,paused:true}), enabledPayload(), settingsPayload(), settingsPayload({frequency:'session',delivery:'silent',enabled:true,paused:true}), pausedPayload(), disabledPayload(), ...GOOD_DEEDS.map((_,i)=>ideaPayload(i)), homePayload(), homePayload({enabled:true}), homePayload({enabled:true,dmBlocked:true}), ...DHIKR_CARDS.flatMap(card=>[libraryPayload({selectedId:card.id}),sourcePayload(card.id)]), libraryPayload({onlyFavorites:true}), libraryPayload({onlyFavorites:true,favorites:['guidance'],selectedId:'guidance'}), methodologyPayload(), privacyPayload(), forgetPromptPayload(), breakPayload(), breakPayload({breakAt:1800000000000}), breakReminderPayload()];
samples.push(privacyPayload({privacyURL:'https://rafiq.test/privacy',supportURL:'https://rafiq.test/support'}), supportPayload(), supportPayload({supportURL:'https://rafiq.test/support'}));
samples.push(reminderIntroPayload(), reminderIntroPayload({enabled:true}), homePayload({breakAt:1800000000000,favoriteCount:5}), ...IDEA_CATEGORIES.flatMap(category => GOOD_DEEDS.filter(idea => category.id === 'all' || idea.category === category.id).flatMap(idea => [ideaPayload(GOOD_DEEDS.indexOf(idea), {category:category.id}), ideaSourcePayload(idea.id, {category:category.id})])), ...DHIKR_CARDS.map(card => sourcePayload(card.id, {onlyFavorites:true})), supportPayload({supportURL:'https://rafiq.test/support',reportCard:DHIKR_CARDS[0]}));
samples.push(favoritesPayload(), favoritesPayload({dhikrCount:5,ideaCount:6}), ideaPayload(0,{category:'saved'}), settingsPayload({enabled:true,inGuild:true,paused:true,pausedUntil:1800000000000}), breakPayload({paused:true}), breakPayload({dmBlocked:true}), breakPayload({breakAt:1800000000000,delivery:'normal'}));
for (const idea of GOOD_DEEDS) samples.push(ideaPayload(GOOD_DEEDS.indexOf(idea),{category:'saved',favorites:[idea.id]}),ideaSourcePayload(idea.id,{category:'saved'}),ideaPayload(GOOD_DEEDS.indexOf(idea),{category:'saved',favorites:GOOD_DEEDS.map(item=>item.id)}));
const p = { ...DEFAULT_PRAYER, city: { label: 'مكة المكرمة، السعودية', latitude: 21.426, longitude: 39.826, timezone: 'Asia/Riyadh' }, method: 'UmmAlQura' };
const today = prayerSchedule(p, '2026-09-09');
const sound = { id: 'soft', label: 'تنبيه هادئ', filename: 'soft.mp3' };
samples.push(prayerPayload(), prayerPayload({ preferences: p, today, next: today[0] }), prayerPayload({ preferences: { ...p, enabled: true }, today, paused: true, dmBlocked: true }), prayerPayload({ preferences: p }), prayerLocationPayload(), prayerCitiesPayload([p.city], 'test'), prayerAudioPayload(p), prayerAudioPayload({ ...p, soundId: sound.id }, [sound]), prayerReminderPayload(p, today[0]), prayerReminderPayload({ ...p, delivery: 'normal' }, today[0], sound), prayerTestPayload(p, sound), ...PRAYER_METHODS.map(([method]) => prayerCalculationPayload({ ...p, method })), prayerCalculationPayload({ ...p, ramadanIsha: true }));
for (const payload of samples) {
  assert.ok(payload.flags & FLAGS.componentsV2);
  assert.equal(payload.content, undefined);
  assert.equal(payload.embeds, undefined);
  assert.deepEqual(payload.allowed_mentions.parse, []);
  const ids = new Set(); let count = 0; let characters = 0;
  function visit(component, parent = 0) {
    count++;
    if (component.custom_id) {
      assert.ok(component.custom_id.length <= 100);
      assert.ok(!ids.has(component.custom_id), 'Duplicate custom_id');
      ids.add(component.custom_id);
    }
    if (component.type === 17) {
      assert.equal(parent, 0);
      component.components.forEach(child => assert.ok([1,9,10,12,13,14].includes(child.type)));
    }
    if (component.type === 1) {
      assert.ok(component.components.length >= 1 && component.components.length <= 5);
      const types=component.components.map(child=>child.type);
      assert.ok(types.every(type=>type===2) || (types.length===1 && types[0]===3));
    }
    if (component.type === 9) {
      assert.ok(component.components.length >= 1 && component.components.length <= 3);
      assert.ok(component.components.every(child => child.type === 10));
      assert.equal(component.accessory.type, 2);
      visit(component.accessory, 9);
    }
    if (component.type === 2) {
      assert.ok([1,9].includes(parent));
      assert.ok(component.label.length <= 38);
      assert.ok([1,2,3,4,5].includes(component.style));
    }
    if (component.type === 3) {
      assert.equal(parent,1);
      assert.ok(component.options.length <= 25);
      assert.equal(component.options.filter(option=>option.default).length, component.custom_id.startsWith('rafiq:v1:prayer_city_') ? 0 : 1);
      assert.ok(component.options.every(option => option.label.length <= 100 && option.value.length <= 100));
    }
    if (component.type === 10) characters += component.content.length;
    if (component.type === 13) assert.ok(payload.attachments.some(file => component.file.url === `attachment://${file.filename}`));
    if (component.type === 12) {
      assert.ok(component.items.length >= 1 && component.items.length <= 10);
      for (const item of component.items) {
        assert.ok(item.description.length<=1024);
        const filename=item.media.url.replace('attachment://','');
        assert.ok(payload.attachments.some(file=>file.filename===filename));
      }
    }
    component.components?.forEach(child=>visit(child,component.type));
  }
  payload.components.forEach(component=>visit(component));
  assert.ok(count<=40);
  assert.ok(characters<=4000);
  JSON.parse(JSON.stringify(payload));
}
assert.ok(!(reminderPayload().flags & FLAGS.ephemeral));
assert.ok(reminderPayload({preview:true}).flags & FLAGS.ephemeral);
assert.ok(reminderPayload({silent:true}).flags & FLAGS.silent);
assert.equal(reminderPayload().attachments, undefined);
assert.throws(()=>settingsPayload({delivery:'invalid'}), RangeError);
console.log(`${samples.length} native Discord payload variants validated; no network requests sent.`);
