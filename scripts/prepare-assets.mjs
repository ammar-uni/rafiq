import { createRequire } from 'node:module';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const sharp = require(process.argv[2] || 'sharp');
const file = name => fileURLToPath(new URL(`../assets/${name}`, import.meta.url));
await sharp(file('rafiq-banner-source.png')).resize({width:1536,withoutEnlargement:true}).webp({quality:85,effort:6}).toFile(file('rafiq-banner.webp'));
await sharp(file('rafiq-banner-v2-source.png')).resize({width:1536,withoutEnlargement:true}).webp({quality:85,effort:6}).toFile(file('rafiq-banner-v2.webp'));
await sharp(file('rafiq-banner-v3-source.png')).resize(1536,512).webp({quality:85,effort:6}).toFile(file('rafiq-banner-v3.webp'));
await sharp(file('rafiq-avatar-source.png')).resize(512,512,{fit:'inside',withoutEnlargement:true}).png({compressionLevel:9}).toFile(file('rafiq-avatar.png'));
await sharp(file('rafiq-avatar-source.png')).resize(160,160,{fit:'inside',withoutEnlargement:true}).webp({quality:85,effort:6}).toFile(file('rafiq-avatar.webp'));
for (const name of ['rafiq-banner.webp','rafiq-banner-v2.webp','rafiq-banner-v3.webp','rafiq-avatar.png','rafiq-avatar.webp']) {
  const meta=await sharp(file(name)).metadata();
  console.log(`${name}: ${meta.width} x ${meta.height}; ${Math.round((await stat(file(name))).size/1024)} KB`);
}
