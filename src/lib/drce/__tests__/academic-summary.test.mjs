// Phase I regression test — the consolidated academic-standing summary
// (Total / % / Average / Aggregate / Division / Position) shown under the
// results table. Values must come from live data, never be hardcoded, and
// each line must be independently toggleable.
//
// Run with:  npx tsx --test src/lib/drce/__tests__/academic-summary.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAcademicSummaryItems } from '../totalsCalculator.ts';

const values = {
  totalObtained: 685, totalPossible: 800, percentage: 85.6,
  averageScore: 68.5, aggregate: 10, division: 'I', position: '3 / 42',
};

describe('buildAcademicSummaryItems', () => {
  it('emits the default line set (total, %, average, aggregate, division)', () => {
    const items = buildAcademicSummaryItems(undefined, values, 'en');
    const keys = items.map(i => i.key);
    assert.deepEqual(keys, ['total', 'percentage', 'average', 'aggregate', 'division']);
    assert.equal(items.find(i => i.key === 'total').value, '685');
    assert.equal(items.find(i => i.key === 'percentage').value, '85.6%');
    assert.equal(items.find(i => i.key === 'division').value, 'I');
  });

  it('shows "obtained / possible" when showTotalPossible is on', () => {
    const items = buildAcademicSummaryItems({ showTotalPossible: true }, values, 'en');
    assert.equal(items.find(i => i.key === 'total').value, '685 / 800');
  });

  it('omits aggregate/division/position when no value is present (e.g. nursery)', () => {
    const items = buildAcademicSummaryItems(undefined, { ...values, aggregate: null, division: null, position: null }, 'en');
    assert.deepEqual(items.map(i => i.key), ['total', 'percentage', 'average']);
  });

  it('respects an explicit per-item toggle', () => {
    const items = buildAcademicSummaryItems({ showPercentage: false, showPosition: true }, values, 'en');
    assert.ok(!items.some(i => i.key === 'percentage'));
    assert.ok(items.some(i => i.key === 'position'));
  });

  it('honours label overrides and Arabic defaults', () => {
    const custom = buildAcademicSummaryItems({ labels: { division: 'Grade Band' } }, values, 'en');
    assert.equal(custom.find(i => i.key === 'division').label, 'Grade Band');

    const arabic = buildAcademicSummaryItems(undefined, values, 'ar');
    assert.equal(arabic.find(i => i.key === 'division').label, 'الشعبة');
  });
});
