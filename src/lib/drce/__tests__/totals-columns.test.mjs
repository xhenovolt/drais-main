// Regression test for the DRCE totals "blank value" bug (Report Engine Hardening
// P-A). Mark columns named eot/bot/exam/marks must be summed and displayed even
// though their id/header doesn't contain "score"/"total".
//
// Run with:  npx tsx --test src/lib/drce/__tests__/totals-columns.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { detectNumericColumnIds, buildTotalsRowCellContent } from '../totalsCalculator.ts';

const ctx = {}; // result.* bindings resolve from the row, so ctx can be empty
const results = [
  { subjectName: 'Mathematics', bot: 80, eot: 90, grade: 'D1' },
  { subjectName: 'English',     bot: 55, eot: 60, grade: 'C3' },
  { subjectName: 'Science',     bot: 40, eot: 50, grade: 'C4' },
];
const columns = [
  { id: 'subj',  binding: 'result.subjectName', header: 'Subject' },
  { id: 'bot',   binding: 'result.bot',         header: 'BOT' },
  { id: 'eot',   binding: 'result.eot',         header: 'EOT' },
  { id: 'grade', binding: 'result.grade',       header: 'Grade' },
];

describe('detectNumericColumnIds', () => {
  it('detects mark columns by data, ignoring subject/grade columns', () => {
    const ids = detectNumericColumnIds(columns, results, ctx).sort();
    assert.deepEqual(ids, ['bot', 'eot']);
  });

  it('excludes a column whose values are not all numeric', () => {
    const mixed = [{ x: 10 }, { x: 'absent' }];
    const cols = [{ id: 'x', binding: 'result.x', header: 'X' }];
    assert.deepEqual(detectNumericColumnIds(cols, mixed, ctx), []);
  });
});

describe('buildTotalsRowCellContent', () => {
  const totals = { bot: 175, eot: 200 };

  it('shows the sum for a BOT column when it is in the summable set', () => {
    const cell = buildTotalsRowCellContent({
      column: columns[1], // bot — header "BOT" never matched the old heuristic
      totals,
      summableColumnIds: ['bot', 'eot'],
      totalObtained: 375, totalPossible: 600, percentage: 62.5, averageScore: 62.5,
    });
    assert.equal(cell, '175');
  });

  it('reproduces the OLD bug: with no summable set, BOT renders blank', () => {
    const cell = buildTotalsRowCellContent({
      column: columns[1], // bot — legacy header guess only knew score/mark/total/eot
      totals,
      totalObtained: 375, totalPossible: 600, percentage: 62.5, averageScore: 62.5,
    });
    assert.equal(cell, ''); // this is exactly the symptom the fix removes
  });
});
