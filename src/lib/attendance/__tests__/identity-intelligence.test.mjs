// Identity Intelligence — pure classification + keeper selection + health.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { classifyIssues, chooseKeeper, scoreIdentityHealth } from '@/lib/attendance/identity-intelligence';

const dupGroup = (over = {}) => ({
  role_type: 'staff', role_ref_id: 660028, name: 'GALIMU SAMUEL',
  enrollments: [
    { pin: 25, last_seen_days: 0, enrolled_days: 30 },
    { pin: 199, last_seen_days: 45, enrolled_days: 5 },
  ],
  ...over,
});

describe('chooseKeeper', () => {
  it('keeps the most recently active PIN', () => {
    assert.equal(chooseKeeper(dupGroup()), 25);
  });
  it('falls back to most recently enrolled when never seen', () => {
    const g = dupGroup({ enrollments: [
      { pin: 10, last_seen_days: null, enrolled_days: 100 },
      { pin: 20, last_seen_days: null, enrolled_days: 3 },
    ] });
    assert.equal(chooseKeeper(g), 20);
  });
});

describe('classifyIssues — duplicates', () => {
  it('produces a high-severity merge keeping the active PIN', () => {
    const issues = classifyIssues({ duplicates: [dupGroup()], unknowns: [], stales: [], totalEnrollments: 200 });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].kind, 'duplicate');
    assert.equal(issues[0].action, 'merge');
    assert.equal(issues[0].severity, 'high');
    assert.equal(issues[0].ref.keep_pin, 25);
    assert.match(issues[0].recommendation, /unmap 199/);
  });
  it('a single-enrollment "group" is not an issue', () => {
    const g = dupGroup({ enrollments: [{ pin: 25, last_seen_days: 0, enrolled_days: 30 }] });
    assert.deepEqual(classifyIssues({ duplicates: [g], unknowns: [], stales: [], totalEnrollments: 1 }), []);
  });
});

describe('classifyIssues — unknowns', () => {
  it('recent, multi-punch unknown → high map', () => {
    const i = classifyIssues({ duplicates: [], unknowns: [{ device_sn: 'GED1', pin: '77', events: 5, last_event_days: 1 }], stales: [], totalEnrollments: 0 })[0];
    assert.equal(i.kind, 'unknown');
    assert.equal(i.action, 'map');
    assert.equal(i.severity, 'high');
  });
  it('device name becomes the suggestion', () => {
    const i = classifyIssues({ duplicates: [], unknowns: [{ device_sn: 'GED1', pin: '77', events: 5, last_event_days: 1, suggested_name: 'MEME FATUMA' }], stales: [], totalEnrollments: 0 })[0];
    assert.match(i.recommendation, /MEME FATUMA/);
  });
  it('old single unknown → medium', () => {
    const i = classifyIssues({ duplicates: [], unknowns: [{ device_sn: null, pin: '9', events: 1, last_event_days: 40 }], stales: [], totalEnrollments: 0 })[0];
    assert.equal(i.severity, 'medium');
  });
});

describe('classifyIssues — ordering', () => {
  it('high severity sorts before low', () => {
    const issues = classifyIssues({
      duplicates: [dupGroup()],
      unknowns: [],
      stales: [{ pin: 5, name: 'X', role_type: 'staff', last_seen_days: 60 }],
      totalEnrollments: 10,
    });
    assert.equal(issues[0].severity, 'high');
    assert.equal(issues[issues.length - 1].kind, 'stale');
  });
});

describe('scoreIdentityHealth', () => {
  it('clean school → 100 clean', () => {
    const h = scoreIdentityHealth({ duplicates: [], unknowns: [], stales: [], totalEnrollments: 200 });
    assert.equal(h.score, 100);
    assert.equal(h.band, 'clean');
  });
  it('duplicates dominate the penalty', () => {
    const h = scoreIdentityHealth({ duplicates: [dupGroup(), dupGroup()], unknowns: [], stales: [], totalEnrollments: 200 });
    assert.ok(h.score <= 80);
    assert.match(h.summary, /duplicate/);
  });
  it('many unknowns push to attention', () => {
    const unknowns = Array.from({ length: 12 }, (_, i) => ({ device_sn: 'G', pin: String(i), events: 2, last_event_days: 2 }));
    const h = scoreIdentityHealth({ duplicates: [], unknowns, stales: [], totalEnrollments: 100 });
    assert.equal(h.band, 'attention');
  });
});
