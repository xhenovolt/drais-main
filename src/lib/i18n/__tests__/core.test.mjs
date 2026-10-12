import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { translate, interpolate, selectPlural, isPluralEntry, resolveKey, flattenKeys, placeholdersOf } from '../core.ts';
import { formatDate, formatNumber, formatMoney, formatPercent, localeFor } from '../format.ts';

const dict = {
  common: { save: 'Save', pageOf: 'Page {{current}} of {{total}}' },
  students: {
    selected: { one: '{{count}} learner selected', other: '{{count}} learners selected' },
  },
};
const arDict = {
  students: {
    selected: { zero: 'لا أحد', one: 'متعلم واحد', two: 'متعلمان', few: '{{count}} متعلمين', many: '{{count}} متعلمًا', other: '{{count}} متعلم' },
  },
};

describe('translate', () => {
  it('resolves a dotted key and fills placeholders', () => {
    assert.equal(translate(dict, 'en', 'common.save'), 'Save');
    assert.equal(translate(dict, 'en', 'common.pageOf', { current: 2, total: 9 }), 'Page 2 of 9');
  });
  it('a missing key returns the fallback, else the key, and reports it', () => {
    const seen = [];
    assert.equal(translate(dict, 'en', 'nope.key', undefined, 'Fallback', (k) => seen.push(k)), 'Fallback');
    assert.equal(translate(dict, 'en', 'nope.key'), 'nope.key');
    assert.deepEqual(seen, ['nope.key']);
  });
  it('a group that is not a plural entry is treated as missing, never rendered as [object Object]', () => {
    assert.equal(translate(dict, 'en', 'common', undefined, 'x'), 'x');
  });
  it('leaves an unknown placeholder visible instead of printing "undefined"', () => {
    assert.equal(interpolate('Hi {{name}}', {}), 'Hi {{name}}');
    assert.equal(interpolate('{{ n }} of {{n}}', { n: 3 }), '3 of 3');
  });
});

describe('plurals', () => {
  it('English picks one / other', () => {
    assert.equal(translate(dict, 'en', 'students.selected', { count: 1 }), '1 learner selected');
    assert.equal(translate(dict, 'en', 'students.selected', { count: 0 }), '0 learners selected');
    assert.equal(translate(dict, 'en', 'students.selected', { count: 12 }), '12 learners selected');
  });
  it('Arabic uses all six forms', () => {
    const t = (count) => translate(arDict, 'ar', 'students.selected', { count });
    assert.equal(t(0), 'لا أحد');
    assert.equal(t(1), 'متعلم واحد');
    assert.equal(t(2), 'متعلمان');
    assert.equal(t(5), '5 متعلمين');
    assert.equal(t(11), '11 متعلمًا');
    assert.equal(t(100), '100 متعلم');
  });
  it('falls back to "other" when a form is not supplied', () => {
    assert.equal(selectPlural({ other: 'x' }, 2, 'ar'), 'x');
  });
  it('recognises a plural entry only when every key is a plural category and "other" exists', () => {
    assert.equal(isPluralEntry({ one: 'a', other: 'b' }), true);
    assert.equal(isPluralEntry({ one: 'a' }), false);
    assert.equal(isPluralEntry({ title: 'a', other: 'b' }), false);
    assert.equal(isPluralEntry('text'), false);
  });
});

describe('dictionary helpers', () => {
  it('resolveKey never throws on a path through text', () => {
    assert.equal(resolveKey(dict, 'common.save.deeper'), undefined);
    assert.equal(resolveKey(dict, null), undefined);
  });
  it('flattenKeys counts a plural entry as one key', () => {
    assert.deepEqual(Object.keys(flattenKeys(dict)), ['common.save', 'common.pageOf', 'students.selected']);
  });
  it('placeholdersOf covers every form of a plural entry', () => {
    assert.deepEqual(placeholdersOf(dict.students.selected), ['count']);
    assert.deepEqual(placeholdersOf('a {{b}} {{a}}'), ['a', 'b']);
  });
});

describe('formatting', () => {
  const day = new Date(Date.UTC(2026, 9, 12, 5, 18));
  it('Arabic keeps Western digits and the Gregorian calendar', () => {
    assert.equal(localeFor('ar'), 'ar-u-nu-latn-ca-gregory');
    const out = formatDate(day, 'ar', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' });
    assert.match(out, /12/); assert.match(out, /2026/);
    assert.doesNotMatch(out, /[٠-٩]/, 'no Arabic-Indic digits');
    assert.match(out, /[؀-ۿ]/, 'month name is Arabic');
  });
  it('English dates are day-first', () => {
    assert.equal(formatDate(day, 'en', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' }), '12 Oct 2026');
  });
  it('a missing or invalid date shows a dash, never "Invalid Date"', () => {
    assert.equal(formatDate(null, 'en'), '—');
    assert.equal(formatDate('not a date', 'ar'), '—');
    assert.equal(formatDate('', 'en', 'short', ''), '');
  });
  it('numbers are grouped, with Western digits in both languages', () => {
    assert.equal(formatNumber(1234567, 'en'), '1,234,567');
    assert.equal(formatNumber(1234567, 'ar'), '1,234,567');
    assert.equal(formatNumber('abc', 'en'), '—');
  });
  it('money keeps the currency code in Latin letters', () => {
    assert.equal(formatMoney(30000, 'en'), 'UGX 30,000');
    assert.equal(formatMoney(30000, 'ar').replace(/[⁦⁩]/g, ''), '30,000 UGX');
    assert.equal(formatMoney(null, 'ar'), '—');
  });
  it('percentages', () => {
    assert.equal(formatPercent(0.424, 'en', true), '42%');
    assert.equal(formatPercent(42, 'ar'), '42%');
  });
});
