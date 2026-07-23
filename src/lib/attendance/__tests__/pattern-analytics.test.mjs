// Attendance Pattern Analytics — pure trend + anomaly detectors.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { trend, analyzeSeries, analyzeGroups, mean, stddev } from '@/lib/attendance/pattern-analytics';

const day = (date, present, late, absent) => ({ date, present, late, absent, total: present + late + absent });
// A steady baseline: 90 present / 5 late / 5 absent out of 100.
const steady = (n) => Array.from({ length: n }, (_, i) => day(`2026-07-${String(i + 1).padStart(2, '0')}`, 90, 5, 5));

const keys = (alerts) => alerts.map(a => a.key);

describe('stats + trend', () => {
  it('mean/stddev', () => {
    assert.equal(mean([2, 4, 6]), 4);
    assert.equal(Math.round(stddev([2, 4, 6]) * 100) / 100, 1.63);
  });
  it('trend needs 4+ points', () => {
    assert.equal(trend([1, 2, 3]).direction, 'stable');
  });
  it('declining series detected', () => {
    assert.equal(trend([100, 100, 80, 60]).direction, 'declining');
  });
  it('improving series detected', () => {
    assert.equal(trend([60, 60, 80, 100]).direction, 'improving');
  });
  it('flat series is stable', () => {
    assert.equal(trend([90, 91, 89, 90, 90]).direction, 'stable');
  });
});

describe('analyzeSeries — whole school', () => {
  it('steady school → no alerts', () => {
    assert.deepEqual(analyzeSeries(steady(10)), []);
  });

  it('declining present rate → attendance_decline', () => {
    const days = [...steady(4), day('a', 70, 10, 20), day('b', 60, 10, 30), day('c', 55, 10, 35), day('d', 50, 10, 40)];
    assert.ok(keys(analyzeSeries(days)).includes('attendance_decline'));
  });

  it('mass absence today → alert', () => {
    const days = [...steady(6), day('today', 40, 5, 55)];
    const a = analyzeSeries(days).find(x => x.key === 'mass_absence');
    assert.ok(a);
    assert.equal(a.level, 'alert');
  });

  it('lateness spike today → watch', () => {
    const days = [...steady(6), day('today', 55, 40, 5)];
    assert.ok(keys(analyzeSeries(days)).includes('lateness_spike'));
  });

  it('too few days → no alerts', () => {
    assert.deepEqual(analyzeSeries(steady(3)), []);
  });

  it('a single normal day does not trip mass absence', () => {
    const days = [...steady(6), day('today', 88, 6, 6)];
    assert.ok(!keys(analyzeSeries(days)).includes('mass_absence'));
  });
});

describe('analyzeGroups — class/department drift', () => {
  it('a class far below the school is flagged', () => {
    const groups = [
      { name: 'P1', present: 95, late: 3, absent: 2, total: 100 },
      { name: 'P2', present: 93, late: 4, absent: 3, total: 100 },
      { name: 'P3', present: 55, late: 5, absent: 40, total: 100 }, // clear outlier
    ];
    const a = analyzeGroups(groups, 'class');
    assert.ok(a.some(x => x.key.includes('P3')));
    assert.ok(!a.some(x => x.key.includes('P1')));
  });

  it('tiny groups (<5) are ignored', () => {
    const groups = [
      { name: 'A', present: 90, late: 5, absent: 5, total: 100 },
      { name: 'B', present: 1, late: 0, absent: 3, total: 4 },
    ];
    assert.deepEqual(analyzeGroups(groups, 'class'), []);
  });

  it('uniform groups → no alerts', () => {
    const groups = [
      { name: 'A', present: 90, late: 5, absent: 5, total: 100 },
      { name: 'B', present: 91, late: 4, absent: 5, total: 100 },
    ];
    assert.deepEqual(analyzeGroups(groups, 'department'), []);
  });
});
