import { DEFAULT_PRAYER, validatePrayer } from './prayer-config.mjs';

export async function findPrayerCities(query, { fetchImpl = fetch } = {}) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query)) throw new RangeError('Invalid city query');
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name: query.trim(), count: '8', language: 'ar', format: 'json' }).toString();
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000), redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('City search unavailable');
  const body = await response.text();
  if (body.length > 100000) throw new Error('City response too large');
  const data = JSON.parse(body);
  if (!Array.isArray(data.results)) return [];
  return data.results.slice(0, 8).flatMap(item => {
    if (!/^PPL/.test(item.feature_code || '')) return [];
    const label = [...new Set([item.name, item.admin1, item.country].filter(v => typeof v === 'string' && v))].join('، ').replace(/[\p{Cc}\p{Cf}<>@*_`\[\]\\]/gu, '').slice(0, 100);
    const city = { label, latitude: Math.round(item.latitude * 1000) / 1000, longitude: Math.round(item.longitude * 1000) / 1000, timezone: item.timezone };
    try { validatePrayer({ ...DEFAULT_PRAYER, city }); return [city]; } catch { return []; }
  });
}
