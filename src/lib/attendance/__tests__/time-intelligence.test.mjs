// Time Intelligence Engine — deterministic confidence/drift detection.
// The exact JIPRA scenario is the canonical test: staff usually first-punch
// ~05:18; a batch whose first arrival is 10:21 with minutes preserved must be
// flagged as whole-hour clock drift with a −5h recommended correction.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  assessBatch, applyPolicy, median, mad, percentile, fmtMinute,
} from '@/lib/attendance/time-intelligence/confidence';

const baseline = (over = {}) => ({
  median_first_minute: 5 * 60 + 18, // 05:18
  mad_minutes: 8,
  sample_days: 40,
  ...over,
});
const batch = (over = {}) => ({
  firstArrivalMinute: 5 * 60 + 21,
  punchCount: 120,
  futureCount: 0,
  maxFutureMinutes: 0,
  nearMidnightCount: 0,
  yearOutOfRange: false,
  outOfOrderCount: 0,
  ...over,
});

describe('stats helpers', () => {
  it('median / mad / percentile', () => {
    assert.equal(median([3, 1, 2]), 2);
    assert.equal(median([1, 2, 3, 4]), 3); // rounded midpoint
    assert.equal(mad([1, 1, 1, 10]), 0);
    assert.equal(percentile([1, 2, 3, 4, 5], 10), 1);
    assert.equal(fmtMinute(321), '05:21');
  });
});

describe('trusted batches', () => {
  it('6 minutes off usual → 99% trusted', () => {
    const a = assessBatch(baseline({ median_first_minute: 7 * 60 + 12 }), batch({ firstArrivalMinute: 7 * 60 + 18 }));
    assert.equal(a.status, 'trusted');
    assert.ok(a.confidence >= 99);
    assert.equal(a.recommendedShiftMin, 0);
  });

  it('within 3×MAD tolerance → trusted', () => {
    const a = assessBatch(baseline({ mad_minutes: 15 }), batch({ firstArrivalMinute: 5 * 60 + 55 }));
    assert.equal(a.status, 'trusted');
  });
});

describe('whole-hour drift (the JIPRA case)', () => {
  it('05:18 usual, 10:21 today → anomaly, −5h correction, minutes preserved', () => {
    const a = assessBatch(baseline(), batch({ firstArrivalMinute: 10 * 60 + 21 }));
    assert.equal(a.status, 'anomaly');
    assert.ok(a.confidence <= 10, `confidence ${a.confidence}`);
    assert.equal(a.recommendedShiftMin, -300);
    assert.equal(a.offsetEstimateMin, 300);
    assert.ok(a.driftConfidence >= 90);
    assert.match(a.likelyCause, /clock_drift_hours|timezone/);
  });

  it('device 2h behind → +2h correction', () => {
    const a = assessBatch(baseline({ median_first_minute: 8 * 60 }), batch({ firstArrivalMinute: 6 * 60 + 3 }));
    assert.equal(a.status, 'anomaly');
    assert.equal(a.recommendedShiftMin, 120);
  });

  it('drift confidence grows with more baseline days', () => {
    const few = assessBatch(baseline({ sample_days: 6 }), batch({ firstArrivalMinute: 10 * 60 + 21 }));
    const many = assessBatch(baseline({ sample_days: 60 }), batch({ firstArrivalMinute: 10 * 60 + 21 }));
    assert.ok(many.driftConfidence >= few.driftConfidence);
  });
});

describe('contaminated baseline — tolerance must be capped (live JIPRA incident)', () => {
  // Reported live: "Usual first arrival 05:25 (14d)" / "Today's first arrival
  // 08:43" (a 3h18m gap) still scored 92% confidence / "Auto-resolved" — the
  // school's learned mad_minutes had itself been inflated to 128 by earlier,
  // uncorrected clock-drift days baked into the baseline history, so the
  // tolerance band (3×MAD) had widened enough to swallow the very deviation
  // it should have caught. Exact real numbers from device_clock_health /
  // attendance_time_baselines below.
  const contaminated = baseline({ median_first_minute: 325, mad_minutes: 128, sample_days: 14 });

  it('a 3h18m deviation is NOT silently trusted, no matter how wide the learned MAD is', () => {
    const a = assessBatch(contaminated, batch({ firstArrivalMinute: 523 }));
    assert.equal(a.status, 'anomaly');
    assert.ok(a.confidence < 50, `confidence ${a.confidence} should be low, not a false "resolved"`);
  });

  it('the effective tolerance never exceeds the sane ceiling regardless of mad_minutes', () => {
    // A deviation just OVER the cap must fail; just under must still pass —
    // proves the cap is a hard ceiling, not merely a coincidental result.
    const justOver = assessBatch(contaminated, batch({ firstArrivalMinute: 325 + 91 }));
    const justUnder = assessBatch(contaminated, batch({ firstArrivalMinute: 325 + 89 }));
    assert.equal(justOver.status, 'anomaly');
    assert.equal(justUnder.status, 'trusted');
  });

  it('a genuinely tight baseline (small MAD) is unaffected by the cap', () => {
    const tight = baseline({ median_first_minute: 325, mad_minutes: 12, sample_days: 40 });
    // 3×12=36 tolerance; 40 min off is outside it — still correctly flagged
    // (not silently trusted), well under the 90-min cap so the cap plays no
    // role here at all — a true baseline result, unaffected by this fix.
    const a = assessBatch(tight, batch({ firstArrivalMinute: 325 + 40 }));
    assert.notEqual(a.status, 'trusted');
  });
});

describe('other failure shapes', () => {
  it('future timestamps → device running fast, low confidence', () => {
    const a = assessBatch(baseline(), batch({ futureCount: 60, maxFutureMinutes: 300 }));
    assert.equal(a.status, 'anomaly');
    assert.equal(a.likelyCause, 'future_timestamps');
    assert.equal(a.recommendedShiftMin, -300);
  });

  it('RTC failure (impossible year) overrides everything', () => {
    const a = assessBatch(baseline(), batch({ yearOutOfRange: true }));
    assert.equal(a.likelyCause, 'rtc_failure');
    assert.ok(a.confidence <= 5);
  });

  it('midnight rollover pattern flagged', () => {
    const a = assessBatch(
      baseline({ median_first_minute: 5 * 60 + 18, mad_minutes: 5 }),
      batch({ firstArrivalMinute: 30, nearMidnightCount: 70 }),
    );
    assert.equal(a.status, 'anomaly');
    assert.equal(a.likelyCause, 'midnight_rollover');
  });

  it('minute-level drift beyond tolerance → review/anomaly, non-hour shift', () => {
    const a = assessBatch(baseline({ mad_minutes: 5 }), batch({ firstArrivalMinute: 5 * 60 + 58 }));
    assert.notEqual(a.status, 'trusted');
    assert.equal(a.recommendedShiftMin, -40);
    assert.match(a.likelyCause, /clock_running_fast/);
  });
});

describe('learning guards', () => {
  it('insufficient history → review, never a correction', () => {
    const a = assessBatch(baseline({ sample_days: 2 }), batch({ firstArrivalMinute: 10 * 60 + 21 }));
    assert.equal(a.status, 'review');
    assert.equal(a.recommendedShiftMin, 0);
    assert.equal(a.likelyCause, 'insufficient_history');
  });

  it('no baseline at all → review', () => {
    const a = assessBatch(null, batch());
    assert.equal(a.status, 'review');
  });

  it('empty batch → review, no correction', () => {
    const a = assessBatch(baseline(), batch({ firstArrivalMinute: null, punchCount: 0 }));
    assert.equal(a.status, 'review');
    assert.equal(a.recommendedShiftMin, 0);
  });
});

/* ── policy-aware layer (applyPolicy) ─────────────────────────────────── */
describe('applyPolicy — Time Health reads the school time policy', () => {
  // A base verdict where the STORED (punch_at) times look clean.
  const clean = () => ({ confidence: 99, status: 'trusted', offsetEstimateMin: 0,
    likelyCause: 'normal', detail: 'ok', recommendedShiftMin: 0, driftConfidence: 0 });
  // A base verdict where the stored times are still off by a whole hour.
  const drifted = () => ({ confidence: 8, status: 'anomaly', offsetEstimateMin: 300,
    likelyCause: 'clock_drift_hours', detail: 'off by 5h', recommendedShiftMin: -300, driftConfidence: 95 });

  it('CORRECT_BY_DRIFT: big device drift but clean stored times → auto-resolved (positive signal)', () => {
    const a = applyPolicy(clean(), { policy: 'CORRECT_BY_DRIFT', rawDriftMin: 300, maxDriftMin: 2 });
    assert.equal(a.resolvedByPolicy, true);
    assert.equal(a.status, 'trusted');
    assert.equal(a.likelyCause, 'auto_resolved');
    assert.equal(a.recommendedShiftMin, 0);
    assert.equal(a.rawDriftMin, 300);
    assert.match(a.detail, /already realigned/i);
  });

  it('CORRECT_BY_DRIFT: drift left in stored times → auto-correction incomplete, still actionable', () => {
    const a = applyPolicy(drifted(), { policy: 'CORRECT_BY_DRIFT', rawDriftMin: 300, maxDriftMin: 2 });
    assert.equal(a.resolvedByPolicy, false);
    assert.equal(a.status, 'anomaly');
    assert.equal(a.likelyCause, 'auto_correct_incomplete');
    assert.match(a.detail, /auto-sync|correct this batch/i);
  });

  it('CORRECT_BY_DRIFT: no device drift + clean stored → ordinary trusted, unchanged', () => {
    const a = applyPolicy(clean(), { policy: 'CORRECT_BY_DRIFT', rawDriftMin: 1, maxDriftMin: 2 });
    assert.equal(a.likelyCause, 'normal');
    assert.equal(a.resolvedByPolicy, false);
  });

  it('TRUST_DEVICE_TIME: drift is kept by design → downgrade anomaly to review, no shift nag', () => {
    const a = applyPolicy(drifted(), { policy: 'TRUST_DEVICE_TIME', rawDriftMin: 300, maxDriftMin: 2 });
    assert.equal(a.status, 'review');
    assert.equal(a.likelyCause, 'trusted_by_policy');
    assert.equal(a.recommendedShiftMin, 0);
    assert.match(a.detail, /trust device time|by design/i);
  });

  it('MANUAL_REVIEW_IF_DRIFT: drift → flagged for review, kept pending decision', () => {
    const a = applyPolicy(drifted(), { policy: 'MANUAL_REVIEW_IF_DRIFT', rawDriftMin: 300, maxDriftMin: 2 });
    assert.equal(a.status, 'review');
    assert.equal(a.likelyCause, 'manual_review_flagged');
  });

  it('hard failures (RTC) stand under every policy', () => {
    const rtc = { confidence: 2, status: 'anomaly', offsetEstimateMin: 0, likelyCause: 'rtc_failure',
      detail: 'dead RTC', recommendedShiftMin: 0, driftConfidence: 97 };
    for (const policy of ['CORRECT_BY_DRIFT', 'TRUST_DEVICE_TIME', 'MANUAL_REVIEW_IF_DRIFT']) {
      const a = applyPolicy(rtc, { policy, rawDriftMin: 999, maxDriftMin: 2 });
      assert.equal(a.likelyCause, 'rtc_failure');
      assert.equal(a.status, 'anomaly');
    }
  });

  it('still-learning is never reinterpreted', () => {
    const learn = { confidence: 70, status: 'review', offsetEstimateMin: 0, likelyCause: 'insufficient_history',
      detail: 'learning', recommendedShiftMin: 0, driftConfidence: 0 };
    const a = applyPolicy(learn, { policy: 'CORRECT_BY_DRIFT', rawDriftMin: 300, maxDriftMin: 2 });
    assert.equal(a.likelyCause, 'insufficient_history');
    assert.equal(a.resolvedByPolicy, false);
  });
});
