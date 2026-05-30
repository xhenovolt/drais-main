// node:test suite — canonical identity resolver (Phase 1.4).
// Run with: npx tsx --test src/lib/ingestion/__tests__/identity.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIdentity } from '../identity/index.ts';

// ─── Test fixtures — a few synthetic DRAIS persons ───────────────────────────
const ALI    = { personId: 11, role: 'student', admissionNo: 'ADM/001', firstName: 'Ali',  lastName: 'Hassan',  otherName: null, className: 'S1', streamName: 'A' };
const ALIA   = { personId: 12, role: 'student', admissionNo: 'ADM/002', firstName: 'Alia', lastName: 'Hassan',  otherName: null, className: 'S1', streamName: 'A' };
const FATIMA = { personId: 13, role: 'student', admissionNo: 'ADM/003', firstName: 'Fatima', lastName: 'Said',  otherName: null, className: 'S2', streamName: 'A' };
const ADMIN  = { personId: 99, role: 'staff',   admissionNo: null,      firstName: 'Mr',   lastName: 'Johnson', otherName: null, className: null, streamName: null };

// Synthetic lookup — pure in-memory, deterministic.
const makeLookup = ({
  byCredential = {},
  byAdmission = {},
  byDevice = {},
  byName = [],
} = {}) => ({
  async byCredentialId(id)   { return byCredential[id] ?? []; },
  async byAdmissionNo(no)    { return byAdmission[no]  ?? []; },
  async byDeviceMapping(uid, serial) { return byDevice[`${serial}::${uid}`] ?? []; },
  async byNamePrefix(_first, _last, _school, _opts) { return byName; },
});

describe('resolveIdentity — credential exact match', () => {
  it('credential hit + single row = certain match', async () => {
    const lookup = makeLookup({ byCredential: { 'cred-1': [ALI] } });
    const r = await resolveIdentity({ credentialId: 'cred-1' }, 1, lookup);
    assert.equal(r.matchType, 'credential-exact');
    assert.equal(r.personId, 11);
    assert.equal(r.confidence, 1);
  });

  it('credential hit + multiple rows = ambiguous', async () => {
    const lookup = makeLookup({ byCredential: { 'cred-1': [ALI, ALIA] } });
    const r = await resolveIdentity({ credentialId: 'cred-1' }, 1, lookup);
    assert.equal(r.matchType, 'fuzzy-ambiguous');
    assert.equal(r.personId, null);
    assert.equal(r.candidates.length, 2);
  });
});

describe('resolveIdentity — admission_no exact match', () => {
  it('admission only → high confidence, no name supplied', async () => {
    const lookup = makeLookup({ byAdmission: { 'ADM/001': [ALI] } });
    const r = await resolveIdentity({ admissionNo: 'ADM/001' }, 1, lookup);
    assert.equal(r.matchType, 'admission-exact');
    assert.equal(r.personId, 11);
    assert.equal(r.confidence, 0.95);
  });

  it('admission + matching name → confidence 1.0', async () => {
    const lookup = makeLookup({ byAdmission: { 'ADM/001': [ALI] } });
    const r = await resolveIdentity({
      admissionNo: 'ADM/001', firstName: 'Ali', lastName: 'Hassan',
    }, 1, lookup);
    assert.equal(r.matchType, 'admission-exact');
    assert.equal(r.confidence, 1);
  });

  it('admission + DISAGREEING name → AMBIGUOUS, NOT auto-applied', async () => {
    // Catches mis-keyed admission numbers: the admission number resolves
    // to person X, but the row claims a different name. We MUST NOT
    // overwrite person X's data.
    const lookup = makeLookup({ byAdmission: { 'ADM/001': [ALI] } });
    const r = await resolveIdentity({
      admissionNo: 'ADM/001', firstName: 'Khadija', lastName: 'Bakari',
    }, 1, lookup);
    assert.equal(r.matchType, 'fuzzy-ambiguous');
    assert.equal(r.personId, null);
    assert.ok(r.confidence < 0.7);
  });

  it('admission_no reused across people → AMBIGUOUS', async () => {
    const lookup = makeLookup({ byAdmission: { 'ADM/001': [ALI, ALIA] } });
    const r = await resolveIdentity({ admissionNo: 'ADM/001' }, 1, lookup);
    assert.equal(r.matchType, 'fuzzy-ambiguous');
    assert.equal(r.candidates.length, 2);
  });
});

describe('resolveIdentity — device mapping (replaces "CardNo IS identity" bug)', () => {
  it('device user lookup hits via mapping table', async () => {
    const lookup = makeLookup({
      byDevice: { 'ZK-001::5512': [ALI] },
    });
    const r = await resolveIdentity({
      deviceUserId: '5512', deviceSerial: 'ZK-001',
    }, 1, lookup);
    assert.equal(r.matchType, 'device-mapping-exact');
    assert.equal(r.personId, 11);
  });

  it('device user with no mapping = no-match (NOT silently using device id)', async () => {
    const lookup = makeLookup({}); // no mappings at all
    const r = await resolveIdentity({
      deviceUserId: '5512', deviceSerial: 'ZK-001',
    }, 1, lookup);
    assert.equal(r.matchType, 'no-match');
    assert.equal(r.personId, null);
  });
});

describe('resolveIdentity — name+class fuzzy', () => {
  it('exact name match in single candidate = high confidence', async () => {
    const lookup = makeLookup({ byName: [ALI] });
    const r = await resolveIdentity({
      firstName: 'Ali', lastName: 'Hassan', className: 'S1',
    }, 1, lookup);
    assert.equal(r.matchType, 'name-class-exact');
    assert.equal(r.personId, 11);
  });

  it('typo in name still matches above threshold', async () => {
    const lookup = makeLookup({ byName: [ALI] });
    const r = await resolveIdentity({
      firstName: 'Aly', lastName: 'Hassan', className: 'S1',
    }, 1, lookup);
    assert.equal(r.matchType, 'name-class-exact');
    assert.equal(r.personId, 11);
  });

  it('multiple candidates = ambiguous, NEVER auto-picked', async () => {
    const lookup = makeLookup({ byName: [ALI, ALIA] });
    const r = await resolveIdentity({
      firstName: 'Ali', lastName: 'Hassan',
    }, 1, lookup);
    assert.equal(r.matchType, 'fuzzy-ambiguous');
    assert.equal(r.personId, null);
    assert.equal(r.candidates.length, 2);
  });

  it('no matching names at all = no-match', async () => {
    const lookup = makeLookup({ byName: [] });
    const r = await resolveIdentity({
      firstName: 'Khadija', lastName: 'Bakari',
    }, 1, lookup);
    assert.equal(r.matchType, 'no-match');
    assert.equal(r.personId, null);
  });
});

describe('resolveIdentity — empty claim', () => {
  it('no signals at all = no-match (graceful)', async () => {
    const lookup = makeLookup({});
    const r = await resolveIdentity({}, 1, lookup);
    assert.equal(r.matchType, 'no-match');
    assert.equal(r.personId, null);
  });
});
