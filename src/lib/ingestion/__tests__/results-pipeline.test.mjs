// node:test — results pipeline pure helpers + exploder.
//
// Mirror-pattern from students-pipeline.test.mjs because
// pipelines/results.ts transitively imports @/lib/db (mysql2 → tls).
// Pure helpers + exploder are deterministic and DB-free — perfect for
// node:test coverage.
//
// Run: npx tsx --test src/lib/ingestion/__tests__/results-pipeline.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirrors of pure helpers in src/lib/ingestion/pipelines/results.ts ─────

function coerceString(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseScore(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  const head = s.replace(/^[^\d.\-]+/, '');
  const m = /^-?\d+(?:\.\d+)?/.exec(head);
  if (!m) return null;
  const n = Number.parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

function validateResultRow(mapped) {
  const adm = coerceString(mapped.admission_no);
  if (!adm) return { ok: false, error: 'admission_no is empty' };
  const subject = coerceString(mapped.subject_name);
  if (!subject) return { ok: false, error: 'subject_name is empty' };
  return {
    ok: true,
    value: {
      admission_no: adm,
      subject_name: subject,
      score:        parseScore(mapped.score),
      grade:        coerceString(mapped.grade),
      remarks:      coerceString(mapped.remarks),
      teacher_initials: coerceString(mapped.teacher_initials),
    },
  };
}

function resultIdentityFromRow(row) {
  return { admissionNo: row.admission_no, personRole: 'student' };
}

function explodeWideResultsRows({ wideRows, subjectHeaders }) {
  const out = [];
  for (const wide of wideRows) {
    for (const subj of subjectHeaders) {
      const cellValue = wide[subj];
      if (cellValue == null || cellValue === '') continue;
      out.push({
        __provenance: { ...wide.__provenance, sourceRowIndex: wide.__provenance.sourceRowIndex },
        admission_no: wide.admission_no ?? wide['admission_no'],
        subject_name: subj,
        score: cellValue,
        __sourceCell: { row: wide.__provenance.sourceRowIndex, column: subj },
      });
    }
  }
  return out;
}

// ─── parseScore ─────────────────────────────────────────────────────────────

describe('parseScore', () => {
  it('plain number passes through', () => {
    assert.equal(parseScore(85),     85);
    assert.equal(parseScore('85'),   85);
    assert.equal(parseScore('85.5'), 85.5);
  });

  it('strips % and text suffixes', () => {
    assert.equal(parseScore('85%'),       85);
    assert.equal(parseScore('85/100'),    85);
    assert.equal(parseScore('85 marks'),  85);
  });

  it('handles negative scores defensively (rare but possible for deductions)', () => {
    assert.equal(parseScore('-5'), -5);
  });

  it('empty → null', () => {
    assert.equal(parseScore(''),   null);
    assert.equal(parseScore(null), null);
    assert.equal(parseScore('  '), null);
  });

  it('rubbish strings → null', () => {
    assert.equal(parseScore('absent'), null);
    assert.equal(parseScore('-'),      null);
    assert.equal(parseScore('.'),      null);
  });
});

// ─── validateResultRow ──────────────────────────────────────────────────────

describe('validateResultRow', () => {
  it('happy path with numeric score', () => {
    const r = validateResultRow({
      admission_no: 'ADM/001',
      subject_name: 'Mathematics',
      score: 85,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.score, 85);
    assert.equal(r.value.subject_name, 'Mathematics');
  });

  it('happy path with string score that needs cleaning', () => {
    const r = validateResultRow({
      admission_no: 'ADM/001',
      subject_name: 'English',
      score: '78 / 100',
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.score, 78);
  });

  it('null score is legal (empty cell — commit will skip)', () => {
    const r = validateResultRow({
      admission_no: 'ADM/001',
      subject_name: 'History',
      score: null,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.score, null);
  });

  it('missing admission_no rejected', () => {
    const r = validateResultRow({ admission_no: '', subject_name: 'Math', score: 75 });
    assert.equal(r.ok, false);
  });

  it('missing subject_name rejected', () => {
    const r = validateResultRow({ admission_no: 'A', subject_name: '', score: 75 });
    assert.equal(r.ok, false);
  });

  it('optional grade/remarks/initials default to null', () => {
    const r = validateResultRow({
      admission_no: 'A', subject_name: 'Math', score: 75,
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.grade,            null);
    assert.equal(r.value.remarks,          null);
    assert.equal(r.value.teacher_initials, null);
  });

  it('preserves grade + remarks + initials when supplied', () => {
    const r = validateResultRow({
      admission_no: 'A', subject_name: 'Math', score: 92,
      grade: 'A',  remarks: 'Excellent work', teacher_initials: 'MK',
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.grade,            'A');
    assert.equal(r.value.remarks,          'Excellent work');
    assert.equal(r.value.teacher_initials, 'MK');
  });
});

// ─── resultIdentityFromRow ──────────────────────────────────────────────────

describe('resultIdentityFromRow', () => {
  it('extracts admission_no and personRole only — names not needed for results', () => {
    const claim = resultIdentityFromRow({
      admission_no: 'ADM/001', subject_name: 'Math', score: 85,
    });
    assert.equal(claim.admissionNo, 'ADM/001');
    assert.equal(claim.personRole,  'student');
    assert.equal(claim.firstName,   undefined);
    assert.equal(claim.lastName,    undefined);
  });
});

// ─── explodeWideResultsRows — wide CSV → narrow rows ───────────────────────

describe('explodeWideResultsRows', () => {
  const PROV = { sourceRowIndex: 2, sourceFile: 'marks.xlsx' };

  it('one wide row × N subject cols → N narrow rows', () => {
    const exploded = explodeWideResultsRows({
      wideRows: [
        { admission_no: 'A001', Math: 75, English: 82, Science: 91, __provenance: PROV },
      ],
      subjectHeaders: ['Math', 'English', 'Science'],
    });
    assert.equal(exploded.length, 3);
    assert.deepEqual(exploded.map(e => e.subject_name).sort(), ['English', 'Math', 'Science']);
    assert.deepEqual(exploded.map(e => e.score).sort(), [75, 82, 91]);
  });

  it('empty cells are skipped at explosion (no null INSERTs downstream)', () => {
    const exploded = explodeWideResultsRows({
      wideRows: [
        { admission_no: 'A001', Math: 75, English: '', Science: null, __provenance: PROV },
      ],
      subjectHeaders: ['Math', 'English', 'Science'],
    });
    assert.equal(exploded.length, 1);
    assert.equal(exploded[0].subject_name, 'Math');
  });

  it('provenance preserved on every exploded row + cell pointer added', () => {
    const exploded = explodeWideResultsRows({
      wideRows: [
        { admission_no: 'A001', Math: 75, English: 82, __provenance: PROV },
      ],
      subjectHeaders: ['Math', 'English'],
    });
    for (const e of exploded) {
      assert.equal(e.__provenance.sourceRowIndex, 2);
      assert.equal(e.__provenance.sourceFile, 'marks.xlsx');
      assert.equal(e.__sourceCell.row, 2);
      assert.ok(['Math', 'English'].includes(e.__sourceCell.column));
    }
  });

  it('multiple wide rows produce a stable shape', () => {
    const exploded = explodeWideResultsRows({
      wideRows: [
        { admission_no: 'A001', Math: 75, English: 82, __provenance: { ...PROV, sourceRowIndex: 2 } },
        { admission_no: 'A002', Math: 90, English: 88, __provenance: { ...PROV, sourceRowIndex: 3 } },
      ],
      subjectHeaders: ['Math', 'English'],
    });
    assert.equal(exploded.length, 4);
    assert.deepEqual(
      exploded.map(e => ({ adm: e.admission_no, subj: e.subject_name, sc: e.score })),
      [
        { adm: 'A001', subj: 'Math',    sc: 75 },
        { adm: 'A001', subj: 'English', sc: 82 },
        { adm: 'A002', subj: 'Math',    sc: 90 },
        { adm: 'A002', subj: 'English', sc: 88 },
      ],
    );
  });

  it('no subject headers → empty output (graceful, no crash)', () => {
    const exploded = explodeWideResultsRows({
      wideRows: [{ admission_no: 'A001', __provenance: PROV }],
      subjectHeaders: [],
    });
    assert.equal(exploded.length, 0);
  });
});

describe('Phase 0 regression: silent-skip-on-empty is now visible', () => {
  it('exploder + validator together produce ZERO orphans for empty cells (deliberate)', () => {
    // Empty cells are skipped at explosion — they never reach validation.
    // This is the chosen design: an empty marks cell means "no exam
    // happened" which is NOT a data error and shouldn't pollute the
    // orphan queue. Real errors (missing student, missing subject)
    // still surface as orphans elsewhere.
    const exploded = explodeWideResultsRows({
      wideRows: [{ admission_no: 'A001', Math: '', English: '', __provenance: { sourceRowIndex: 2, sourceFile: 'f' } }],
      subjectHeaders: ['Math', 'English'],
    });
    assert.equal(exploded.length, 0);
  });
});
