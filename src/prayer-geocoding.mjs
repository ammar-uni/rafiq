import cityIndex from './data/city-aliases.json' with { type: 'json' };
import { DEFAULT_PRAYER, validatePrayer } from './prayer-config.mjs';

// Normalize matching only: display names and coordinates are sourced, never
// inferred from the user's language, IP address, or Discord account.
const cleanName = value => value.normalize('NFKC').replace(/[\u0640\u064b-\u065f\u0670]/gu, '').replace(/\s+/gu, ' ').trim();
const nameKey = value => cleanName(value).toLocaleLowerCase('en').replace(/[أإآٱ]/gu, 'ا').replace(/[ىی]/gu, 'ي').replace(/ک/gu, 'ك').replace(/ة/gu, 'ه');
const cityNameKey = value => nameKey(value).replace(/^ال(?=\p{Script=Arabic})/u, '');
const safeLabel = value => cleanName(value).replace(/[\p{Cc}\p{Cf}<>@*_`\[\]\\]/gu, '');
const countryNames = new Intl.DisplayNames(['ar'], { type: 'region', fallback: 'none' });
const countryAliases = new Map();
for (const language of ['ar', 'en']) {
  const names = new Intl.DisplayNames([language], { type: 'region', fallback: 'none' });
  for (let first = 65; first <= 90; first++) for (let last = 65; last <= 90; last++) {
    const code = String.fromCharCode(first, last), label = names.of(code);
    if (label && !['ZZ', 'EU', 'EZ', 'UN', 'XA', 'XB', 'QO'].includes(code)) { countryAliases.set(nameKey(label), code); countryAliases.set(code.toLowerCase(), code); }
  }
}
for (const [code, aliases] of Object.entries({ SA: ['السعودية', 'سعودية', 'KSA'], AE: ['الإمارات', 'الامارات العربية المتحدة', 'UAE'],
  US: ['أمريكا', 'امريكا', 'USA'], GB: ['بريطانيا', 'UK'], PS: ['فلسطين'], SY: ['سوريا', 'سورية'],
  KR: ['كوريا الجنوبية'], KP: ['كوريا الشمالية'], CZ: ['التشيك'] })) {
  for (const alias of aliases) countryAliases.set(nameKey(alias), code);
}
const countrySuffixes = [...countryAliases.keys()].filter(key => key.length > 2).sort((a, b) => b.length - a.length);
const spellingScore = name => (name.match(/ة/gu) || []).length * 3 + (name.match(/[أإآي]/gu) || []).length;
// Compact per-city strings avoid duplicating a full geographic record per alias.
// Boundaries require whole-name matches, not arbitrary substrings or near misses.
const cityKeys = cityIndex.cities.map(row => '\n' + [...new Set(row[1].map(cityNameKey))].join('\n') + '\n');
function localCityMatches(name) {
  const key = cityNameKey(name), needle = '\n' + key + '\n';
  return cityIndex.cities.flatMap((row, i) => {
    if (!cityKeys[i].includes(needle)) return [];
    const [id, names, countryCode, admin1, latitude, longitude, timezone, population, featureCode] = row;
    const spelling = names.filter(alias => cityNameKey(alias) === key).sort((a, b) => spellingScore(b) - spellingScore(a))[0];
    return [{ id, name: cleanName(spelling), country_code: countryCode,
      country: countryNames.of(countryCode) || countryCode, admin1: cityIndex.regions[countryCode + '.' + admin1], latitude, longitude, timezone, population, feature_code: featureCode }];
  });
}

function parseCityQuery(query) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 80 || /[\p{Cc}\p{Cf}]/u.test(query)) throw new RangeError('Invalid city query');
  const parts = cleanName(query).replace(/،/gu, ',').split(',').map(part => part.trim());
  const countryCode = parts.length > 1 ? countryAliases.get(nameKey(parts.at(-1))) : null;
  if (parts.length > 1) {
    const name = (countryCode ? parts.slice(0, -1) : parts).join(', ');
    if (name.length < 2) throw new RangeError('Invalid city query');
    return { name, countryCode, local: !name.includes(',') };
  }
  const key = nameKey(parts[0]);
  for (const suffix of countrySuffixes) {
    if (key.endsWith(' ' + suffix)) {
      const name = parts[0].split(' ').slice(0, -suffix.split(' ').length).join(' ');
      if (name.length >= 2) return { name, countryCode: countryAliases.get(suffix), local: true };
    }
  }
  return { name: parts[0], countryCode: null, local: true };
}

function validCities(items, countryCode, rank = false) {
  const seen = new Set();
  const administrativeSeat = item => /^PPL[A-C]/.test(item.feature_code || '') ? 1 : 0;
  const candidates = items.filter(item => item && typeof item.name === 'string' && item.name.trim() &&
    /^PPL/.test(item.feature_code || '') && !['PPLX', 'PPLH', 'PPLQ', 'PPLCH'].includes(item.feature_code) && (!countryCode || item.country_code === countryCode));
  // Remote ranking also matches translated aliases we cannot see in its response.
  if (rank) candidates.sort((a, b) => administrativeSeat(b) - administrativeSeat(a) || (Number(b.population) || 0) - (Number(a.population) || 0));
  return candidates.flatMap(item => {
    if (!Number.isFinite(item.latitude) || !Number.isFinite(item.longitude)) return [];
    const country = (/^[A-Z]{2}$/.test(item.country_code || '') && item.country_code !== 'ZZ' ? countryNames.of(item.country_code) : null) || item.country;
    if (typeof country !== 'string' || !country.trim()) return [];
    const label = [safeLabel(item.name).slice(0, 55), safeLabel(country).slice(0, 40)].join('، ');
    const city = { label, latitude: Math.round(item.latitude * 1000) / 1000, longitude: Math.round(item.longitude * 1000) / 1000, timezone: item.timezone };
    try { validatePrayer({ ...DEFAULT_PRAYER, city }); } catch { return []; }
    const identity = [city.latitude, city.longitude, city.timezone].join(':');
    if (seen.has(identity)) return [];
    seen.add(identity);
    return [{ city, region: typeof item.admin1 === 'string' ? safeLabel(item.admin1) : '' }];
  }).slice(0, 8).map(({ city, region }, _, cities) => {
    if (cities.filter(other => other.city.label === city.label).length > 1) {
      const repeatedRegion = cities.filter(other => other.city.label === city.label && other.region === region).length > 1;
      const detail = region && !repeatedRegion ? region : `${region ? region + ' ' : ''}(${city.latitude}, ${city.longitude})`;
      return { ...city, label: `${city.label.slice(0, 70)}، ${detail}`.slice(0, 100) };
    }
    return city;
  });
}

export async function findPrayerCities(query, { fetchImpl = fetch } = {}) {
  const { name, countryCode, local } = parseCityQuery(query);
  const matches = local ? validCities(localCityMatches(name), countryCode, true) : [];
  if (matches.length) return matches;
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({ name, count: '40', language: 'ar', format: 'json' }).toString();
  if (countryCode) url.searchParams.set('countryCode', countryCode);
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(7000), redirect: 'error', headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('City search unavailable');
  const body = await response.text();
  if (body.length > 100000) throw new Error('City response too large');
  const data = JSON.parse(body);
  return validCities(Array.isArray(data?.results) ? data.results.slice(0, 40) : [], countryCode);
}
