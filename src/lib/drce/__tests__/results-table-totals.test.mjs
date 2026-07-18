import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateColumnTotals, buildTotalsRowCellContent } from '../totalsCalculator.ts';

function makeContext() {
  return {
    student: { fullName: 'Jane Doe' },
    results: [],
    subjects: [],
    assessment: {},
    comments: {},
    meta: { schoolName: 'Test School', reportTitle: 'Report' },
  };
}

test('calculateColumnTotals uses the column bindings supplied by the table section', () => {
  const ctx = makeContext();
  const columns = [
    { id: 'subject', binding: 'result.subjectName' },
    { id: 'total', binding: 'result.total' },
    { id: 'mid', binding: 'result.midTermScore' },
  ];
  const rows = [
    { subjectName: 'Math', total: 70, midTermScore: 40 },
    { subjectName: 'English', total: 30, midTermScore: 10 },
  ];

  const totals = calculateColumnTotals(rows, columns, ctx);

  assert.deepEqual(totals, {
    subject: 0,
    total: 100,
    mid: 50,
  });
});

test('buildTotalsRowCellContent renders the summed score for numeric columns', () => {
  const content = buildTotalsRowCellContent({
    column: { id: 'total', header: 'TOTAL', binding: 'result.total', visible: true, order: 1, align: 'center' },
    totals: { total: 100 },
    totalsConfig: { enabled: true, labelText: 'TOTAL', showTotalObtained: true, showTotalPossible: true, showPercentage: true, showAverage: true, showGrandGrade: true, sumColumnIds: ['total'] },
    totalObtained: 100,
    totalPossible: 200,
    percentage: 50,
    averageScore: 50,
    language: 'en',
  });

  assert.equal(content, '100');
});
