// School hard-delete — pure "is this a real school" guard.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeRealSchool } from '@/lib/control/school-hard-delete';

describe('looksLikeRealSchool', () => {
  it('a tiny/empty test school is not "real"', () => {
    assert.equal(looksLikeRealSchool({ learners: 0, staff: 0, events: 0, devices: 0 }), false);
    assert.equal(looksLikeRealSchool({ learners: 5, staff: 3, events: 100, devices: 1 }), false);
  });
  it('many learners → real (force required)', () => {
    assert.equal(looksLikeRealSchool({ learners: 20, staff: 0, events: 0, devices: 0 }), true);
  });
  it('many staff → real', () => {
    assert.equal(looksLikeRealSchool({ learners: 0, staff: 20, events: 0, devices: 0 }), true);
  });
  it('lots of attendance events → real', () => {
    assert.equal(looksLikeRealSchool({ learners: 0, staff: 0, events: 500, devices: 0 }), true);
  });
  it('devices alone do not make it real (a test school can have a device)', () => {
    assert.equal(looksLikeRealSchool({ learners: 0, staff: 0, events: 0, devices: 9 }), false);
  });
});
