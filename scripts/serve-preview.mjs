import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname !== '/') { response.writeHead(404); response.end(); return; }
  const width = Math.max(320, Math.min(1280, Number(url.searchParams.get('width')) || 736));
  const theme = ['light', 'dark'].includes(url.searchParams.get('theme')) ? url.searchParams.get('theme') : 'light dark';
  let fragment;
  try { fragment = await readFile(new URL('../output/rafiq-identity.html', import.meta.url), 'utf8'); }
  catch { response.writeHead(503, { 'Content-Type': 'text/plain' }); response.end('Build the preview first: npm run preview:build'); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>تجربة رفيق</title><style>html{color-scheme:${theme}}body{margin:0;background:light-dark(#f1f2f4,#202225)}main{max-width:${width}px;margin:24px auto;padding:8px}@media(max-width:400px){main{margin:0 auto;padding:0}}</style></head><body><main>${fragment}</main></body></html>`);
});
server.listen(43189, '127.0.0.1', () => console.log('Local preview: http://127.0.0.1:43189 (no Discord connection)'));
process.once('SIGINT', () => server.close());
process.once('SIGTERM', () => server.close());
