import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { findPrayerCities } from '../src/prayer-geocoding.mjs';

export function createPreviewServer({ lookup = findPrayerCities } = {}) {
let searches = [];
return createServer(async (request, response) => {
  const host = request.headers.host;
  if (![`127.0.0.1:${request.socket.localPort}`, `localhost:${request.socket.localPort}`].includes(host) ||
      (request.headers.origin && request.headers.origin !== `http://${host}`) || request.headers['sec-fetch-site'] === 'cross-site') {
    response.writeHead(403); response.end(); return;
  }
  if (request.method !== 'GET') { response.writeHead(405, { Allow: 'GET' }); response.end(); return; }
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/api/cities') {
    const json = (status, value) => { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(value)); };
    searches = searches.filter(at => Date.now() - at < 60000);
    if (searches.length >= 30) { json(429, { error: 'Try again shortly' }); return; }
    searches.push(Date.now());
    try { json(200, await lookup(url.searchParams.get('q'))); }
    catch (error) { json(error instanceof RangeError ? 400 : 503, { error: 'City search unavailable' }); }
    return;
  }
  if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
  const width = Math.max(320, Math.min(1280, Number(url.searchParams.get('width')) || 736));
  const theme = ['light', 'dark'].includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : 'light dark';
  let fragment;
  try { fragment = await readFile(new URL('../output/rafiq-identity.html', import.meta.url), 'utf8'); }
  catch { response.writeHead(503, { 'Content-Type': 'text/plain' }); response.end('Build the preview first: npm run preview:build'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تجربة رفيق</title><style>html{color-scheme:${theme}}body{margin:0;background:light-dark(#f1f2f4,#202225)}main{max-width:${width}px;margin:24px auto;padding:8px}@media(max-width:400px){main{margin:0 auto;padding:0}}</style></head><body><main>${fragment}</main></body></html>`);
});
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
const server = createPreviewServer();
server.listen(43189, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:43189 (no Discord connection)'));
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
}
