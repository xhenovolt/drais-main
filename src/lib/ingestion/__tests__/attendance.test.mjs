// node:test suite — AttendanceEvent + vendor adapters (Phase 1.2).
// Run with: npx tsx --test src/lib/ingestion/__tests__/attendance.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zktecoAdapter } from '../attendance/adapters/zkteco.ts';
import { dahuaAdapter }  from '../attendance/adapters/dahua.ts';
import {
  manualMarkAdapter, webauthnAdapter, attendanceAdapters,
} from '../attendance/adapters/manual.ts';
import { computeIsLate, toCanonicalIsoUtc } from '../attendance/event.ts';

// Synthetic identity resolver — pretends device_user 5512 maps to person 11,
// and credentialId 'cred-1' maps to person 22.
const FAKE_RESOLVER = async (claim) => {
  if (claim.deviceUserId === '5512')   return { personId: 11, personRole: 'student', confidence: 1 };
  if (claim.credentialId === 'cred-1') return { personId: 22, personRole: 'student', confidence: 1 };
  return { personId: null, personRole: null, confidence: 0 };
};

describe('computeIsLate', () => {
  it('returns false when cutoff is null/undefined', () => {
    assert.equal(computeIsLate('2026-05-31T07:00:00Z', null),      false);
    assert.equal(computeIsLate('2026-05-31T07:00:00Z', undefined), false);
  });

  it('returns true past cutoff, false before', () => {
    assert.equal(computeIsLate('2026-05-31T09:00:00Z', '08:30'), true);
    assert.equal(computeIsLate('2026-05-31T07:30:00Z', '08:30'), false);
  });

  it('returns false on unparseable inputs', () => {
    assert.equal(computeIsLate('garbage', '08:30'), false);
    assert.equal(computeIsLate('2026-05-31T09:00:00Z', 'not-a-time'), false);
  });
});

describe('toCanonicalIsoUtc — handles every input shape adapters see', () => {
  it('UNIX seconds (10 digits)', () => {
    assert.equal(toCanonicalIsoUtc(1771782789),    '2026-02-22T17:53:09.000Z');
    assert.equal(toCanonicalIsoUtc('1771782789'),  '2026-02-22T17:53:09.000Z');
  });

  it('UNIX milliseconds (13 digits)', () => {
    assert.equal(toCanonicalIsoUtc(1771782789000),    '2026-02-22T17:53:09.000Z');
    assert.equal(toCanonicalIsoUtc('1771782789000'),  '2026-02-22T17:53:09.000Z');
  });

  it('ISO string round-trips', () => {
    assert.equal(toCanonicalIsoUtc('2026-05-31T09:00:00Z'), '2026-05-31T09:00:00.000Z');
  });

  it('Date object', () => {
    assert.equal(toCanonicalIsoUtc(new Date('2026-05-31T09:00:00Z')), '2026-05-31T09:00:00.000Z');
  });

  it('returns null on unparseable inputs', () => {
    assert.equal(toCanonicalIsoUtc('nonsense'), null);
    assert.equal(toCanonicalIsoUtc(null),       null);
    assert.equal(toCanonicalIsoUtc(undefined),  null);
    assert.equal(toCanonicalIsoUtc(''),         null);
  });
});

describe('zktecoAdapter', () => {
  it('canHandle accepts vendor=zkteco payloads only', () => {
    assert.equal(zktecoAdapter.canHandle({ vendor: 'zkteco', records: [] }), true);
    assert.equal(zktecoAdapter.canHandle({ vendor: 'dahua',  records: [] }), false);
    assert.equal(zktecoAdapter.canHandle('garbage'), false);
  });

  it('canonicalises a clean ZKTeco record', async () => {
    const result = await zktecoAdapter.adapt(
      {
        vendor: 'zkteco', deviceSerial: 'ZK-001',
        records: [{ userId: '5512', uid: 1, timestamp: 1771782789, state: 0, type: 1 }],
      },
      FAKE_RESOLVER,
      { lateAfterHHMM: '08:30' },
    );
    assert.equal(result.events.length, 1);
    assert.equal(result.errors.length, 0);
    const e = result.events[0];
    assert.equal(e.personId, 11);
    assert.equal(e.method,   'fingerprint');
    assert.equal(e.direction, 'in');
    assert.equal(e.source.vendor, 'zkteco');
    assert.equal(e.source.deviceUserId, '5512');
  });

  it('orphans unknown device users — never silently drops without trace', async () => {
    const result = await zktecoAdapter.adapt(
      { vendor: 'zkteco', deviceSerial: 'ZK-001',
        records: [{ userId: '9999', timestamp: 1771782789 }] },
      FAKE_RESOLVER,
    );
    assert.equal(result.events.length, 0);
    assert.equal(result.orphanedCount, 1);
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].category, 'identity');
  });

  it('rejects unparseable timestamps without crashing the batch', async () => {
    const result = await zktecoAdapter.adapt(
      { vendor: 'zkteco', deviceSerial: 'ZK-001',
        records: [
          { userId: '5512', timestamp: 'nonsense' },
          { userId: '5512', timestamp: 1771782789, state: 0, type: 1 },
        ] },
      FAKE_RESOLVER,
    );
    assert.equal(result.events.length, 1);          // the good one made it
    assert.equal(result.errors.length, 1);
    assert.equal(result.errors[0].category, 'timestamp');
  });
});

describe('dahuaAdapter — fixes "CardNo IS identity" bug', () => {
  it('routes CardNo through the resolver instead of using it directly', async () => {
    // Resolver only knows about deviceUserId 5512. The Dahua adapter
    // calls resolver({ deviceUserId: '5512' }), gets person 11 back.
    const result = await dahuaAdapter.adapt(
      {
        vendor: 'dahua', deviceSerial: 'DH-001',
        records: [{ RecNo: 1, CardNo: '5512', CreateTime: 1771782789, Method: 21, Type: 'Entry' }],
      },
      FAKE_RESOLVER,
    );
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].personId, 11);
    assert.equal(result.events[0].direction, 'in');
    assert.equal(result.events[0].method,    'fingerprint');
  });

  it('orphans unknown CardNos (no longer silently treats them as identities)', async () => {
    const result = await dahuaAdapter.adapt(
      {
        vendor: 'dahua', deviceSerial: 'DH-001',
        records: [{ RecNo: 1, CardNo: '9999', CreateTime: 1771782789, Method: 0, Type: 'Exit' }],
      },
      FAKE_RESOLVER,
    );
    assert.equal(result.events.length, 0);
    assert.equal(result.orphanedCount, 1);
  });

  it('preserves unknown method codes in vendorExtras (no silent drop)', async () => {
    const result = await dahuaAdapter.adapt(
      {
        vendor: 'dahua', deviceSerial: 'DH-001',
        records: [{ RecNo: 1, CardNo: '5512', CreateTime: 1771782789, Method: 99, Type: 'Entry' }],
      },
      FAKE_RESOLVER,
    );
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].method, 'other');
    assert.equal(result.events[0].vendorExtras.unmappedMethodCode, 99);
  });
});

describe('webauthnAdapter — replaces hardcoded 8:30 AM late threshold', () => {
  it('emits an event with isLate computed from school-supplied cutoff', async () => {
    const r1 = await webauthnAdapter.adapt(
      { vendor: 'webauthn', credentialId: 'cred-1', timestampUtc: '2026-05-31T09:00:00Z' },
      FAKE_RESOLVER,
      { lateAfterHHMM: '08:30' },
    );
    assert.equal(r1.events[0].isLate, true);

    const r2 = await webauthnAdapter.adapt(
      { vendor: 'webauthn', credentialId: 'cred-1', timestampUtc: '2026-05-31T07:00:00Z' },
      FAKE_RESOLVER,
      { lateAfterHHMM: '08:30' },
    );
    assert.equal(r2.events[0].isLate, false);
  });

  it('no cutoff supplied = never late', async () => {
    const r = await webauthnAdapter.adapt(
      { vendor: 'webauthn', credentialId: 'cred-1', timestampUtc: '2026-05-31T15:00:00Z' },
      FAKE_RESOLVER,
    );
    assert.equal(r.events[0].isLate, false);
  });
});

describe('manualMarkAdapter — present students only emit events', () => {
  it('emits an event for present students, skips absent', async () => {
    const r = await manualMarkAdapter.adapt(
      {
        vendor: 'manual', date: '2026-05-31', sessionStartHHMM: '08:00',
        marks: [
          { personId: 11, personRole: 'student', present: true  },
          { personId: 12, personRole: 'student', present: false },
          { personId: 13, personRole: 'student', present: true  },
        ],
      },
      FAKE_RESOLVER,
    );
    assert.equal(r.events.length, 2);
    assert.deepEqual(r.events.map(e => e.personId).sort(), [11, 13]);
  });
});

describe('attendanceAdapters registry — vendor router can pick by sniff', () => {
  it('finds the right adapter for each vendor', () => {
    assert.equal(attendanceAdapters.find(a => a.canHandle({ vendor: 'zkteco',   records: [] })).vendor, 'zkteco');
    assert.equal(attendanceAdapters.find(a => a.canHandle({ vendor: 'dahua',    records: [] })).vendor, 'dahua');
    assert.equal(attendanceAdapters.find(a => a.canHandle({ vendor: 'webauthn', credentialId: 'x' })).vendor, 'webauthn');
    assert.equal(attendanceAdapters.find(a => a.canHandle({ vendor: 'manual',   marks: [] })).vendor, 'manual');
  });
});
