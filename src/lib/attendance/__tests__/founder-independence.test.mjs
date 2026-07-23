// Founder Independence Layer — pure scoring of the workflow map.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { WORKFLOWS, scoreIndependence } from '@/lib/attendance/founder-independence';

describe('workflow map', () => {
  it('covers the program (14 workflows, all with a surface)', () => {
    assert.ok(WORKFLOWS.length >= 12);
    for (const w of WORKFLOWS) {
      assert.ok(w.surface && w.workflow && w.phase, w.key);
      assert.ok(['founder', 'manual', 'assisted', 'automated'].includes(w.before));
      assert.ok(['founder', 'manual', 'assisted', 'automated'].includes(w.after));
    }
  });

  it('every workflow improved or held (never regressed)', () => {
    const rank = { founder: 0, manual: 1, assisted: 2, automated: 3 };
    for (const w of WORKFLOWS) assert.ok(rank[w.after] >= rank[w.before], `${w.key} regressed`);
  });
});

describe('scoreIndependence', () => {
  it('after beats before with a real delta', () => {
    const s = scoreIndependence(WORKFLOWS);
    assert.ok(s.after > s.before);
    assert.equal(s.delta, s.after - s.before);
    assert.ok(s.after >= 80, `after score ${s.after} should reflect a mostly-automated program`);
  });

  it('all-founder baseline scores 0', () => {
    const s = scoreIndependence([{ key: 'x', workflow: 'x', before: 'founder', after: 'founder', surface: '', phase: '' }]);
    assert.equal(s.before, 0);
    assert.equal(s.after, 0);
  });

  it('all-automated scores 100', () => {
    const s = scoreIndependence([{ key: 'x', workflow: 'x', before: 'automated', after: 'automated', surface: '', phase: '' }]);
    assert.equal(s.after, 100);
  });
});
