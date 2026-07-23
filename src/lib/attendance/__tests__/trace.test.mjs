// Digital Twin — pure stage composition. The first red stage answers
// "where did it break?" without any database access.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { composeStages, traceSummary } from '@/lib/attendance/trace';

const baseRaw = {
  id: 1, device_sn: 'GED7254601154', device_user_id: '79',
  punch_at: '2026-07-23T02:21:50.000Z', device_reported_time: '2026-07-23 05:21:50',
  ingested_at: '2026-07-23T02:22:00.000Z', source: 'zkteco_push',
  time_source: 'device', clock_skew_seconds: 0,
  matched: 1, person_id: 720001, role_type: 'staff',
  resolution_path: 'enrollment', resolution_score: null,
  is_provisional: 0, provisional_reason: null,
  display_name: 'GALIMU SAMUEL', derived_event: 'ARRIVED', popup_at: '2026-07-23T02:22:01.000Z',
  verify_type: 1,
};
const record = { status: 'present', rule_id: 300002, first_in_at: '2026-07-23T02:21:50.000Z', late_minutes: 0, evaluated_at: '2026-07-23T02:22:02.000Z' };
const input = (over = {}) => ({ raw: { ...baseRaw }, corrections: [], record, sms: [], ...over });

const stage = (stages, key) => stages.find((s) => s.key === key);

describe('composeStages — happy path', () => {
  it('all stages ok for a clean live punch', () => {
    const stages = composeStages(input({ sms: [{ status: 'delivered', attempts: 1, last_error: null, delivered_at: '2026-07-23T02:22:30Z', created_at: '2026-07-23T02:22:05Z' }] }));
    assert.equal(stages.length, 10);
    for (const key of ['capture', 'device', 'device_time', 'receive', 'correction', 'identity', 'verdict', 'popup', 'sms', 'audit']) {
      assert.equal(stage(stages, key)?.status, 'ok', key);
    }
    assert.equal(traceSummary(stages).status, 'ok');
  });
});

describe('failure localisation', () => {
  it('unmatched punch → identity FAIL, verdict skipped', () => {
    const stages = composeStages(input({ raw: { ...baseRaw, matched: 0, person_id: null, display_name: null } }));
    assert.equal(stage(stages, 'identity').status, 'fail');
    assert.equal(stage(stages, 'verdict').status, 'skip');
    assert.equal(traceSummary(stages).failedStage, 'Identity resolution');
  });

  it('failed SMS → sms stage FAIL with the provider error', () => {
    const stages = composeStages(input({ sms: [{ status: 'failed', attempts: 3, last_error: 'insufficient balance', delivered_at: null, created_at: '2026-07-23T02:22:05Z' }] }));
    assert.equal(stage(stages, 'sms').status, 'fail');
    assert.match(stage(stages, 'sms').detail, /insufficient balance/);
  });

  it('matched but never evaluated → verdict WARN', () => {
    const stages = composeStages(input({ record: null }));
    assert.equal(stage(stages, 'verdict').status, 'warn');
  });

  it('provisional identity → warn, not fail', () => {
    const stages = composeStages(input({ raw: { ...baseRaw, is_provisional: 1, provisional_reason: 'auto-created' } }));
    assert.equal(stage(stages, 'identity').status, 'warn');
  });
});

describe('time stages', () => {
  it('batch correction shows as warn with the applied shift', () => {
    const stages = composeStages(input({ corrections: [{ id: 9, shift_minutes: -300, applied_at: '2026-07-23T12:55:00Z', undone_at: null }] }));
    assert.equal(stage(stages, 'correction').status, 'warn');
    assert.match(stage(stages, 'correction').detail, /-300 min/);
  });

  it('undone corrections do not mark the stage', () => {
    const stages = composeStages(input({ corrections: [{ id: 9, shift_minutes: -300, applied_at: '2026-07-23T12:55:00Z', undone_at: '2026-07-23T13:00:00Z' }] }));
    assert.equal(stage(stages, 'correction').status, 'ok');
  });

  it('large device skew → device_time warn', () => {
    const stages = composeStages(input({ raw: { ...baseRaw, clock_skew_seconds: 18000 } }));
    assert.equal(stage(stages, 'device_time').status, 'warn');
  });

  it('store-and-forward upload lag is explained, not punished', () => {
    const stages = composeStages(input({ raw: { ...baseRaw, ingested_at: '2026-07-23T12:00:32.000Z' } }));
    assert.equal(stage(stages, 'receive').status, 'ok');
    assert.match(stage(stages, 'receive').detail, /store-and-forward/);
  });
});

describe('popup + no-sms stages', () => {
  it('offline batch (no popup) → info, never a failure', () => {
    const stages = composeStages(input({ raw: { ...baseRaw, popup_at: null } }));
    assert.equal(stage(stages, 'popup').status, 'info');
    assert.equal(traceSummary(stages).status, 'ok');
  });

  it('no SMS configured → info', () => {
    const stages = composeStages(input());
    assert.equal(stage(stages, 'sms').status, 'info');
  });
});
