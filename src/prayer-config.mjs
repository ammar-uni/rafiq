export const PRAYERS = Object.freeze([['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']]);
export const PRAYER_METHODS = Object.freeze([
  ['UmmAlQura', 'أم القرى — مكة'], ['MuslimWorldLeague', 'رابطة العالم الإسلامي'],
  ['Egyptian', 'الهيئة المصرية للمساحة'], ['Karachi', 'جامعة العلوم الإسلامية — كراتشي'],
  ['NorthAmerica', 'أمريكا الشمالية — ISNA'], ['Dubai', 'دبي'], ['Kuwait', 'الكويت'], ['Turkey', 'تركيا']
]);
export const PRAYER_HIGH_LATITUDE = Object.freeze([['MiddleOfTheNight', 'نصف الليل'], ['SeventhOfTheNight', 'سُبع الليل'], ['TwilightAngle', 'بحسب زاوية الشفق']]);
export const OCCASIONS = Object.freeze([['fridayPrayer', 'صلاة الجمعة'], ['fridayDua', 'دعاء الجمعة'], ['qada', 'قضاء قبل رمضان']]);
export const DEFAULT_OCCASIONS = Object.freeze({ fridayPrayer: 0, fridayDua: 0, qada: 0 });
export const DAILY_REMINDERS = Object.freeze([['morning', 'أذكار الصباح'], ['evening', 'أذكار المساء'], ['quran', 'قراءة القرآن']]);
// A reminder offset from the calculated adhan, not a mosque's iqama time.
export const ADHKAR_DELAY_MINUTES = 30;
export const DEFAULT_DAILY = Object.freeze({ morning: Object.freeze({ activatedAt: 0, iqamaMinutes: null }), evening: Object.freeze({ activatedAt: 0, iqamaMinutes: null }), quran: Object.freeze({ activatedAt: 0, time: null }) });
export const stopDaily = daily => Object.fromEntries(Object.entries(daily).map(([key, value]) => [key, { ...value, activatedAt: 0 }]));
export const DEFAULT_PRAYER = Object.freeze({ city: null, method: 'UmmAlQura', asr: 'Shafi', highLatitude: 'MiddleOfTheNight',
  adjustments: Object.freeze([0, 0, 0, 0, 0]), ramadanIsha: false, enabled: false, activatedAt: 0, delivery: 'normal', soundId: null,
  occasions: DEFAULT_OCCASIONS, daily: DEFAULT_DAILY });
export const hasPrayerReminders = p => p.enabled || Object.values(p.occasions).some(at => at > 0) || Object.values(p.daily).some(item => item.activatedAt > 0);
export const renewPrayerActivation = (p, now) => ({ ...p, activatedAt: p.enabled ? now : p.activatedAt,
  daily: Object.fromEntries(Object.entries(p.daily).map(([key, value]) => [key, { ...value, activatedAt: value.activatedAt ? now : 0 }])),
  occasions: Object.fromEntries(Object.entries(p.occasions).map(([key, at]) => [key, at ? now : 0])) });

export function validatePrayer(p) {
  if (!p || Object.keys(p).sort().join() !== Object.keys(DEFAULT_PRAYER).sort().join()) throw new TypeError('Invalid prayer settings');
  const choice = (items, value) => items.some(([key]) => key === value);
  if (p.method !== null && !choice(PRAYER_METHODS, p.method)) throw new RangeError('Invalid method');
  if (p.asr !== 'Shafi' || !choice(PRAYER_HIGH_LATITUDE, p.highLatitude)) throw new RangeError('Invalid calculation setting');
  if (!['silent', 'normal'].includes(p.delivery) || typeof p.enabled !== 'boolean' || typeof p.ramadanIsha !== 'boolean') throw new TypeError('Invalid prayer preference');
  if (!Number.isSafeInteger(p.activatedAt) || p.activatedAt < 0) throw new RangeError('Invalid activation time');
  if (!p.daily || Object.keys(p.daily).sort().join() !== Object.keys(DEFAULT_DAILY).sort().join()) throw new RangeError('Invalid daily settings');
  for (const [key, item] of Object.entries(p.daily)) {
    if (!item || Object.keys(item).sort().join() !== Object.keys(DEFAULT_DAILY[key]).sort().join() || !Number.isSafeInteger(item.activatedAt) || item.activatedAt < 0) throw new RangeError('Invalid daily activation');
    if (key === 'quran') {
      if (item.time !== null && (typeof item.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(item.time))) throw new RangeError('Invalid reading time');
      if (item.activatedAt && !item.time) throw new RangeError('Missing reading time');
    } else {
      if (item.iqamaMinutes !== null && (!Number.isInteger(item.iqamaMinutes) || item.iqamaMinutes < 0 || item.iqamaMinutes > 90)) throw new RangeError('Invalid iqama delay');
      if (item.activatedAt && item.iqamaMinutes === null) throw new RangeError('Missing iqama delay');
    }
  }
  if (!p.occasions || Object.keys(p.occasions).sort().join() !== Object.keys(DEFAULT_OCCASIONS).sort().join() ||
      Object.values(p.occasions).some(at => !Number.isSafeInteger(at) || at < 0)) throw new RangeError('Invalid occasion settings');
  if (!Array.isArray(p.adjustments) || p.adjustments.length !== 5 || p.adjustments.some(n => !Number.isInteger(n) || Math.abs(n) > 60)) throw new RangeError('Invalid prayer adjustment');
  if (p.soundId !== null && (typeof p.soundId !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(p.soundId))) throw new RangeError('Invalid sound');
  if (p.city !== null) {
    const c = p.city;
    if (Object.keys(c).sort().join() !== ['label', 'latitude', 'longitude', 'timezone'].sort().join() ||
        typeof c.label !== 'string' || c.label.length < 2 || c.label.length > 100 || /[\p{Cc}\p{Cf}<>@*_`\[\]\\]/u.test(c.label) ||
        !Number.isFinite(c.latitude) || Math.abs(c.latitude) > 90 || !Number.isFinite(c.longitude) || Math.abs(c.longitude) > 180 ||
        typeof c.timezone !== 'string' || c.timezone.length > 64) throw new RangeError('Invalid city');
    new Intl.DateTimeFormat('en', { timeZone: c.timezone }).format();
  }
  if (hasPrayerReminders(p) && (!p.city || !p.method)) throw new RangeError('Incomplete prayer setup');
  return p;
}

export function readStoredPrayer(p) {
  if (p && !Object.hasOwn(p, 'occasions')) p = { ...p, occasions: { ...DEFAULT_OCCASIONS } };
  if (p && !Object.hasOwn(p, 'daily')) p = { ...p, daily: structuredClone(DEFAULT_DAILY) };
  // Earlier previews allowed a later Asr calculation. Require a new schedule
  // review when loading that setting, rather than silently sending at a new time.
  if (p?.asr === 'Hanafi') p = { ...p, asr: 'Shafi', enabled: false, activatedAt: 0, occasions: { ...DEFAULT_OCCASIONS }, daily: stopDaily(p.daily) };
  return validatePrayer(p);
}
