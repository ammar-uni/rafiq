// Saudi calendar forecasts for advance notices, not declarations of moon sighting.
export const SEASONAL_ZONE = 'Asia/Riyadh';
export const SEASONAL_SEND_HOUR = 12;
const seasonalDayMs = 86400000;
const seasonalHijri = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', { timeZone: SEASONAL_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' });
const seasonalForecasts = new Map();
export const SEASONAL_CAMPAIGNS = Object.freeze([
  Object.freeze({ key: 'dhul-hijjah', day: 1, leads: Object.freeze([2]) }),
  Object.freeze({ key: 'arafah', day: 9, leads: Object.freeze([2]) })
]);

// Add only source-checked Saudi announcements here. An empty registry leaves all
// notices explicitly approximate. A changed date keeps the same campaign IDs.
export const SEASONAL_CONFIRMED_STARTS = Object.freeze([]);

export function seasonalCivilDay(value) {
  const at = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? Date.parse(value + 'T09:00:00Z') : NaN;
  if (!Number.isFinite(at) || new Date(at).toISOString().slice(0, 10) !== value) throw new RangeError('Invalid seasonal date');
  return at;
}
export function seasonalHijriParts(now) {
  if (seasonalHijri.resolvedOptions().calendar !== 'islamic-umalqura') throw new Error('Umm al-Qura calendar unavailable');
  const parts = seasonalHijri.formatToParts(now);
  return Object.fromEntries(['year', 'month', 'day'].map(key => [key, Number(parts.find(part => part.type === key).value)]));
}
function forecastDhulHijjah(year) {
  if (seasonalForecasts.has(year)) return seasonalForecasts.get(year);
  // This approximation locates a search window only; Intl supplies the date.
  const approximateYear = Math.floor(622 + year * 354.367 / 365.2425);
  const start = Date.UTC(approximateYear, 0, 1, 9);
  for (let offset = 0; offset < 800; offset++) {
    const at = start + offset * seasonalDayMs;
    const parts = seasonalHijriParts(at);
    if (parts.year === year && parts.month === 12 && parts.day === 1) {
      if (seasonalForecasts.size >= 8) seasonalForecasts.clear();
      seasonalForecasts.set(year, at);
      return at;
    }
  }
  throw new Error('Seasonal forecast unavailable');
}
export function seasonalYearEvents(year, confirmed = SEASONAL_CONFIRMED_STARTS) {
  if (!Number.isInteger(year) || year < 1356 || year > 1500) throw new RangeError('Unsupported seasonal year');
  const forecast = forecastDhulHijjah(year);
  const matches = confirmed.filter(item => item.year === year);
  if (matches.length > 1) throw new RangeError('Duplicate Saudi date confirmation');
  const reviewed = matches[0];
  let start = forecast;
  if (reviewed) {
    start = seasonalCivilDay(reviewed.day);
    const url = new URL(reviewed.sourceURL);
    if (url.protocol !== 'https:' || !['spa.gov.sa', 'www.spa.gov.sa'].includes(url.hostname) || url.username || url.password || url.pathname === '/' ||
        Math.abs(start - forecast) > seasonalDayMs || seasonalCivilDay(reviewed.checkedOn) > start) throw new RangeError('Invalid Saudi date confirmation');
  }
  return SEASONAL_CAMPAIGNS.flatMap(campaign => campaign.leads.map(days => {
    const referenceAt = start + (campaign.day - 1) * seasonalDayMs;
    return Object.freeze({ id: `${year}:${campaign.key}:${days}`, key: campaign.key, year, days,
      at: referenceAt - days * seasonalDayMs, referenceDay: new Date(referenceAt).toISOString().slice(0, 10),
      confirmed: Boolean(reviewed), sourceURL: reviewed?.sourceURL || null });
  })).sort((a, b) => a.at - b.at);
}
export function seasonalWindow(now, confirmed = SEASONAL_CONFIRMED_STARTS) {
  const { year } = seasonalHijriParts(now);
  // Include the adjacent year for year-boundary lookups and the next preview.
  return [year - 1, year, year + 1].filter(y => y >= 1356 && y <= 1500).flatMap(y => seasonalYearEvents(y, confirmed));
}
export function seasonalPreviewEvent(now = Date.now(), key = 'arafah') {
  return seasonalWindow(now).find(event => event.key === key && event.days === 2 && event.at > now);
}
