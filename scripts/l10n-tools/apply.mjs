// Applies a reviewed replacement map and adds its keys to both dictionaries.
//   node scripts/l10n-tools/apply.mjs <map.mjs>
// A map exports: prefix, keys { name: [en, ar] | {en:{plural}, ar:{plural}} }, parts [{ file, edits: [[line, find, replace]] }].
// Every edit must match exactly once on its line, or NOTHING is written. Dictionaries are written first.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const map = await import(pathToFileURL(path.resolve(process.argv[2])).href);
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
  if (o[leaf] !== undefined && JSON.stringify(o[leaf]) !== JSON.stringify(value)) throw new Error(`${which}: ${key} already exists with a different value: ${JSON.stringify(o[leaf])}`);
  o[leaf] = value;
}
const ph = (v) => { const t = typeof v === 'string' ? [v] : Object.values(v); const s = new Set(); for (const x of t) for (const m of x.matchAll(/\{\{\s*(\w+)\s*\}\}/g)) s.add(m[1]); return [...s].sort().join(','); };
let added = 0;
for (const [name, val] of Object.entries(map.keys)) {
  const key = map.prefix ? `${map.prefix}.${name}` : name;
  const [e, a] = Array.isArray(val) ? val : [val.en, val.ar];
  if (!e || !a) throw new Error(`missing a language for ${key}`);
  if (ph(e) !== ph(a)) throw new Error(`placeholder mismatch in ${key}: [${ph(e)}] vs [${ph(a)}]`);
  set(en, key, e, 'en'); set(ar, key, a, 'ar'); added++;
}
const problems = []; const usedKeys = new Set(); const pending = [];
for (const part of map.parts ?? []) {
  const raw = fs.readFileSync(part.file, 'utf8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(eol);
  const name = part.file.split('/').slice(-2).join('/');
  for (const [line, find, replace] of part.edits) {
    const cur = lines[line - 1];
    if (cur === undefined) { problems.push(`${name}:${line}: no such line`); continue; }
    const n = cur.split(find).length - 1;
    if (n !== 1) { problems.push(`${name}:${line}: expected 1 match of ${JSON.stringify(find)}, found ${n} in: ${cur.trim().slice(0, 120)}`); continue; }
    lines[line - 1] = cur.replace(find, () => replace.split('\n').join(eol));
    for (const m of replace.matchAll(/(?<![\w.])t\(\s*['`]([a-zA-Z0-9_.]+)['`]/g)) usedKeys.add(m[1]);
  }
  pending.push([part.file, lines.join(eol)]);
}
const get = (d, k) => k.split('.').reduce((a, p) => (a && typeof a === 'object') ? a[p] : undefined, d);
for (const k of usedKeys) if (!k.endsWith('.') && (get(en, k) === undefined || get(ar, k) === undefined)) problems.push(`key used but not defined: ${k}`);
if (problems.length) { console.log(`NOT APPLIED — ${problems.length} problem(s):\n  ` + problems.join('\n  ')); process.exit(1); }
const write = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2).split('\n').join('\r\n') + '\r\n');
write(EN_P, en); write(AR_P, ar);
for (const [file, text] of pending) fs.writeFileSync(file, text);
console.log(`applied ${(map.parts ?? []).reduce((n, p) => n + p.edits.length, 0)} edits; ${added} keys defined; ${usedKeys.size} keys referenced`);
