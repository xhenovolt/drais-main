// Allowance eligibility classification — the JIPRA payment-decision logic.
// Built on the engine's persisted verdicts; this only classifies arrival
// side + eligibility. Reporting cutoff comes from the school's rule.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyArrival } from '@/lib/attendance/allowance.ts';

const EAT = 180;
const base = { date: '2026-07-22', tzOffsetMinutes: EAT, arrivalEndTime: '08:00:00' };
// School-local 08:00 EAT == 05:00Z on 2026-07-22.
const at = (hLocal, m = 0) => new Date(Date.UTC(2026, 6, 22, hLocal - 3, m));

describe('classifyArrival (allowance decisions)', () => {
  it('07:45 arrival with 08:00 reporting → EARLY, allowance YES', () => {
    const r = classifyArrival({ ...base, engineStatus: 'present', firstInAt: at(7, 45), lastOutAt: at(16, 30) });
    assert.equal(r.arrivalStatus, 'EARLY');
    assert.equal(r.allowance, true);
  });
  it('08:00 sharp → ON TIME, allowance YES', () => {
    const r = classifyArrival({ ...base, engineStatus: 'present', firstInAt: at(8, 0), lastOutAt: at(17, 0) });
    assert.equal(r.arrivalStatus, 'ON_TIME');
    assert.equal(r.allowance, true);
  });
  it('engine verdict late (08:17 past grace) → LATE, allowance NO', () => {
    const r = classifyArrival({ ...base, engineStatus: 'late', firstInAt: at(8, 17), lastOutAt: at(17, 0) });
    assert.equal(r.arrivalStatus, 'LATE');
    assert.equal(r.allowance, false);
  });
  it('no record → ABSENT, allowance NO', () => {
    const r = classifyArrival({ ...base, engineStatus: null, firstInAt: null, lastOutAt: null });
    assert.equal(r.arrivalStatus, 'ABSENT');
    assert.equal(r.allowance, false);
  });
  it('arrived but no checkout → checkoutMissing flag, allowance unaffected', () => {
    const r = classifyArrival({ ...base, engineStatus: 'present', firstInAt: at(7, 30), lastOutAt: null });
    assert.equal(r.checkoutMissing, true);
    assert.equal(r.allowance, true);
  });
  it('half_day / early_leave verdicts still classify the ARRIVAL side', () => {
    const r = classifyArrival({ ...base, engineStatus: 'early_leave', firstInAt: at(7, 50), lastOutAt: at(12, 0) });
    assert.equal(r.arrivalStatus, 'EARLY');
    assert.equal(r.allowance, true);
  });
});
