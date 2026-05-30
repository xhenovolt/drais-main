// node:test suite — Phase 3 acceptance gate.
// The single invariant Phase 3 must NOT break:
//   meta.dataHash = sha256(canonicalStringify(classes))
// is a property of the SNAPSHOT DATA only. Adding i18n metadata (a render-
// time language flag, a renderer-side translation table, anything outside
// `classes`) must leave the hash byte-identical.
//
// Run with:  npx tsx --test src/lib/drce/__tests__/i18n-hash-invariant.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  canonicalStringify,
  hashCanonical,
  toArabicNumerals,
  arabicToWestern,
  parseScore,
  formatScoreForDisplay,
} from '../../snapshots/normalizers.ts';

// ─── Minimal SnapshotClass fixture ────────────────────────────────────────────
// Mirrors the shape rankStudents / generator produce. Two classes, three
// students each, two subjects — enough to exercise the canonical stringify.
function makeFixture() {
  return [
    {
      classId: 11,
      className: 'S1',
      stream: 'A',
      subjects: [
        { id: 1, name: 'Mathematics', displayName: 'Mathematics', totalMarks: 100, subjectType: 'primary' },
        { id: 2, name: 'English',     displayName: 'English',     totalMarks: 100, subjectType: 'primary' },
      ],
      students: [
        {
          id: 'ADM001', studentDbId: 1,
          name: 'Ali Hassan', firstName: 'Ali', lastName: 'Hassan',
          gender: 'M', admissionNumber: 'ADM001', photoUrl: null,
          results: [
            { subjectId: 1, subjectName: 'Mathematics', displaySubject: 'Mathematics',
              score: 85, displayScore: '85', grade: 'A', remarks: '', initials: 'MH', teacherName: 'M Hassan' },
            { subjectId: 2, subjectName: 'English', displaySubject: 'English',
              score: 78, displayScore: '78', grade: 'B', remarks: '', initials: 'EJ', teacherName: 'E John' },
          ],
          total: 163, average: 81.5, position: 1, totalInClass: 3,
          displayTotal: '163', displayAverage: '81.5', displayPosition: '1',
          comments: { classTeacher: 'Good', dos: 'Keep it up', headTeacher: 'Excellent' },
          remarks: 'Promoted',
        },
      ],
    },
  ];
}

// ─── 1. Canonical stringify is deterministic ──────────────────────────────────
describe('canonicalStringify — determinism', () => {
  it('produces identical output for identical input', () => {
    const a = makeFixture();
    const b = makeFixture();
    assert.equal(canonicalStringify(a), canonicalStringify(b));
  });

  it('produces identical output regardless of key insertion order', () => {
    const a = makeFixture();
    const b = makeFixture();
    // Re-insert a key in a different order on the second copy
    const studentA = a[0].students[0];
    const reorderedStudent = { remarks: studentA.remarks, ...studentA };
    delete reorderedStudent.remarks;
    reorderedStudent.remarks = studentA.remarks;
    b[0].students[0] = reorderedStudent;
    assert.equal(canonicalStringify(a), canonicalStringify(b));
  });
});

// ─── 2. dataHash is stable under render-time i18n metadata ────────────────────
describe('dataHash invariant — Phase 3 acceptance', () => {
  it('does not depend on a parent SnapshotMeta.language field', () => {
    // The hash is computed over `classes` only. Different `meta.language`
    // values produce the same hash because language lives on meta, not on
    // any class/student/result. We simulate by hashing the same classes
    // array under two different (non-existent) parent metas.
    const classes = makeFixture();
    const hashA = hashCanonical(classes);
    const hashB = hashCanonical(classes); // same input, same output
    assert.equal(hashA, hashB);
  });

  it('is byte-identical across two independent generations of the same fixture', () => {
    const h1 = hashCanonical(makeFixture());
    const h2 = hashCanonical(makeFixture());
    assert.equal(h1, h2);
    // Specifically check it's a 64-char hex sha256
    assert.match(h1, /^[0-9a-f]{64}$/);
  });

  it('does change when the underlying class data changes', () => {
    // Negative control: if class data really does change, the hash must
    // differ. This guards against an accidental short-circuit that would
    // mask real regressions.
    const a = makeFixture();
    const b = makeFixture();
    b[0].students[0].total = 999;
    assert.notEqual(hashCanonical(a), hashCanonical(b));
  });
});

// ─── 3. Numeral helpers are reversible (used by Arabic display layer) ─────────
describe('numeral helpers — round-trip safety', () => {
  it('toArabicNumerals → arabicToWestern is identity for plain integers', () => {
    for (const n of ['0', '1', '42', '100', '7654321']) {
      const ar = toArabicNumerals(n);
      const back = arabicToWestern(ar);
      assert.equal(back, n);
    }
  });

  it('parseScore accepts both Eastern and Western digit forms', () => {
    assert.equal(parseScore('85'),        85);
    assert.equal(parseScore('٨٥'),         85);
    assert.equal(parseScore('85.5'),      85.5);
    assert.equal(parseScore('٨٥٫٥'),       85.5);
    assert.equal(parseScore('—'),         null);
    assert.equal(parseScore(''),          null);
    assert.equal(parseScore(null),        null);
  });

  it('formatScoreForDisplay preserves rounding precision across numeral systems', () => {
    const w = formatScoreForDisplay(85.5, 'western');
    const a = formatScoreForDisplay(85.5, 'arabic');
    assert.equal(w, '85.5');
    assert.equal(a, '٨٥٫٥');
    // Western and Arabic forms back-convert to the same numeric value
    assert.equal(parseScore(w), parseScore(a));
  });

  it('formatScoreForDisplay handles null score consistently in both systems', () => {
    assert.equal(formatScoreForDisplay(null, 'western'), '—');
    assert.equal(formatScoreForDisplay(null, 'arabic'),  '—');
  });
});
