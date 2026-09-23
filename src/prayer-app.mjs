import { DEFAULT_PRAYER, DEFAULT_OCCASIONS, OCCASIONS, stopDaily, hasPrayerReminders, renewPrayerActivation, PRAYERS, PRAYER_METHODS, PRAYER_HIGH_LATITUDE } from './prayer-config.mjs';
import { prayerDate, prayerWindow } from './prayer-times.mjs';
import { nextFridayReminders } from './occasion-times.mjs';
import { findPrayerCities } from './prayer-geocoding.mjs';
import * as ui from './messages.mjs';

export class PrayerApp {
  constructor({ store, now = Date.now, lookup = findPrayerCities, sounds = [], sendDM = null }) {
    Object.assign(this, { store, now, lookup, sounds, sendDM });
    this.searches = new Map();
    this.globalSearches = [];
  }
  forget(userId) { this.searches.delete(userId); }
  prune() {
    for (const [id, search] of this.searches) if (this.now() - search.at > 10 * 60000) this.searches.delete(id);
  }
  page(userId, notice = '') {
    const preferences = this.store.getPrayer(userId), user = this.store.getUser(userId);
    const day = preferences.city ? prayerDate(this.now(), preferences.city.timezone) : '';
    const window = prayerWindow(preferences, this.now());
    return ui.prayerPayload({ preferences, day, today: window.filter(event => event.day === day), next: window.find(event => event.at > this.now()),
      notice, paused: user.pausedUntil > this.now(), dmBlocked: user.dmBlocked });
  }
  async route(userId, action, values) {
    const now = this.now();
    this.prune();
    const p = this.store.getPrayer(userId);
    const save = patch => this.store.setPrayer(userId, { ...p, ...patch });
    const occasions = (notice = '') => {
      const current = this.store.getPrayer(userId), user = this.store.getUser(userId);
      const ready = Boolean(current.city && current.method && prayerWindow(current, now).filter(event => event.day === prayerDate(now, current.city.timezone)).length === 5);
      return ui.occasionsPayload({ preferences: current, ready, next: nextFridayReminders(current, now), notice, paused: user.pausedUntil > now, dmBlocked: user.dmBlocked });
    };
    if (action === 'prayer_occasions') return occasions();
    if (action === 'prayer_occasion_sources') return ui.occasionSourcesPayload();
    const selection = /^prayer_occasion_(off_)?(fridayPrayer|fridayDua|qada)$/.exec(action);
    if (selection) {
      const [, off, key] = selection;
      const enabled = Boolean(p.occasions[key]);
      if (off || enabled) {
        if (enabled) save({ occasions: { ...p.occasions, [key]: 0 } });
        return occasions('توقف هذا التذكير. بقيت اختياراتك الأخرى كما هي.');
      }
      const user = this.store.getUser(userId);
      if (!p.city || !p.method || prayerWindow(p, now).filter(event => event.day === prayerDate(now, p.city.timezone)).length !== 5) return occasions('اختر مدينتك وراجع جدولها أولًا.');
      if (user.pausedUntil > now || user.dmBlocked) return occasions('استأنف التنبيهات وتأكد من وصول الخاص من إعداداتك العامة.');
      save({ occasions: { ...p.occasions, [key]: now } });
      return occasions(`فُعّل تذكير ${OCCASIONS.find(([id]) => id === key)[1]} فقط. يمكنك إيقافه من الزر نفسه.`);
    }
    if (action === 'prayer') return this.page(userId);
    if (action === 'prayer_location') return ui.prayerLocationPayload('', p);
    if (action === 'prayer_calculation') return ui.prayerCalculationPayload(p);
    if (action === 'prayer_audio') return ui.prayerAudioPayload(p, this.sounds);
    if (action === 'prayer_test' && this.sendDM) {
      const user = this.store.getUser(userId);
      if (user.lastTestAt !== null && now - user.lastTestAt < 60000) return this.page(userId, 'انتظر دقيقة بين اختبارات الخاص.');
      this.store.updateUser(userId, { lastTestAt: now });
      try {
        await this.sendDM(userId, ui.prayerTestPayload(p, this.sounds.find(sound => sound.id === p.soundId)), `prayer-test:${userId}:${now}`);
        this.store.transaction(() => {
          this.store.updateUser(userId, { dmBlocked: false });
          if (user.dmBlocked && user.seasonalAt > 0) this.store.updateUser(userId, { seasonalAt: this.now() });
          if (user.dmBlocked && hasPrayerReminders(p)) this.store.setPrayer(userId, renewPrayerActivation(p, this.now()));
        });
        return this.page(userId, 'أُرسلت تجربة بإعدادات إشعار الصلاة التي اخترتها.');
      } catch (error) {
        if (Number(error.code) === 50007) this.store.updateUser(userId, { dmBlocked: true });
        return this.page(userId, 'لم تصل التجربة؛ راجع السماح برسائل البوت الخاصة ثم جرّب مجددًا.');
      }
    }
    if (action === 'prayer_search') {
      if (values.length !== 1 || typeof values[0] !== 'string' || values[0].trim().length < 2 || values[0].length > 80) return this.page(userId, 'اكتب اسم مدينة من حرفين على الأقل، ثم أعد البحث.');
      this.globalSearches = this.globalSearches.filter(at => now - at < 86400000);
      if (now - (this.searches.get(userId)?.at ?? -Infinity) < 15000 || this.globalSearches.filter(at => now - at < 60000).length >= 30 || this.globalSearches.length >= 2500 || this.searches.size >= 1000) return this.page(userId, 'بلغ البحث حدّه المؤقت. بقي جدولك الحالي؛ يمكنك البحث لاحقًا.');
      const entry = { at: now, token: crypto.randomUUID(), cities: [] };
      this.searches.set(userId, entry);
      this.globalSearches.push(now);
      try { entry.cities = await this.lookup(values[0]); }
      catch { return ui.prayerLocationPayload('تعذّر البحث الآن. لم نغيّر مدينتك المحفوظة؛ حاول مجددًا بعد قليل.', p); }
      if (!entry.cities.length) return ui.prayerLocationPayload('لم نجد مدينة مطابقة. جرّب الاسم الكامل مع الدولة، أو تهجئة أخرى بالعربية أو الإنجليزية.', p);
      return ui.prayerCitiesPayload(entry.cities, entry.token, p);
    }
    if (action.startsWith('prayer_city_')) {
      const entry = this.searches.get(userId);
      if (!entry || action !== `prayer_city_${entry.token}` || values.length !== 1 || !/^[0-7]$/.test(values[0]) || !entry.cities[Number(values[0])]) return this.page(userId, 'انتهت نتائج البحث أو لم تعد صالحة. ابحث عن المدينة مجددًا.');
      const selected = { ...p, city: entry.cities[Number(values[0])], method: p.method || DEFAULT_PRAYER.method, enabled: false, occasions: { ...DEFAULT_OCCASIONS }, daily: stopDaily(p.daily), activatedAt: now };
      const ready = prayerWindow(selected, now).filter(event => event.day === prayerDate(now, selected.city.timezone)).length === 5;
      // The first-city picker explains these two defaults before selection.
      // Later location changes preserve opt-outs and rebase active reminders so
      // switching time zones cannot send an event that already passed.
      if (ready) selected.occasions = p.city
        ? Object.fromEntries(Object.entries(p.occasions).map(([key, at]) => [key, at ? now : 0]))
        : { ...DEFAULT_OCCASIONS, fridayDua: now, qada: now };
      this.store.setPrayer(userId, selected);
      this.searches.delete(userId);
      return this.page(userId, !ready ? 'حُفظت المدينة، لكن مواقيتها غير مكتملة؛ لم نفعّل تذكيرات مرتبطة بها. راجع جدول الجهة المعتمدة محليًا.'
        : p.city ? 'تغيّرت المدينة. بقيت اختيارات الجمعة والقضاء كما هي. توقفت تذكيرات الصلوات والأذكار والقراءة حتى تراجع الجدول وتعيد تفعيلها.'
        : 'حُفظت مدينتك وفُعّل دعاء الجمعة وقضاء قبل رمضان في الخاص. يمكنك إيقاف أي منهما من «الجمعة والقضاء». راجع المواقيت قبل تفعيل الصلوات.');
    }
    const calculationChoices = { prayer_method: ['method', PRAYER_METHODS], prayer_highLatitude: ['highLatitude', PRAYER_HIGH_LATITUDE] };
    if (Object.hasOwn(calculationChoices, action)) {
      const [field, choices] = calculationChoices[action];
      if (values.length !== 1 || !choices.some(([key]) => key === values[0])) return ui.prayerCalculationPayload(p, 'اختر قيمة من القائمة.');
      save({ [field]: values[0], enabled: false, occasions: { ...DEFAULT_OCCASIONS }, daily: stopDaily(p.daily), activatedAt: now });
      return ui.prayerCalculationPayload(this.store.getPrayer(userId), 'حُفظ الاختيار وتوقفت التذكيرات المرتبطة بالجدول؛ راجعه وأعد تفعيل ما تحتاجه.');
    }
    if (action === 'prayer_ramadan' && p.method === 'UmmAlQura') {
      save({ ramadanIsha: !p.ramadanIsha, enabled: false, occasions: { ...DEFAULT_OCCASIONS }, daily: stopDaily(p.daily), activatedAt: now });
      return ui.prayerCalculationPayload(this.store.getPrayer(userId), 'توقفت التذكيرات المرتبطة بالجدول؛ راجعه وأعد تفعيل ما تحتاجه.');
    }
    if (action === 'prayer_adjust') {
      const normalized = values.map(value => String(value).trim().replace(/[٠-٩]/g, d => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[۰-۹]/g, d => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))));
      if (normalized.length !== PRAYERS.length || normalized.some(value => !/^[+-]?\d{1,2}$/.test(value) || Math.abs(Number(value)) > 60)) return ui.prayerCalculationPayload(p, 'لم تُحفظ التعديلات. أدخل عدد دقائق صحيحًا بين -60 و60 لكل صلاة.');
      save({ adjustments: normalized.map(Number), enabled: false, occasions: { ...DEFAULT_OCCASIONS }, daily: stopDaily(p.daily), activatedAt: now });
      return this.page(userId, 'حُفظت التعديلات وتوقفت تذكيرات الصلاة والجمعة والقضاء والأذكار والقراءة؛ راجع الجدول ثم أعد التفعيل.');
    }
    if (action === 'prayer_enable' || action === 'prayer_enable_friday') {
      const user = this.store.getUser(userId);
      if (!p.city || !p.method || prayerWindow(p, now).filter(event => event.day === prayerDate(now, p.city.timezone)).length !== 5) return this.page(userId, 'أكمل المدينة وطريقة الحساب، وتأكد من ظهور الجدول أولًا.');
      if (user.pausedUntil > now || user.dmBlocked) return this.page(userId, 'استأنف التنبيهات من إعداداتك العامة، وتأكد من وصول الخاص قبل التفعيل.');
      const withFriday = action === 'prayer_enable_friday';
      // Old buttons only promised the five prayers. The new button names Friday.
      // Repeated enable clicks must not undo a subsequent Friday opt-out.
      if (!p.enabled) save({ enabled: true, activatedAt: now, ...(withFriday ? { occasions: { ...p.occasions, fridayPrayer: p.occasions.fridayPrayer || now } } : {}) });
      return this.page(userId, p.enabled ? 'تذكير الصلوات مفعّل بالفعل. بقيت اختيارات الجمعة والقضاء كما هي.'
        : withFriday ? 'فُعّلت الصلوات الخمس وصلاة الجمعة قبل الظهر بـ٤٥ دقيقة. يمكنك إيقاف الجمعة وحدها من «الجمعة والقضاء».'
        : 'فُعّل تذكير الصلوات القادمة، بحسب هذا الجدول.');
    }
    if (action === 'prayer_disable') { this.store.disablePrayer(userId); return this.page(userId, 'توقف تذكير الصلوات الخمس. تذكيرات الجمعة والقضاء تُدار بشكل مستقل من «الجمعة والقضاء».'); }
    if (action === 'prayer_delivery' && values.length === 1 && ['silent', 'normal'].includes(values[0])) {
      save({ delivery: values[0] }); return ui.prayerAudioPayload(this.store.getPrayer(userId), this.sounds);
    }
    if (action === 'prayer_sound' && values.length === 1 && (values[0] === 'none' || this.sounds.some(sound => sound.id === values[0]))) {
      save({ soundId: values[0] === 'none' ? null : values[0] }); return ui.prayerAudioPayload(this.store.getPrayer(userId), this.sounds);
    }
    return this.page(userId, 'افتح الخيارات الحالية من هذه الصفحة.');
  }
}
