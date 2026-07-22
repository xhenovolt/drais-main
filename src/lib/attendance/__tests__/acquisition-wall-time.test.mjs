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
