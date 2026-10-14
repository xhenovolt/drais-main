// Writes a map's keys to both dictionaries.  node scripts/l10n-tools/keys.mjs <map.mjs> [--overwrite]
// A map exports: prefix, keys { name: [en, ar] | { en: {plural}, ar: {plural} } }.
// Without --overwrite an existing key with a different value is an error.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const map = await import(pathToFileURL(path.resolve(process.argv[2])).href);
const overwrite = process.argv.includes('--overwrite');
const EN_P = 'src/locales/en.json', AR_P = 'src/locales/ar.json';
const en = JSON.parse(fs.readFileSync(EN_P, 'utf8')), ar = JSON.parse(fs.readFileSync(AR_P, 'utf8'));
function set(d, key, value, which) {
  const parts = key.split('.'); let o = d;
  for (let i = 0; i < parts.length - 1; i++) {
    if (o[parts[i]] === undefined) o[parts[i]] = {};
    if (typeof o[parts[i]] !== 'object') throw new Error(`${which}: cannot nest ${key} — ${parts.slice(0, i + 1).join('.')} is text`);
    o = o[parts[i]];
  }
  const leaf = parts.at(-1);
  if (!overwrite && o[leaf] !== undefined && JSON.stringify(o[leaf]) !== JSON.stringify(value)) throw new Error(`${which}: ${key} exists with a different value`);
  o[leaf] = value;
}
const ph = (v) => { const t = typeof v === 'string' ? [v] : Object.values(v); const s = new Set(); for (const x of t) for (const m of x.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) s.add(m[1]); return [...s].sort().join(','); };
let n = 0;
for (const [name, val] of Object.entries(map.keys)) {
  const key = map.prefix ? `${map.prefix}.${name}` : name;
  const [e, a] = Array.isArray(val) ? val : [val.en, val.ar];
  if (ph(e) !== ph(a)) throw new Error(`placeholder mismatch in ${key}: [${ph(e)}] vs [${ph(a)}]`);
  set(en, key, e, 'en'); set(ar, key, a, 'ar'); n++;
}
const write = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2).split('\n').join('\r\n') + '\r\n');
write(EN_P, en); write(AR_P, ar);
console.log(n, 'keys written');
