import { prayerDate } from './prayer-times.mjs';

// Resolve civil clock time without the server's own timezone. A skipped DST
// minute is omitted; the earlier occurrence is used when clocks turn back.
export function localClockInstant(day, clock, timezone) {
  const wanted = `${day} ${clock}`;
  const format = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const partsAt = at => {
    const parts = format.formatToParts(at), get = name => parts.find(p => p.type === name).value;
    return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
  };
  const nominal = Date.parse(`${day}T${clock}:00Z`);
  if (!Number.isFinite(nominal)) return null;
  const offsets = new Set([-36, -12, 0, 12, 36].map(hours => {
    const at = nominal + hours * 3600000;
    return Date.parse(partsAt(at).replace(' ', 'T') + ':00Z') - at;
  }));
  const matches = [...offsets].map(offset => nominal - offset).filter(at => partsAt(at) === wanted);
  return matches.length ? Math.min(...matches) : null;
}

export function dailyEvents(p, window, now) {
  if (!p.city) return [];
  const events = [];
  for (const [key, prayer] of [['morning', 'fajr'], ['evening', 'maghrib']]) {
    const item = p.daily[key];
    if (item.iqamaMinutes === null) continue;
    for (const event of window.filter(e => e.key === prayer)) {
      events.push({ key, day: event.day, at: event.at + (item.iqamaMinutes + 15) * 60000, referenceAt: event.at });
    }
  }
  if (p.daily.quran.time) for (const offset of [-1, 0, 1]) {
    const day = prayerDate(now, p.city.timezone, offset);
    const at = localClockInstant(day, p.daily.quran.time, p.city.timezone);
    if (at !== null) events.push({ key: 'quran', day, at });
  }
  return events;
}

export function eventActivation(p, key) {
  if (Object.hasOwn(p.daily, key)) return p.daily[key].activatedAt;
  if (key === 'qada30' || key === 'qada15') return p.occasions.qada;
  if (Object.hasOwn(p.occasions, key)) return p.occasions[key];
  return p.enabled ? p.activatedAt : 0;
}
