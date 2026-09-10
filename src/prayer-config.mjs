export const PRAYERS = Object.freeze([['fajr', 'الفجر'], ['dhuhr', 'الظهر'], ['asr', 'العصر'], ['maghrib', 'المغرب'], ['isha', 'العشاء']]);
export const PRAYER_METHODS = Object.freeze([
  ['UmmAlQura', 'أم القرى — مكة'], ['MuslimWorldLeague', 'رابطة العالم الإسلامي'],
  ['Egyptian', 'الهيئة المصرية للمساحة'], ['Karachi', 'جامعة العلوم الإسلامية — كراتشي'],
  ['NorthAmerica', 'أمريكا الشمالية — ISNA'], ['Dubai', 'دبي'], ['Kuwait', 'الكويت'], ['Turkey', 'تركيا']
]);
export const PRAYER_HIGH_LATITUDE = Object.freeze([['MiddleOfTheNight', 'نصف الليل'], ['SeventhOfTheNight', 'سُبع الليل'], ['TwilightAngle', 'بحسب زاوية الشفق']]);
export const DEFAULT_PRAYER = Object.freeze({ city: null, method: 'UmmAlQura', asr: 'Shafi', highLatitude: 'MiddleOfTheNight',
  adjustments: Object.freeze([0, 0, 0, 0, 0]), ramadanIsha: false, enabled: false, activatedAt: 0, delivery: 'silent', soundId: null });

export function validatePrayer(p) {
  if (!p || Object.keys(p).sort().join() !== Object.keys(DEFAULT_PRAYER).sort().join()) throw new TypeError('Invalid prayer settings');
  const choice = (items, value) => items.some(([key]) => key === value);
  if (p.method !== null && !choice(PRAYER_METHODS, p.method)) throw new RangeError('Invalid method');
  if (p.asr !== 'Shafi' || !choice(PRAYER_HIGH_LATITUDE, p.highLatitude)) throw new RangeError('Invalid calculation setting');
  if (!['silent', 'normal'].includes(p.delivery) || typeof p.enabled !== 'boolean' || typeof p.ramadanIsha !== 'boolean') throw new TypeError('Invalid prayer preference');
  if (!Number.isSafeInteger(p.activatedAt) || p.activatedAt < 0) throw new RangeError('Invalid activation time');
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
  if (p.enabled && (!p.city || !p.method)) throw new RangeError('Incomplete prayer setup');
  return p;
}

export function readStoredPrayer(p) {
  // Earlier previews allowed a later Asr calculation. Require a new schedule
  // review when loading that setting, rather than silently sending at a new time.
  if (p?.asr === 'Hanafi') p = { ...p, asr: 'Shafi', enabled: false, activatedAt: 0 };
  return validatePrayer(p);
}
