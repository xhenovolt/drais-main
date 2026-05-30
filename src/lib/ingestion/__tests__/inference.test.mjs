// node:test suite — schema inference (Phase 1.3).
// Run with: npx tsx --test src/lib/ingestion/__tests__/inference.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { inferSchema, applyMapping } from '../schema-inference/index.ts';
import { combinedScore, normalizeHeader, tokenSetScore, levenshteinRatio } from '../schema-inference/fuzzy.ts';

const STUDENT_FIELDS = [
  { name: 'admission_no', label: 'Admission Number', synonyms: ['admission no', 'adm no', 'reg no', 'registration number', 'stamp no'], type: 'string', required: true },
  { name: 'first_name',   label: 'First Name',       synonyms: ['firstname', 'given name'],                              type: 'string', required: true },
  { name: 'last_name',    label: 'Last Name',        synonyms: ['lastname', 'surname', 'family name'],                   type: 'string', required: true },
  { name: 'gender',       label: 'Gender',           synonyms: ['sex'],                                                  type: 'enum',   enumValues: ['male','female'] },
  { name: 'class_name',   label: 'Class',            synonyms: ['class name', 'grade', 'form'],                          type: 'string' },
];

describe('fuzzy primitives', () => {
  it('normalizeHeader strips punctuation + collapses whitespace', () => {
    assert.equal(normalizeHeader('  First_Name  '),   'first name');
    assert.equal(normalizeHeader('Adm. No.'),         'adm no');
    assert.equal(normalizeHeader('REG/NUMBER!!!'),    'reg number');
  });

  it('tokenSetScore is order-independent', () => {
    assert.equal(tokenSetScore('First Name', 'Name First'), 1);
    assert.equal(tokenSetScore('Student Number', 'Number Student'), 1);
  });

  it('levenshteinRatio catches typos', () => {
    const r = levenshteinRatio('admission number', 'admision numer');
    assert.ok(r > 0.85, `expected high ratio for typo, got ${r}`);
  });

  it('combinedScore takes the larger of the two', () => {
    assert.equal(combinedScore('Name First', 'First Name'), 1); // token-set wins
    const typo = combinedScore('admission number', 'admision numer');
    assert.ok(typo > 0.85);
  });
});

describe('inferSchema — exact, normalized, synonym hits', () => {
  it('exact name match → confidence 1', () => {
    const r = inferSchema(['admission_no'], STUDENT_FIELDS);
    const m = r.mappings[0];
    assert.equal(m.canonicalField, 'admission_no');
    assert.equal(m.confidence, 1);
    assert.equal(m.reason, 'exact');
  });

  it('label match → confidence 0.95, reason normalized', () => {
    const r = inferSchema(['Admission Number'], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, 'admission_no');
    assert.equal(r.mappings[0].reason, 'normalized');
  });

  it('synonym match → confidence 0.95, reason synonym', () => {
    const r = inferSchema(['Reg No'], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, 'admission_no');
    assert.equal(r.mappings[0].reason, 'synonym');
  });

  it('case + punctuation insensitive', () => {
    // normalize('first_name') == 'first name' == normalize('FIRST   NAME'),
    // so the engine hits the exact-NAME match first (because the field's
    // .name is 'first_name'). That's correct — 'exact' here just means
    // "post-normalisation, the header matches the canonical field name".
    const r = inferSchema(['  FIRST   NAME  '], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, 'first_name');
    assert.equal(r.mappings[0].reason, 'exact');
    assert.equal(r.mappings[0].confidence, 1);
  });
});

describe('inferSchema — fuzzy fallback', () => {
  it('catches a single-letter typo', () => {
    const r = inferSchema(['Admision Number'], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, 'admission_no');
    assert.equal(r.mappings[0].reason, 'fuzzy');
    assert.ok(r.mappings[0].confidence >= 0.65);
  });

  it('refuses to guess when two fields tie within the margin', () => {
    // 'Name' is equidistant between first_name and last_name.
    const r = inferSchema(['Name'], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, null);
    assert.equal(r.mappings[0].reason, 'unmapped');
  });

  it('refuses to match nonsense', () => {
    const r = inferSchema(['xyzqq'], STUDENT_FIELDS);
    assert.equal(r.mappings[0].canonicalField, null);
    assert.equal(r.mappings[0].reason, 'unmapped');
  });
});

describe('inferSchema — memory priority', () => {
  it('memory mapping wins over all other signals', () => {
    // Memory says "Stamp No" → admission_no. Without memory, would be a synonym hit.
    // We test it sticks AND wins even when the header is weird.
    const r = inferSchema(['Custom Header X'], STUDENT_FIELDS, {
      memory: { 'Custom Header X': 'admission_no' },
    });
    assert.equal(r.mappings[0].canonicalField, 'admission_no');
    assert.equal(r.mappings[0].reason, 'memory');
    assert.equal(r.mappings[0].confidence, 1);
  });

  it('memory pointing at a non-existent field is ignored', () => {
    const r = inferSchema(['admission_no'], STUDENT_FIELDS, {
      memory: { 'admission_no': 'totally_fake_field' },
    });
    // Memory miss → falls back to exact match.
    assert.equal(r.mappings[0].canonicalField, 'admission_no');
    assert.equal(r.mappings[0].reason, 'exact');
  });
});

describe('inferSchema — required-field guard', () => {
  it('blocks when a required field has no mapping', () => {
    const r = inferSchema(['Gender', 'Class'], STUDENT_FIELDS); // missing admission_no, first_name, last_name
    assert.deepEqual(r.unresolvedRequired.sort(), ['admission_no','first_name','last_name'].sort());
    assert.equal(r.overallConfidence, 0);
  });

  it('overallConfidence = lowest mapped-required confidence when all required map', () => {
    // admission_no resolves via fuzzy (≈0.85+), first_name + last_name resolve exact.
    const r = inferSchema(['Admision Num', 'first_name', 'last_name'], STUDENT_FIELDS);
    assert.deepEqual(r.unresolvedRequired, []);
    assert.ok(r.overallConfidence < 1, 'fuzzy should drag down overall');
    assert.ok(r.overallConfidence >= 0.65);
  });
});

describe('applyMapping', () => {
  it('produces a canonical-keyed object from a raw row', () => {
    const r = inferSchema(['Admission Number', 'First Name', 'Last Name', 'Class'], STUDENT_FIELDS);
    const row = { 'Admission Number': '001', 'First Name': 'Ali', 'Last Name': 'Hassan', 'Class': 'S1' };
    const mapped = applyMapping(row, r.mappings);
    assert.deepEqual(mapped, {
      admission_no: '001', first_name: 'Ali', last_name: 'Hassan', class_name: 'S1',
    });
  });

  it('drops unmapped source columns', () => {
    const r = inferSchema(['Admission Number', 'Some Random Col'], STUDENT_FIELDS);
    const row = { 'Admission Number': '001', 'Some Random Col': 'noise' };
    const mapped = applyMapping(row, r.mappings);
    assert.equal(mapped['admission_no'], '001');
    assert.equal(mapped['Some Random Col'], undefined);
  });
});
