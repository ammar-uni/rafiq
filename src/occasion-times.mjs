import { prayerDate, prayerSchedule, prayerWindow } from './prayer-times.mjs';
import { dailyEvents } from './daily-times.mjs';

const civilDay = 86400000;
const hijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: 'UTC', year: 'numeric', month: 'numeric', day: 'numeric' });
const forecasts = new Map();

// A calendar forecast for reminders, not an announcement of the sighted Ramadan.
export function nextRamadan(day) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day) throw new RangeError('Invalid civil date');
  if (forecasts.has(day)) return forecasts.get(day);
  if (hijri.resolvedOptions().calendar !== 'islamic-umalqura') throw new Error('Umm al-Qura calendar unavailable');
  const start = Date.parse(day + 'T12:00:00Z');
  for (let offset = 0; offset <= 370; offset++) {
    const at = start + offset * civilDay;
    const parts = hijri.formatToParts(at), get = key => Number(parts.find(part => part.type === key)?.value);
    if (get('month') === 9 && get('day') === 1) {
      const forecast = Object.freeze({ day: new Date(at).toISOString().slice(0, 10), year: get('year'), days: offset });
      if (forecasts.size >= 32) forecasts.clear();
      forecasts.set(day, forecast);
      return forecast;
    }
  }
  throw new Error('Ramadan forecast unavailable');
}

export function occasionEvents(preferences, window) {
  const events = [];
  if (!preferences.city || !preferences.method) return events;
  for (const day of new Set(window.map(event => event.day))) {
    const times = window.filter(event => event.day === day);
    const dhuhr = times.find(event => event.key === 'dhuhr'), asr = times.find(event => event.key === 'asr'), maghrib = times.find(event => event.key === 'maghrib');
    if (!dhuhr || !asr || !maghrib || times.length !== 5) continue;
    if (new Date(day + 'T12:00:00Z').getUTCDay() === 5) {
      events.push({ key: 'fridayPrayer', day, at: dhuhr.at - 45 * 60000, referenceAt: dhuhr.at });
      events.push({ key: 'fridayDua', day, at: Math.max(asr.at, maghrib.at - 60 * 60000), referenceAt: maghrib.at });
    }
    if (preferences.occasions.qada) {
      const forecast = nextRamadan(day);
      if ([30, 15].includes(forecast.days)) events.push({ key: `qada${forecast.days}`, day, at: dhuhr.at, ramadanDay: forecast.day, days: forecast.days });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}

export function reminderWindow(preferences, now) {
  const window = prayerWindow(preferences, now);
  return [...window, ...occasionEvents(preferences, window), ...dailyEvents(preferences, window, now)].sort((a, b) => a.at - b.at);
}

export function nextFridayReminders(preferences, now) {
  if (!preferences.city || !preferences.method) return [];
  const result = [];
  for (let offset = 0; offset <= 7 && result.length < 2; offset++) {
    const day = prayerDate(now, preferences.city.timezone, offset);
    if (new Date(day + 'T12:00:00Z').getUTCDay() !== 5) continue;
    for (const event of occasionEvents({ ...preferences, occasions: { ...preferences.occasions, qada: 0 } }, prayerSchedule(preferences, day))) {
      if (event.at > now && !result.some(item => item.key === event.key)) result.push(event);
    }
  }
  return result;
}
