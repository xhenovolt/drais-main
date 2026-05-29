// node:test suite for the formula evaluator.
// Run with:  npx tsx --test src/lib/drce/__tests__/formula.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateFormula } from '../table/formula.ts';

// Helper — build a FormulaContext from a 2-D matrix of values.
// columns[i] is the column id for column index i; rows[j] is the row key for row j.
function ctx(matrix) {
  const columns = matrix[0].map((_, i) => `col${i}`);
  const rows    = matrix.map((_, j)    => `r${j}`);
  const cellValues = {};
  for (let i = 0; i < columns.length; i++) {
    cellValues[columns[i]] = {};
    for (let j = 0; j < rows.length; j++) cellValues[columns[i]][rows[j]] = matrix[j][i];
  }
  return {
    cellValues, columnIds: columns, rowKeys: rows,
    currentCol: columns[0], currentRow: rows[0],
    dataCtx: {
      student: { fullName: '', firstName: '', lastName: '', gender: '', className: '',
        streamName: '', admissionNo: '', photoUrl: null, dateOfBirth: null, custom: {} },
      results: [], subjects: [],
      assessment: { classPosition: null, streamPosition: null, aggregates: null, division: null, totalStudents: null },
      comments: { classTeacher: '', dos: '', headTeacher: '' },
      meta: { schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '',
        centerNo: '', registrationNo: '', term: '', year: '', reportTitle: '', nextTermBegins: '' },
      language: 'en',
    },
  };
}

describe('formula — basic aggregators', () => {
  const c = ctx([[10, 20], [30, 40], [50, 60]]);
  it('SUM over a range', () => {
    const r = evaluateFormula('SUM(A1:A3)', c);
    assert.equal(r.ok, true); assert.equal(r.value, 90);
  });
  it('AVG over a range', () => {
    const r = evaluateFormula('AVG(A1:A3)', c);
    assert.equal(r.ok, true); assert.equal(r.value, 30);
  });
  it('MIN / MAX', () => {
    assert.equal(evaluateFormula('MIN(A1:A3)', c).value, 10);
    assert.equal(evaluateFormula('MAX(B1:B3)', c).value, 60);
  });
  it('COUNT counts cell refs, not just non-null', () => {
    assert.equal(evaluateFormula('COUNT(A1:B3)', c).value, 6);
  });
});

describe('formula — nested expressions (M1)', () => {
  const c = ctx([[5], [-2], [8]]);
  it('SUM(IF(...), IF(...)) parses (no early )-match)', () => {
    const r = evaluateFormula('IF(A1 > 0, A1, 0) + IF(A2 > 0, A2, 0) + IF(A3 > 0, A3, 0)', c);
    assert.equal(r.ok, true); assert.equal(r.value, 13);
  });
  it('Nested aggregator inside arithmetic', () => {
    const r = evaluateFormula('SUM(A1:A3) * 2', c);
    assert.equal(r.ok, true); assert.equal(r.value, 22);
  });
});

describe('formula — local cell refs inside IF (M5)', () => {
  const c = ctx([[55], [48], [72]]);
  it('IF sees A1 from the local table, not just bindings', () => {
    const r = evaluateFormula('IF(A1 >= 50, "Pass", "Fail")', c);
    assert.equal(r.ok, true); assert.equal(r.value, 'Pass');
  });
  it('threshold returns Fail branch', () => {
    const local = { ...c, currentRow: 'r1' };  // make A2 the row of interest? actually unused
    const r = evaluateFormula('IF(A2 >= 50, "Pass", "Fail")', local);
    assert.equal(r.value, 'Fail');
  });
});

describe('formula — operators + concatenation', () => {
  const c = ctx([[7]]);
  it('A1 + 3 = 10', () => {
    assert.equal(evaluateFormula('A1 + 3', c).value, 10);
  });
  it('A1 * 0.1 keeps decimals (IEEE-754 tolerant)', () => {
    const v = evaluateFormula('A1 * 0.1', c).value;
    assert.ok(typeof v === 'number' && Math.abs(v - 0.7) < 1e-9, `got ${v}`);
  });
  it('A1 = 7 returns boolean true', () => {
    const r = evaluateFormula('A1 = 7', c);
    assert.equal(r.value, true);
  });
  it('& concatenates strings', () => {
    assert.equal(evaluateFormula('A1 & " pts"', c).value, '7 pts');
  });
});

describe('formula — error states (M2)', () => {
  const c = ctx([[1, 2]]);
  it('unknown function returns #NAME?', () => {
    const r = evaluateFormula('FROBNICATE(A1)', c);
    assert.equal(r.ok, false); assert.equal(r.error.code, '#NAME?');
  });
  it('division by zero returns #DIV/0!', () => {
    const r = evaluateFormula('A1 / 0', c);
    assert.equal(r.ok, false); assert.equal(r.error.code, '#DIV/0!');
  });
  it('out-of-range cell ref returns #REF! (M4)', () => {
    const r = evaluateFormula('Z99', c);
    assert.equal(r.ok, false); assert.equal(r.error.code, '#REF!');
  });
  it('mismatched parens returns #ERROR!', () => {
    const r = evaluateFormula('SUM(A1', c);
    assert.equal(r.ok, false); assert.equal(r.error.code, '#ERROR!');
  });
});

describe('formula — ROUND / CONCAT / IFERROR / MEDIAN / STDEV / RANK', () => {
  const c = ctx([[3.14159], [10], [20], [30]]);
  it('ROUND with 0 decimals', () => {
    assert.equal(evaluateFormula('ROUND(A1)', c).value, 3);
  });
  it('ROUND with 2 decimals', () => {
    assert.equal(evaluateFormula('ROUND(A1, 2)', c).value, 3.14);
  });
  it('CONCAT joins values', () => {
    assert.equal(evaluateFormula('CONCAT("[", A2, ",", A3, "]")', c).value, '[10,20]');
  });
  it('IFERROR returns fallback on bad first arg', () => {
    assert.equal(evaluateFormula('IFERROR(A2 / 0, "n/a")', c).value, 'n/a');
  });
  it('IFERROR passes through good first arg', () => {
    assert.equal(evaluateFormula('IFERROR(A2 + A3, "n/a")', c).value, 30);
  });
  it('MEDIAN over a range', () => {
    assert.equal(evaluateFormula('MEDIAN(A2:A4)', c).value, 20);
  });
  it('STDEV needs ≥ 2 values', () => {
    const single = ctx([[5]]);
    assert.equal(evaluateFormula('STDEV(A1)', single).value, null);
    const r = evaluateFormula('STDEV(A2:A4)', c);
    assert.equal(typeof r.value, 'number');
  });
  it('RANK gives 1 for max value descending', () => {
    assert.equal(evaluateFormula('RANK(A4, A2:A4)', c).value, 1);
    assert.equal(evaluateFormula('RANK(A2, A2:A4)', c).value, 3);
  });
});

describe('formula — this.column / this.row', () => {
  const c = { ...ctx([[10], [20], [30]]), currentCol: 'col0', currentRow: 'r1' };
  it('SUM(this.column) sums all rows in current column', () => {
    assert.equal(evaluateFormula('SUM(this.column)', c).value, 60);
  });
});
