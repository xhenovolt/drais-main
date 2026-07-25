// Platform Health Center — pure scoring/rollup helpers (P4).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { severityRank, worstOf, rollup } from '@/lib/control/platform-health';

describe('severityRank', () => {
  it('orders critical > warning > info > none', () => {
    assert.ok(severityRank('critical') > severityRank('warning'));
    assert.ok(severityRank('warning') > severityRank('info'));
    assert.ok(severityRank('info') > severityRank(null));
  });
});

describe('worstOf', () => {
  it('returns the most severe issue', () => {
    assert.equal(worstOf([{ severity: 'info' }, { severity: 'critical' }, { severity: 'warning' }]), 'critical');
  });
  it('null when there are no issues', () => {
    assert.equal(worstOf([]), null);
  });
  it('picks warning over info', () => {
    assert.equal(worstOf([{ severity: 'info' }, { severity: 'warning' }]), 'warning');
  });
});

describe('rollup', () => {
  const schools = [
    { id: 1, name: 'A', status: 'active', worst: 'critical', issues: [{ type: 'licence_expired', severity: 'critical' }, { type: 'sms_failed', severity: 'warning' }] },
    { id: 2, name: 'B', status: 'active', worst: 'warning', issues: [{ type: 'clock_drift', severity: 'warning' }] },
    { id: 3, name: 'C', status: 'active', worst: null, issues: [] },
  ];
  it('counts schools with issues (not clean ones)', () => {
    assert.equal(rollup(schools).schoolsWithIssues, 2);
  });
  it('tallies by severity', () => {
    const r = rollup(schools);
    assert.equal(r.bySeverity.critical, 1);
    assert.equal(r.bySeverity.warning, 2);
    assert.equal(r.bySeverity.info, 0);
  });
  it('tallies by issue type', () => {
    const r = rollup(schools);
    assert.equal(r.byType.licence_expired, 1);
    assert.equal(r.byType.sms_failed, 1);
    assert.equal(r.byType.clock_drift, 1);
  });
  it('all-clean platform → zero', () => {
    const r = rollup([{ id: 9, name: 'Z', status: 'active', worst: null, issues: [] }]);
    assert.equal(r.schoolsWithIssues, 0);
    assert.equal(r.bySeverity.critical, 0);
  });
});
