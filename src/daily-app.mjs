import * as ui from './messages.mjs';
import { prayerDate, prayerWindow, prayerSchedule } from './prayer-times.mjs';
import { reminderWindow, nextFridayReminders, nextRamadan } from './occasion-times.mjs';
import { eventActivation } from './daily-times.mjs';
import { DAILY_REMINDERS, DEFAULT_ADHKAR_OFFSET_MINUTES } from './prayer-config.mjs';
import { seasonalWindow } from './seasonal-times.mjs';

const digits = value => String(value).trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));
export class DailyApp {
  constructor({ store, now = Date.now }) { Object.assign(this, { store, now }); }
  page(userId, notice = '', key = null) {
    const p = this.store.getPrayer(userId), user = this.store.getUser(userId), now = this.now();
    const events = reminderWindow(p, now).filter(e => e.at > now);
    const state = { notice, events, paused: user.pausedUntil > now, dmBlocked: user.dmBlocked };
    return key ? ui.dailyDetailPayload(p, key, state) : ui.dailySettingsPayload(p, state);
  }
  today(userId) {
    const p = this.store.getPrayer(userId), user = this.store.getUser(userId), now = this.now();
    const window = reminderWindow(p, now);
    const nextPrayer = prayerWindow(p, now).find(e => e.at > now);
    if (p.city) {
      window.push(...nextFridayReminders(p, now));
      if (p.occasions.qada) {
        const currentDay = prayerDate(now, p.city.timezone);
        let forecast = nextRamadan(currentDay);
        for (let year = 0; year < 2; year++) {
          for (const days of [30, 15]) {
            const day = new Date(Date.parse(forecast.day) - days * 86400000).toISOString().slice(0, 10);
            if (day < currentDay) continue;
            const dhuhr = prayerSchedule(p, day).find(e => e.key === 'dhuhr');
            if (dhuhr) window.push({ ...dhuhr, key: `qada${days}` });
          }
          if (window.some(e => e.key.startsWith('qada') && e.at > now)) break;
          forecast = nextRamadan(new Date(Date.parse(forecast.day) + 86400000).toISOString().slice(0, 10));
        }
      }
    }
    const upcoming = window.filter(e => e.at > now && eventActivation(p, e.key) > 0 && eventActivation(p, e.key) <= e.at);
    if (user.breakAt > now) upcoming.push({ key: 'break', at: user.breakAt });
    if (user.seasonalAt > 0) upcoming.push(...seasonalWindow(now).filter(e => e.at > now && e.at >= user.seasonalAt).map(e => ({ key: 'seasonal', at: e.at })));
    const next = upcoming.sort((a, b) => a.at - b.at)[0];
    return ui.todayPayload({ p, user, now, nextPrayer, next, subscribed: this.store.subscriptions(userId).length > 0 });
  }
  route(userId, action, values = []) {
    const p = this.store.getPrayer(userId), now = this.now();
    if (action === 'today') return this.today(userId);
    if (action === 'daily') return this.page(userId);
    const detail = /^daily_(morning|evening|quran)$/.exec(action);
    if (detail) return this.page(userId, '', detail[1]);
    if (action === 'daily_sources') return ui.dailySourcesPayload();
    const sources = /^daily_sources_(morning|evening)$/.exec(action);
    if (sources) return ui.dailySourcesPayload(sources[1]);
    if (action === 'daily_morning_read' || action === 'daily_evening_read') return ui.dailyReadingPayload(action.split('_')[1]);
    const off = /^daily_off_(morning|evening|quran)$/.exec(action);
    if (off) {
      this.store.setPrayer(userId, { ...p, daily: { ...p.daily, [off[1]]: { ...p.daily[off[1]], activatedAt: 0 } } });
      return this.page(userId, 'توقف هذا التذكير فقط.', off[1]);
    }
    // Never reinterpret a stale iqama form as a new adhan-relative offset.
    if (/^daily_(time_(morning|evening)|(morning|evening)_modal)$/.test(action)) return this.page(userId, 'لتغيير وقت الأذكار استخدم «تعديل الموعد». لا نطلب وقت الإقامة.');
    const offsetPage = /^daily_offset_(morning|evening)$/.exec(action);
    if (offsetPage) return ui.dailyOffsetPayload(p, offsetPage[1]);
    const offsetSave = /^daily_offset_(morning|evening)_(before|after|at|reset)$/.exec(action);
    if (offsetSave) {
      const [, key, direction] = offsetSave;
      const value = values.length === 1 ? digits(values[0]) : '';
      if (['before', 'after'].includes(direction) && (!/^\d{1,2}$/.test(value) || Number(value) < 1 || Number(value) > 60)) return ui.dailyOffsetPayload(p, key, 'أدخل عددًا صحيحًا من ١ إلى ٦٠ دقيقة. لم يتغير موعدك.');
      const offsetMinutes = direction === 'at' ? 0 : direction === 'reset' ? DEFAULT_ADHKAR_OFFSET_MINUTES : Number(value) * (direction === 'before' ? -1 : 1);
      const item = p.daily[key];
      if (offsetMinutes !== item.offsetMinutes) this.store.setPrayer(userId, { ...p, daily: { ...p.daily, [key]: { ...item, offsetMinutes, activatedAt: item.activatedAt ? now : 0 } } });
      return this.page(userId, `حُفظ الموعد. ${item.activatedAt ? 'التذكير ما زال مفعّلًا؛ يبدأ بالموعد القادم.' : 'التذكير غير مفعّل؛ فعّله حين تريد.'}`, key);
    }
    if (action === 'daily_time_quran') {
      const value = values.length === 1 ? digits(values[0]) : '';
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return this.page(userId, 'أدخل الساعة بصيغة 24 ساعة، مثل 20:30. لم يتغير موعدك.', 'quran');
      this.store.setPrayer(userId, { ...p, daily: { ...p.daily, quran: { activatedAt: 0, time: value } } });
      return this.page(userId, 'حُفظ الموعد. راجعه ثم اضغط «تفعيل هذا التذكير».', 'quran');
    }
    const enable = /^daily_enable_(morning|evening|quran)$/.exec(action);
    if (enable) {
      const key = enable[1], item = p.daily[key], user = this.store.getUser(userId);
      if (!p.city || !p.method) return this.page(userId, 'اختر مدينتك أولًا لحفظ التوقيت المحلي الصحيح.', key);
      if (key === 'quran' && !item.time) return this.page(userId, 'اضبط موعد هذا التذكير أولًا ثم فعّله.', key);
      if (key !== 'quran' && prayerWindow(p, now).filter(e => e.day === prayerDate(now, p.city.timezone)).length !== 5) return this.page(userId, 'جدول الصلاة غير متاح هنا الآن؛ راجعه قبل تفعيل هذا التذكير.', key);
      if (user.dmBlocked || user.pausedUntil > now) return this.page(userId, 'استأنف التنبيهات وتأكد من وصول الخاص من إعداداتك.', key);
      if (!item.activatedAt) this.store.setPrayer(userId, { ...p, daily: { ...p.daily, [key]: { ...item, activatedAt: now } } });
      return this.page(userId, `فُعّل تذكير ${DAILY_REMINDERS.find(([id]) => id === key)[1]} فقط.`, key);
    }
    return this.page(userId);
  }
}
