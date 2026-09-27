import { prayerDate } from './prayer-times.mjs';
import { localClockInstant } from './daily-times.mjs';
import { seasonalWindow } from './seasonal-times.mjs';

export const SERVER_ZONES = Object.freeze([
  ['Asia/Riyadh', 'مكة المكرمة · السعودية'], ['Asia/Dubai', 'الإمارات'],
  ['Asia/Qatar', 'قطر'], ['Asia/Kuwait', 'الكويت'], ['Asia/Baghdad', 'العراق'],
  ['Asia/Amman', 'الأردن'], ['Asia/Beirut', 'لبنان'], ['Africa/Cairo', 'مصر'],
  ['Africa/Khartoum', 'السودان'], ['Africa/Tripoli', 'ليبيا'], ['Africa/Tunis', 'تونس'],
  ['Africa/Algiers', 'الجزائر'], ['Africa/Casablanca', 'المغرب'],
  ['Europe/Berlin', 'ألمانيا'], ['Europe/London', 'بريطانيا'], ['Europe/Istanbul', 'تركيا'],
  ['America/New_York', 'شرق الولايات المتحدة'], ['America/Los_Angeles', 'غرب الولايات المتحدة'],
  ['Asia/Karachi', 'باكستان'], ['Asia/Kuala_Lumpur', 'ماليزيا'], ['Australia/Sydney', 'سيدني']
]);
export const DEFAULT_SERVER = Object.freeze({
  enabled: false, channelId: null, roleId: null, mentionEveryone: false, dailyCount: 1, seasonal: true,
  times: Object.freeze(['20:00']), timezone: 'Asia/Riyadh', activatedAt: 0, issue: null
});
export const serverTimesForCount = count => count < 2 ? ['20:00'] : count === 2 ? ['09:00', '20:00'] : ['09:00', '15:00', '20:00'];
export const serverId = value => typeof value === 'string' && /^\d{1,25}$/.test(value);
export function validateServer(p) {
  if (!p || Object.keys(p).sort().join() !== Object.keys(DEFAULT_SERVER).sort().join()) throw new TypeError('Invalid server settings');
  if (typeof p.enabled !== 'boolean' || typeof p.seasonal !== 'boolean' || !Number.isInteger(p.dailyCount) || p.dailyCount < 0 || p.dailyCount > 3) throw new RangeError('Invalid server frequency');
  if (![p.channelId, p.roleId].every(value => value === null || serverId(value))) throw new RangeError('Invalid server target');
  if (typeof p.mentionEveryone !== 'boolean' || (p.mentionEveryone && p.roleId !== null)) throw new RangeError('Invalid server mention');
  if (typeof p.timezone !== 'string' || p.timezone.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(p.timezone)) throw new RangeError('Invalid server timezone');
  new Intl.DateTimeFormat('en', { timeZone: p.timezone });
  if (!Array.isArray(p.times) || p.times.length !== Math.max(1, p.dailyCount) || p.times.some(time => typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))) throw new RangeError('Invalid server times');
  const minutes = p.times.map(time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3)));
  if (minutes.some((n, i) => i > 0 && n - minutes[i - 1] < 60) || (minutes.length > 1 && 1440 + minutes[0] - minutes.at(-1) < 60)) throw new RangeError('Server times must be ordered and at least an hour apart');
  if (!Number.isSafeInteger(p.activatedAt) || p.activatedAt < 0 || ![null, 'permissions', 'delivery'].includes(p.issue)) throw new RangeError('Invalid server state');
  if (p.enabled && (!p.channelId || (!p.dailyCount && !p.seasonal) || !p.activatedAt)) throw new RangeError('Incomplete server setup');
  return p;
}

// Older local previews only had role mentions. Loading them never opts into everyone.
export function readStoredServer(p) {
  return validateServer(p && !Object.hasOwn(p, 'mentionEveryone') ? {...p, mentionEveryone: false} : p);
}

// Seasonal dates follow the existing Saudi forecast. The server chooses the
// local posting hour. No missed posts are replayed after a restart.
export function serverEvents(p, now, campaigns = seasonalWindow(now)) {
  validateServer(p);
  const events = [];
  for (const offset of [-1, 0, 1]) {
    const day = prayerDate(now, p.timezone, offset);
    const season = p.seasonal ? campaigns.find(event => new Date(event.at).toISOString().slice(0, 10) === day) : null;
    for (let slot = 0; slot < Math.max(1, p.dailyCount); slot++) {
      const event = slot === 0 ? season : null;
      if (!event && !p.dailyCount) continue;
      const at = localClockInstant(day, p.times[slot], p.timezone);
      if (at === null) continue;
      events.push({ id: event ? `seasonal:${event.id}` : `daily:${day}:${slot}`, kind: event ? 'seasonal' : 'daily', day, slot, at, campaign: event || null });
    }
  }
  return events.sort((a, b) => a.at - b.at);
}
