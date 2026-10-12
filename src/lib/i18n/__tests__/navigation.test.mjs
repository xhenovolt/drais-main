/**
 * Sidebar labels: every label written as a literal in navigationConfig.tsx must have an Arabic entry
 * in its LABEL_AR table, and every label that goes through the dictionary must exist there in both
 * languages. Otherwise the item stays English when the interface is set to Arabic.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flattenKeys } from '../core.ts';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const nav = fs.readFileSync(path.join(SRC, 'lib/navigationConfig.tsx'), 'utf8');
const en = flattenKeys(JSON.parse(fs.readFileSync(path.join(SRC, 'locales/en.json'), 'utf8')));
const ar = flattenKeys(JSON.parse(fs.readFileSync(path.join(SRC, 'locales/ar.json'), 'utf8')));

const table = nav.slice(nav.indexOf('const LABEL_AR'), nav.indexOf('function translateMenuTree'));
const menu = nav.slice(nav.indexOf('export function getNavigationItems'));
const tableKeys = new Set([...table.matchAll(/^\s*(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)")\s*:/gm)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")));
const literalLabels = [...new Set([...menu.matchAll(/label:\s*(?:'((?:[^'\\]|\\.)+)'|"((?:[^"\\]|\\.)+)")/g)].map((m) => (m[1] ?? m[2]).replace(/\\'/g, "'")))];
const keyedLabels = [...new Set([...menu.matchAll(/label:\s*t\(\s*'([^']+)'/g)].map((m) => m[1]))];

describe('sidebar labels', () => {
  it('finds the menu', () => {
    assert.ok(literalLabels.length > 100, `expected the literal menu labels, found ${literalLabels.length}`);
    assert.ok(tableKeys.size > 100, `expected the LABEL_AR table, found ${tableKeys.size} entries`);
  });
  it('every literal label has an Arabic entry in LABEL_AR', () => {
    const missing = literalLabels.filter((l) => !tableKeys.has(l));
    assert.equal(missing.length, 0, `No Arabic for menu label(s): ${missing.join(' | ')}`);
  });
  it('every LABEL_AR value is Arabic', () => {
    const bad = [...table.matchAll(/:\s*'((?:[^'\\]|\\.)*)',?\s*$/gm)].map((m) => m[1]).filter((v) => !/[؀-ۿ]/.test(v));
    assert.equal(bad.length, 0, `LABEL_AR values without Arabic text: ${bad.join(' | ')}`);
  });
  it('every label that uses a dictionary key has that key in both languages', () => {
    const missing = keyedLabels.filter((k) => !(k in en) || !(k in ar));
    assert.equal(missing.length, 0, `Menu keys missing from a dictionary: ${missing.join(', ')}`);
  });
});
