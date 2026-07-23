// Person Attendance Intelligence — per-person behavioural profiling (pure).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { profilePerson } from '@/lib/attendance/person-intelligence';

const seq = (pattern) => pattern.split('').map((ch, i) => ({
  date: `2026-07-${String(i + 1).padStart(2, '0')}`,
  status: ch === 'P' ? 'present' : ch === 'L' ? 'late' : ch === 'A' ? 'absent' : 'half_day',
}));

describe('guards', () => {
  it('under 4 days → insufficient_data', () => {
    const p = profilePerson(seq('PPP'));
    assert.equal(p.behaviour, 'insufficient_data');
    assert.equal(p.watch, false);
  });
});

describe('reliable', () => {
  it('mostly present → reliable, not watched', () => {
    const p = profilePerson(seq('PPPPPPPPPP'));
    assert.equal(p.behaviour, 'reliable');
    assert.equal(p.watch, false);
    assert.equal(p.absentRate, 0);
  });
});

describe('frequently absent', () => {
  it('20%+ absence → frequently_absent + watch', () => {
    const p = profilePerson(seq('PAPAPAPPPP')); // 3/10 absent
    assert.equal(p.behaviour, 'frequently_absent');
    assert.equal(p.watch, true);
    assert.match(p.note, /Absent 30%/);
  });
  it('reports current absence streak', () => {
    const p = profilePerson(seq('PPPPPPPAAA')); // trailing 3 absent
    assert.equal(p.currentAbsentStreak, 3);
    assert.equal(p.behaviour, 'frequently_absent');
  });
});

describe('declining — unusual for them', () => {
  it('clean first half, some absences recently → declining + watch', () => {
    // 20 days: prior half 0% absent, recent half 30% — overall 15% (< the
    // frequently_absent floor) so the SELF-comparison is what fires.
    const p = profilePerson(seq('PPPPPPPPPP' + 'PPPPPPPAAA'));
    assert.equal(p.behaviour, 'declining');
    assert.equal(p.watch, true);
    assert.match(p.note, /change from their own pattern/);
  });
});

describe('lateness', () => {
  it('35%+ late → chronically_late + watch', () => {
    const p = profilePerson(seq('LLLLPPPPPP')); // 4/10 late
    assert.equal(p.behaviour, 'chronically_late');
    assert.equal(p.watch, true);
  });
  it('15-34% late → occasionally_late, not watched', () => {
    const p = profilePerson(seq('LLPPPPPPPP')); // 2/10 late
    assert.equal(p.behaviour, 'occasionally_late');
    assert.equal(p.watch, false);
  });
});

describe('improving', () => {
  it('absences early, clean recently → improving', () => {
    // Overall 15% absent, but prior 30% → recent 0%: improving, not "frequently absent".
    const p = profilePerson(seq('PPPAAAPPPP' + 'PPPPPPPPPP'));
    assert.equal(p.behaviour, 'improving');
    assert.equal(p.watch, false);
  });
});

describe('rates', () => {
  it('computes present/late/absent rates', () => {
    const p = profilePerson(seq('PPPPPLLAAP')); // 6 present-ish? P=6,L=2,A=2
    assert.ok(Math.abs(p.absentRate - 0.2) < 0.001);
    assert.ok(Math.abs(p.lateRate - 0.2) < 0.001);
  });
});
