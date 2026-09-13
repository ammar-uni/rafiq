import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { get } from 'node:http';
import { readFile } from 'node:fs/promises';
import { findPrayerCities } from '../src/prayer-geocoding.mjs';
import index from '../src/data/city-aliases.json' with { type: 'json' };
import { createPreviewServer } from '../scripts/serve-preview.mjs';

const noNetwork = async () => { throw new Error('Unexpected external request'); };
const response = results => ({ ok: true, text: async () => JSON.stringify({ results }) });
const place = (overrides = {}) => ({ name: 'Example', country: 'United States', country_code: 'US', feature_code: 'PPL',
  latitude: 40, longitude: -80, timezone: 'America/New_York', population: 1000, ...overrides });

test('Buraidah spellings resolve to Saudi Arabia without a network request', async () => {
  for (const query of ['بريدة', 'بريده', 'بُرَيْدَة', 'بــريدة', 'بريدة، السعودية', 'بريدة السعودية', 'بريدة, Saudi Arabia', 'بريدة، المملكة العربية السعودية', 'بريدة، SA']) {
    const cities = await findPrayerCities(query, { fetchImpl: noNetwork });
    assert.equal(cities[0].label, 'بريدة، المملكة العربية السعودية', query);
    assert.equal(cities[0].latitude, 26.326); assert.equal(cities[0].longitude, 43.975);
    assert.equal(cities[0].timezone, 'Asia/Riyadh');
    if (query.includes('،') || query.includes(',') || query.includes(' السعودية')) assert.equal(cities.length, 1);
  }
});

test('Arabic aliases cover multiple countries and scripts, never a fixed choice of demo cities', async () => {
  const cases = [['مكة', 'Asia/Riyadh'], ['مكة المكرمة، السعودية', 'Asia/Riyadh'], ['المدينة المنورة', 'Asia/Riyadh'],
    ['أبو ظبي', 'Asia/Dubai'], ['القاهرة، مصر', 'Africa/Cairo'], ['الدار البيضاء', 'Africa/Casablanca'],
    ['عمان، الأردن', 'Asia/Amman'], ['دمشق', 'Asia/Damascus'], ['طوكيو', 'Asia/Tokyo'], ['عنيزة', 'Asia/Riyadh'],
    ['الخرطوم', 'Africa/Khartoum'], ['東京, Japan', 'Asia/Tokyo'], ['London, UK', 'Europe/London'], ['São Paulo, Brazil', 'America/Sao_Paulo']];
  for (const [query, timezone] of cases) {
    const cities = await findPrayerCities(query, { fetchImpl: noNetwork });
    assert.equal(cities[0]?.timezone, timezone, query);
  }
  const cairo = await findPrayerCities('القاهرة', { fetchImpl: noNetwork });
  assert.equal(new Set(cairo.map(city => city.label)).size, cairo.length);
});

test('country constraints and Arabic commas survive fallback; unknown places stay empty', async () => {
  const calls = [];
  const fetchImpl = async url => { calls.push(url); return response([]); };
  for (const query of ['قرية غير موجودة، السعودية', 'Unknown Town, Japan', 'Example United States', 'بريدة، اليابان']) {
    assert.deepEqual(await findPrayerCities(query, { fetchImpl }), []);
  }
  assert.equal(calls[0].searchParams.get('countryCode'), 'SA');
  assert.equal(calls[1].searchParams.get('countryCode'), 'JP');
  assert.equal(calls[2].searchParams.get('countryCode'), 'US');
  assert.equal(calls[3].searchParams.get('countryCode'), 'JP');
  await findPrayerCities('Example، Unknown Region', { fetchImpl });
  assert.equal(calls.at(-1).searchParams.get('name'), 'Example, Unknown Region');
  assert.equal(calls.at(-1).searchParams.has('countryCode'), false);
});

test('global search preserves provider relevance, filters before limiting, deduplicates and validates', async () => {
  const items = [place({ name: 'Example Airport', feature_code: 'AIRP', population: 999999 }), null,
    place({ latitude: null }), place({ longitude: '1' }), place({ timezone: 'Mars/Olympus' }),
    place({ latitude: 999 }), place({ country_code: 'DE' }),
    place({ latitude: 41, population: 11000 }),
    ...Array.from({ length: 12 }, (_, i) => place({ latitude: 30 + i, population: i * 1000 })),
    place({ latitude: 41, population: 11000 }), place({ name: 'Example Heights', latitude: 50, population: 1000000 })];
  const result = await findPrayerCities('Example, United States', { fetchImpl: async () => response(items) });
  assert.equal(result.length, 8); assert.equal(result[0].latitude, 41);
  assert.equal(new Set(result.map(city => city.latitude)).size, 8);
  assert.ok(result.every(city => city.label.includes('الولايات المتحدة')));
  assert.equal(result.some(city => city.label.includes('Heights')), false);
});

test('invalid queries and external failures cannot fabricate a location', async () => {
  for (const query of ['', 'a', null, '\u200fبريدة', 'a'.repeat(81), '، السعودية']) {
    await assert.rejects(findPrayerCities(query, { fetchImpl: noNetwork }), /Invalid city query/);
  }
  for (const fetchImpl of [async () => ({ ok: false }), async () => ({ ok: true, text: async () => 'x'.repeat(100001) }),
    async () => ({ ok: true, text: async () => '{' }), async () => { throw new Error('timeout'); }]) {
    await assert.rejects(findPrayerCities('Unknown Town', { fetchImpl }));
  }
});

test('bundled index has provenance, unique IDs and valid coordinates/time zones', () => {
  assert.equal(index.attribution, 'GeoNames'); assert.match(index.license, /creativecommons.org\/licenses\/by\/4.0/);
  assert.match(index.sourceSha256, /^[a-f0-9]{64}$/); assert.ok(index.cities.length > 30000);
  const ids = new Set(), zones = new Set();
  for (const [id, names, code, , lat, lon, tz] of index.cities) {
    assert.equal(ids.has(id), false); ids.add(id);
    assert.ok(names.length > 0); assert.match(code, /^[A-Z]{2}$/);
    assert.ok(Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lon) && Math.abs(lon) <= 180);
    zones.add(tz);
  }
  for (const timeZone of zones) assert.doesNotThrow(() => new Intl.DateTimeFormat('en', { timeZone }));
});

test('preview serves the real lookup, limits traffic and rejects foreign origins', async t => {
  const queries = [];
  const server = createPreviewServer({ lookup: async q => { queries.push(q); return findPrayerCities(q, { fetchImpl: noNetwork }); } });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => { server.closeAllConnections(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const url = base + '/api/cities?' + new URLSearchParams({ q: 'بريدة' });
  const real = await fetch(url); assert.equal(real.status, 200);
  assert.equal((await real.json())[0].label, 'بريدة، المملكة العربية السعودية');
  assert.deepEqual(queries, ['بريدة']);
  assert.equal((await fetch(url, { headers: { Origin: 'https://example.com' } })).status, 403);
  const foreignHost = await new Promise((resolve, reject) => get(url, { headers: { Host: 'example.com' } }, res => { res.resume(); resolve(res.statusCode); }).on('error', reject));
  assert.equal(foreignHost, 403);
  assert.equal((await fetch(url, { method: 'POST' })).status, 405);
  assert.equal((await fetch(base + '/api/cities?q=x')).status, 400);
  for (let i = 0; i < 28; i++) assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url)).status, 429);
});

test('preview submits the query to the shared server and shows Makkah as its example', async () => {
  const preview = await readFile(new URL('../design/preview.fragment.html', import.meta.url), 'utf8');
  assert.match(preview, /fetch\('\/api\/cities\?'/);
  assert.doesNotMatch(preview, /demoCities|ثلاث مدن تجريبية|Berlin, Germany/);
  assert.match(preview, /جارٍ البحث/);
});
