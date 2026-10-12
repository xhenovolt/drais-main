/**
 * Translation completeness gate. Fails `npm test` when:
 *   - a key used in code is missing from en.json or ar.json;
 *   - the two dictionaries do not have exactly the same keys;
 *   - a text uses different {{placeholders}} in the two languages;
 *   - a key is malformed (a dot or a space inside one segment) or written twice;
 *   - an Arabic entry is still English;
 *   - code imports one of the removed translation mechanisms.
 *
 * It proves the dictionaries are consistent with the code. It does NOT prove a page renders in
 * Arabic — that needs a browser (docs/localization/ARABIC_TRANSLATION_ROADMAP.md).
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenKeys, placeholdersOf, isPluralEntry } from '../core.ts';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readText = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');
const en = JSON.parse(readText('locales/en.json'));
const ar = JSON.parse(readText('locales/ar.json'));
const E = flattenKeys(en), A = flattenKeys(ar);
const list = (xs, n = 15) => xs.slice(0, n).join(', ') + (xs.length > n ? ` … and ${xs.length - n} more` : '');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') walk(p, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.(test|d)\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}
const files = walk(SRC).map((p) => ({ rel: path.relative(SRC, p).replace(/\\/g, '/'), src: fs.readFileSync(p, 'utf8') }));
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

describe('dictionaries: structure', () => {
  it('English and Arabic have exactly the same keys', () => {
    const enOnly = Object.keys(E).filter((k) => !(k in A)), arOnly = Object.keys(A).filter((k) => !(k in E));
    assert.equal(enOnly.length, 0, `In en.json but not ar.json: ${list(enOnly)}`);
    assert.equal(arOnly.length, 0, `In ar.json but not en.json: ${list(arOnly)}`);
  });

  it('a text uses the same {{placeholders}} in both languages', () => {
    const bad = Object.keys(E).filter((k) => k in A && placeholdersOf(E[k]).join(',') !== placeholdersOf(A[k]).join(','));
    assert.equal(bad.length, 0, `Placeholder mismatch: ${list(bad.map((k) => `${k} (en: ${placeholdersOf(E[k])} / ar: ${placeholdersOf(A[k])})`), 6)}`);
  });

  it('no key segment contains a dot (the lookup splits on dots, so it could never be found)', () => {
    const bad = [];
    const visit = (o, where, name) => { for (const [k, v] of Object.entries(o)) { if (k.includes('.')) bad.push(`${name}: ${where}${k}`); if (v && typeof v === 'object') visit(v, `${where}${k}.`, name); } };
    visit(en, '', 'en'); visit(ar, '', 'ar');
    assert.equal(bad.length, 0, `Dotted key written as one property: ${list(bad)}`);
  });

  // 20 old top-level keys such as "total classes" predate this gate and nothing references them.
  // They are tolerated until removed; no NEW key may contain a space.
  const LEGACY_SPACED = new Set(['total classes', 'total learners', 'total staff', 'total parents', 'system analysis', 'bar chart', 'pie chart', 'line chart',
    'additional metrics', 'fully paid learners', 'partially paid learners', 'improving learners', 'declining learners', 'term progress', 'term name',
    'remaining days', 'days covered', 'weekends covered', 'public days', 'no active term']);
  it('no new key contains a space', () => {
    const bad = Object.keys(E).filter((k) => /\s/.test(k) && !LEGACY_SPACED.has(k));
    assert.equal(bad.length, 0, `Key with a space: ${list(bad)}`);
  });

  it('no key is written twice in the same group (the later one silently wins)', () => {
    for (const name of ['locales/en.json', 'locales/ar.json']) {
      const dup = []; const stack = [new Set()]; const trail = [];
      for (const line of readText(name).split(/\r?\n/)) {
        const m = line.match(/^\s*"((?:[^"\\]|\\.)*)"\s*:\s*(\{)?/);
        if (m) {
          const here = stack[stack.length - 1];
          if (here.has(m[1])) dup.push([...trail, m[1]].join('.'));
          here.add(m[1]);
          if (m[2] && !/\}\s*,?\s*$/.test(line)) { stack.push(new Set()); trail.push(m[1]); }
        } else if (/^\s*\}\s*,?\s*$/.test(line) && stack.length > 1) { stack.pop(); trail.pop(); }
      }
      assert.equal(dup.length, 0, `Duplicate keys in ${name}: ${list(dup)}`);
    }
  });

  it('a plural entry has an "other" form in both languages', () => {
    const groups = (d) => Object.entries(flattenKeys(d)).filter(([, v]) => typeof v !== 'string').map(([k]) => k);
    for (const k of new Set([...groups(en), ...groups(ar)])) {
      assert.ok(isPluralEntry(E[k]) && isPluralEntry(A[k]), `${k} must be a plural entry (with "other") in both languages`);
    }
  });
});

describe('dictionaries: Arabic is actually Arabic', () => {
  // Values that are legitimately not Arabic script: figures, brand names, addresses, units, codes.
  const ALLOW = /^[\d\s.,+%:/\-–—()K]*$|@|^https?:|^DRAIS\b|^(UGX|USh)$|^AR\?$|^(EN|AR|PDF|CSV|SMS|ID|NIN|LIN|QR|API|URL|UCE|UACE|PLE|CAFE)$/;
  it('no Arabic entry is still plain English', () => {
    const bad = Object.keys(A).filter((k) => {
      const texts = typeof A[k] === 'string' ? [A[k]] : Object.values(A[k]);
      return texts.some((t) => !/[؀-ۿ]/.test(t) && /[A-Za-z]{3}/.test(t) && !ALLOW.test(t.trim()));
    });
    assert.equal(bad.length, 0, `Arabic entries without Arabic text: ${list(bad.map((k) => `${k}="${typeof A[k] === 'string' ? A[k] : A[k].other}"`), 10)}`);
  });
});

describe('code: every key that is used exists', () => {
  // The operator docs under app/control/docs show translation calls as code samples; they are not interface keys.
  const scanned = files.filter((f) => /useI18n|getServerI18n|getNavigationItems|tWrapper/.test(f.src) && !f.rel.startsWith('app/control/'));
  const CALL = /(?<![\w.])t\(\s*(['"])([a-zA-Z0-9_\-]+(?:\.[a-zA-Z0-9_\-]+)+)\1/g;
  const used = new Map();
  for (const f of scanned) for (const m of stripComments(f.src).matchAll(CALL)) { if (!used.has(m[2])) used.set(m[2], f.rel); }

  it('is present in en.json and ar.json', () => {
    const missing = [...used.keys()].filter((k) => !(k in E) || !(k in A));
    assert.equal(missing.length, 0, `Used in code but missing from a dictionary: ${list(missing.map((k) => `${k} (${used.get(k)})`), 12)}`);
    assert.ok(used.size > 500, `expected to find the application's translation calls, found only ${used.size}`);
  });
});

describe('code: one translation mechanism', () => {
  it('nothing imports the removed helpers', () => {
    const bad = files.filter((f) => /from\s+['"]@\/lib\/i18n['"]|from\s+['"](?:next-i18next|react-i18next|i18next)['"]/.test(stripComments(f.src))).map((f) => f.rel);
    assert.equal(bad.length, 0, `Use useI18n() from @/components/i18n/I18nProvider instead: ${list(bad)}`);
    assert.ok(!fs.existsSync(path.join(SRC, 'lib/i18n.ts')), 'src/lib/i18n.ts was removed and must not come back');
  });
});
