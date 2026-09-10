import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';

export function loadPrayerSounds(directory = fileURLToPath(new URL('../assets/sounds/', import.meta.url))) {
  const root = realpathSync(directory);
  const items = JSON.parse(readFileSync(resolve(root, 'catalog.json'), 'utf8'));
  if (!Array.isArray(items) || items.length > 20) throw new Error('Invalid sound catalog');
  const ids = new Set(), filenames = new Set();
  return items.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z][a-z0-9-]{0,31}$/.test(item.id) || ids.has(item.id) ||
        typeof item.label !== 'string' || item.label.length < 2 || item.label.length > 50 || /[\p{Cc}\p{Cf}<>@*_`\[\]\\]/u.test(item.label) ||
        typeof item.filename !== 'string' || !/^[a-z0-9-]+\.(mp3|ogg|wav)$/.test(item.filename) || filenames.has(item.filename)) throw new Error('Invalid sound entry');
    const path = resolve(root, item.filename), stat = lstatSync(path);
    if (!stat.isFile() || stat.isSymbolicLink() || dirname(realpathSync(path)) !== root || stat.size < 16 || stat.size > 1024 * 1024) throw new Error('Invalid sound file');
    const bytes = readFileSync(path);
    const header = bytes.subarray(0, 4).toString('ascii');
    const valid = item.filename.endsWith('.ogg') ? header === 'OggS' : item.filename.endsWith('.wav') ? header === 'RIFF' && bytes.subarray(8, 12).toString('ascii') === 'WAVE' : header.startsWith('ID3') || (bytes[0] === 255 && (bytes[1] & 224) === 224);
    if (!valid) throw new Error('Sound format mismatch');
    ids.add(item.id); filenames.add(item.filename);
    return Object.freeze({ id: item.id, label: item.label, filename: item.filename, path });
  });
}
