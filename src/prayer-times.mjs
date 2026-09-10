import { Coordinates, CalculationMethod, PrayerTimes, Madhab, HighLatitudeRule } from 'adhan';
import { PRAYERS, validatePrayer } from './prayer-config.mjs';

export function prayerDate(at, timezone, offset = 0) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
  const value = name => Number(parts.find(part => part.type === name).value);
  const date = new Date(Date.UTC(value('year'), value('month') - 1, value('day') + offset));
  return date.toISOString().slice(0, 10);
}

export function prayerSchedule(preferences, day) {
  validatePrayer(preferences);
  if (!preferences.city || !preferences.method || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];
  const { city, method, adjustments, highLatitude, ramadanIsha } = preferences;
  const parameters = CalculationMethod[method]();
  parameters.madhab = Madhab.Shafi;
  parameters.highLatitudeRule = HighLatitudeRule[highLatitude];
  if (method === 'UmmAlQura' && ramadanIsha) parameters.ishaInterval = 120;
  PRAYERS.forEach(([key], index) => { parameters.adjustments[key] = adjustments[index]; });
  const [year, month, date] = day.split('-').map(Number);
  const compute = shift => new PrayerTimes(new Coordinates(city.latitude, city.longitude), new Date(year, month - 1, date + shift, 12), parameters);
  let times = compute(0);
  if (!Number.isFinite(+times.dhuhr)) return [];
  // Civil time zones can sit across the date line from their solar longitude.
  const solarDay = prayerDate(+times.dhuhr, city.timezone);
  const shift = Math.round((Date.parse(day) - Date.parse(solarDay)) / 86400000);
  if (shift) times = compute(shift);
  const result = PRAYERS.map(([key, label]) => ({ key, label, at: +times[key], day }));
  // Do not invent a polar schedule, or send a partly invalid/overlapping schedule.
  if (result.some((p, i) => !Number.isFinite(p.at) || (i && p.at <= result[i - 1].at)) || !Number.isFinite(+times.sunrise)) return [];
  return result;
}

export function prayerWindow(preferences, now) {
  if (!preferences.city || !preferences.method) return [];
  return [-1, 0, 1].flatMap(offset => prayerSchedule(preferences, prayerDate(now, preferences.city.timezone, offset)));
}

export function prayerClock(at, timezone) {
  return new Intl.DateTimeFormat('ar', { timeZone: timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(at);
}
