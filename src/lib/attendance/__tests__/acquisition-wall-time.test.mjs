// Phase 1 regression guard for RC-1 of the TCP-pull postmortem
// (docs/audits/TCP_PULL_FORENSIC_AND_REDESIGN.md): the device wall-clock
// string must survive the pipeline verbatim, and wall↔UTC conversion must be
// a pure function of (wall, tzOffset) — NEVER of the host timezone.
//
// TZ-invariance is tested by re-running this suite under different TZ values
// in child processes (see the last test) — the exact failure mode that
// produced ±3h shifts in production.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  isDeviceWallTime, wallFromZkRecordTime, wallToUtc, utcToWall,
  wallDate, wallDiffSeconds,
} from '@/lib/attendance/acquisition/wall-time';

describe('DeviceWallTime canonical helpers', () => {
  it('validates wall strings strictly', () => {
    assert.equal(isDeviceWallTime('2026-07-17 08:19:33'), true);
    assert.equal(isDeviceWallTime('2026-07-17T08:19:33'), false);
    assert.equal(isDeviceWallTime('2026-07-17 08:19:33.000Z'), false);
    assert.equal(isDeviceWallTime('2026-13-01 00:00:00'), false);
    assert.equal(isDeviceWallTime('2026-07-17 24:00:00'), false);
  });

  it('recovers the wall string from a node-zklib recordTime (local-tz Date)', () => {
    // node-zklib does: new Date(y, m, d, h, mm, ss) — host-local components.
    const zkDate = new Date(2026, 6, 17, 8, 19, 33);
    assert.equal(wallFromZkRecordTime(zkDate), '2026-07-17 08:19:33');
  });

  it('wallToUtc applies the EXPLICIT device zone (EAT example)', () => {
    const instant = wallToUtc('2026-07-17 08:19:33', 180);
    assert.equal(instant.toISOString(), '2026-07-17T05:19:33.000Z');
  });

  it('handles a factory-default UTC+8 device (RC-4 scenario)', () => {
    // Device wall shows Beijing time; the true instant is wall − 8h.
    const instant = wallToUtc('2026-07-17 13:19:33', 480);
    assert.equal(instant.toISOString(), '2026-07-17T05:19:33.000Z');
  });

  it('utcToWall is the exact inverse of wallToUtc', () => {
    for (const [wall, tz] of [
      ['2026-07-17 08:19:33', 180],
      ['2026-01-01 00:00:00', 180],   // midnight boundary
      ['2026-07-17 02:30:00', 180],   // the toISOString().slice() bug window
      ['2026-12-31 23:59:59', 480],
    ]) {
      assert.equal(utcToWall(wallToUtc(wall, tz), tz), wall);
    }
  });

  it('wallDate is a pure slice — early-morning punches keep their day', () => {
    // RC-secondary: toISOString().slice(0,10) moved 00:00–02:59 punches to
    // the previous day on an EAT host. wallDate must not.
    assert.equal(wallDate('2026-07-17 00:15:00'), '2026-07-17');
    assert.equal(wallDate('2026-07-17 02:59:59'), '2026-07-17');
  });

  it('wallDiffSeconds measures drift between wall strings', () => {
    assert.equal(wallDiffSeconds('2026-07-17 08:20:33', '2026-07-17 08:19:33'), 60);
    assert.equal(wallDiffSeconds('2026-07-17 08:19:33', '2026-07-17 13:19:30'), -17997); // the JIPRA-class ~5h device
  });

  it('is invariant across host timezones (the RC-1 failure mode)', () => {
    // Re-run the core assertions in child processes pinned to different TZs.
    // If any helper secretly consults the host zone, one of these fails.
    const script = `
      const { wallFromZkRecordTime, wallToUtc, utcToWall } = require('${process.cwd()}/src/lib/attendance/acquisition/wall-time.ts');
      const zkDate = new Date(2026, 6, 17, 8, 19, 33);
      const wall = wallFromZkRecordTime(zkDate);
      if (wall !== '2026-07-17 08:19:33') throw new Error('wall recovery broke under TZ=' + process.env.TZ + ': ' + wall);
      const inst = wallToUtc(wall, 180);
      if (inst.toISOString() !== '2026-07-17T05:19:33.000Z') throw new Error('wallToUtc broke under TZ=' + process.env.TZ);
      if (utcToWall(inst, 180) !== wall) throw new Error('utcToWall broke under TZ=' + process.env.TZ);
      console.log('ok ' + process.env.TZ);
    `;
    for (const tz of ['UTC', 'Africa/Kampala', 'America/New_York', 'Asia/Shanghai']) {
      const out = execFileSync('npx', ['tsx', '-e', script], {
        env: { ...process.env, TZ: tz },
        encoding: 'utf8',
      });
      assert.match(out, new RegExp(`ok ${tz}`));
    }
  });
});

// ── Phase 2 additions ────────────────────────────────────────────────────────
import { decodeZkPackedTime, summarizeWallTimes } from '@/lib/attendance/acquisition/wall-time';
import { encodeZkDateTime } from '@/lib/attendance/device-clock';

describe('decodeZkPackedTime (CMD_GET_TIME reply)', () => {
  it('is the exact inverse of encodeZkDateTime', () => {
    // encode produces the packed device wall for a given instant+offset;
    // decode must recover the same wall string.
    const instant = Date.UTC(2026, 6, 17, 5, 19, 33); // 05:19:33Z
    const packed = encodeZkDateTime(instant, 180);     // EAT wall 08:19:33
    assert.equal(decodeZkPackedTime(packed), '2026-07-17 08:19:33');
  });

  it('rejects garbage', () => {
    assert.equal(decodeZkPackedTime(-5), null);
    assert.equal(decodeZkPackedTime(Number.NaN), null);
  });
});

describe('summarizeWallTimes (first-3 / last-3 anchors)', () => {
  const rec = (wall, pin) => ({ wall, pin });
  it('picks first and last three by wall order, last reversed (latest first)', () => {
    const batch = [
      rec('2026-07-17 06:48:00', 'c'), rec('2026-07-17 06:41:00', 'a'),
      rec('2026-07-17 17:28:00', 'z'), rec('2026-07-17 06:45:00', 'b'),
      rec('2026-07-17 17:06:00', 'x'), rec('2026-07-17 12:00:00', 'm'),
      rec('2026-07-17 17:11:00', 'y'),
    ];
    const { first, last } = summarizeWallTimes(batch);
    assert.deepEqual(first.map(r => r.pin), ['a', 'b', 'c']);
    assert.deepEqual(last.map(r => r.pin), ['z', 'y', 'x']);
  });
  it('handles batches smaller than N', () => {
    const { first, last } = summarizeWallTimes([rec('2026-07-17 06:41:00', 'a')]);
    assert.equal(first.length, 1);
    assert.equal(last.length, 1);
  });
});

// ── Phase 4: commit planner ──────────────────────────────────────────────────
import { planCommit } from '@/lib/attendance/acquisition/commit';

describe('planCommit (guarded committer eligibility)', () => {
  const stage = (id, pin, wall) => ({
    id, device_user_id: pin, device_wall_time: wall,
    verify_type: null, io_mode: null, display_name: null,
    matched: 1, person_id: 1, role_type: 'staff', role_ref_id: 1,
    duplicate_of_event_id: null,
  });

  it('skips punches already in DRAIS (any source) and in-batch repeats', () => {
    const records = [
      stage(1, '53', '2026-07-17 07:06:24'),  // exists → duplicate
      stage(2, '53', '2026-07-17 08:00:00'),  // new
      stage(3, '53', '2026-07-17 08:00:00'),  // in-batch repeat → duplicate
      stage(4, '64', '2026-07-17 05:19:42'),  // new
    ];
    const existing = new Set(['53|2026-07-17 07:06:24']);
    const plan = planCommit(records, existing);
    assert.deepEqual(plan.eligible.map(r => r.id), [2, 4]);
    assert.deepEqual(plan.skippedDuplicates.map(r => r.id), [1, 3]);
    assert.equal(plan.skippedInvalid.length, 0);
  });

  it('quarantines invalid wall strings instead of committing them', () => {
    const records = [
      stage(1, '53', '2026-07-17T07:06:24'),  // ISO-ish — invalid identity
      stage(2, '', '2026-07-17 08:00:00'),    // missing pin
      stage(3, '64', '2026-07-17 09:00:00'),  // fine
    ];
    const plan = planCommit(records, new Set());
    assert.deepEqual(plan.eligible.map(r => r.id), [3]);
    assert.deepEqual(plan.skippedInvalid.map(r => r.id), [1, 2]);
  });
});

// ── Phase 5: operator drift correction ──────────────────────────────────────
import { shiftWall } from '@/lib/attendance/acquisition/wall-time';

describe('shiftWall (operator drift correction)', () => {
  it('shifts backwards for a fast device (drift +300s → −300s correction)', () => {
    assert.equal(shiftWall('2026-07-22 08:05:00', -300), '2026-07-22 08:00:00');
  });
  it('shifts forwards for a slow device', () => {
    assert.equal(shiftWall('2026-07-22 07:58:30', 90), '2026-07-22 08:00:00');
  });
  it('crosses midnight correctly', () => {
    assert.equal(shiftWall('2026-07-23 00:00:30', -60), '2026-07-22 23:59:30');
  });
  it('the JIPRA-class ~5h-fast factory clock corrects to true morning times', () => {
    // Device shows 13:19:33 (UTC+8 factory) — operator answers device=13:19:33,
    // real=08:19:33 → drift 17997+3s ≈ +18000 → corrected wall 08:19:33.
    assert.equal(shiftWall('2026-07-17 13:19:33', -18000), '2026-07-17 08:19:33');
  });
  it('rejects invalid input', () => {
    assert.equal(shiftWall('bad', 60), null);
  });
});
