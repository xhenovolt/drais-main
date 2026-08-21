// Phase 7, sub-effort 7: offline subscription-access evaluation. Proves
// evaluateOfflineSubscriptionAccess() mirrors the real online access rule
// (getSubscriptionInfo()'s hasAccess + auto-expiry-by-date logic)
// correctly against a SchoolRecord's carried snapshot — not classifyPlan(),
// which was tried first and found to fail OPEN on missing data (see this
// module's own header for the real bug that caught).
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateOfflineSubscriptionAccess } from '@/lib/repo/offline-auth/subscription';

const baseSchool = {
  id: 1, name: 'Test School', legalName: null, shortCode: null, email: null, phone: null,
  currency: 'UGX', address: null, logoUrl: null, status: 'active',
  createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', deletedAt: null,
  subscriptionPlan: null, deletedBy: null, deleteReason: null, restoredAt: null, restoredBy: null,
};

describe('evaluateOfflineSubscriptionAccess', () => {
  it('an active subscription with a future end date has access', () => {
    const school = { ...baseSchool, subscriptionStatus: 'active', subscriptionType: 'yearly',
      trialStartDate: null, trialEndDate: null, subscriptionStartDate: '2026-01-01T00:00:00.000Z',
      subscriptionEndDate: '2027-01-01T00:00:00.000Z' };
    const result = evaluateOfflineSubscriptionAccess(school, new Date('2026-06-01T00:00:00.000Z'));
    assert.equal(result.hasAccess, true);
    assert.equal(result.effectiveStatus, 'active');
  });

  it('an active subscription whose end date has already passed has no access, even though status still says active (auto-expiry, mirrors online)', () => {
    const school = { ...baseSchool, subscriptionStatus: 'active', subscriptionType: 'monthly',
      trialStartDate: null, trialEndDate: null, subscriptionStartDate: '2025-01-01T00:00:00.000Z',
      subscriptionEndDate: '2025-02-01T00:00:00.000Z' };
    const result = evaluateOfflineSubscriptionAccess(school, new Date('2026-01-01T00:00:00.000Z'));
    assert.equal(result.hasAccess, false, 'a stale carried snapshot past its own end date must not grant access offline');
    assert.equal(result.effectiveStatus, 'expired');
  });

  it('a trial within its window has access; a trial past its end date does not', () => {
    const withinWindow = { ...baseSchool, subscriptionStatus: 'trial', subscriptionType: 'trial',
      trialStartDate: '2026-01-01T00:00:00.000Z', trialEndDate: '2026-02-01T00:00:00.000Z',
      subscriptionStartDate: null, subscriptionEndDate: null };
    assert.equal(evaluateOfflineSubscriptionAccess(withinWindow, new Date('2026-01-15T00:00:00.000Z')).hasAccess, true);

    const pastWindow = { ...withinWindow };
    const result = evaluateOfflineSubscriptionAccess(pastWindow, new Date('2026-03-01T00:00:00.000Z'));
    assert.equal(result.hasAccess, false);
    assert.equal(result.effectiveStatus, 'expired');
  });

  it('status expired or inactive has no access regardless of dates', () => {
    for (const status of ['expired', 'inactive']) {
      const school = { ...baseSchool, subscriptionStatus: status, subscriptionType: 'yearly',
        trialStartDate: null, trialEndDate: null, subscriptionStartDate: '2026-01-01T00:00:00.000Z',
        subscriptionEndDate: '2030-01-01T00:00:00.000Z' };
      const result = evaluateOfflineSubscriptionAccess(school, new Date('2026-06-01T00:00:00.000Z'));
      assert.equal(result.hasAccess, false, `status=${status} must never grant access`);
    }
  });

  it('a school with no subscription fields set at all (null everywhere) has no access — fails closed, not open', () => {
    const school = { ...baseSchool, subscriptionStatus: null, subscriptionType: null,
      trialStartDate: null, trialEndDate: null, subscriptionStartDate: null, subscriptionEndDate: null };
    const result = evaluateOfflineSubscriptionAccess(school, new Date());
    assert.equal(result.hasAccess, false, 'the absence of any subscription state must not be read as access granted');
  });

  it('an active subscription with NO end date at all is open-ended access, not expired by absence', () => {
    const school = { ...baseSchool, subscriptionStatus: 'active', subscriptionType: 'yearly',
      trialStartDate: null, trialEndDate: null, subscriptionStartDate: '2026-01-01T00:00:00.000Z',
      subscriptionEndDate: null };
    const result = evaluateOfflineSubscriptionAccess(school, new Date('2030-01-01T00:00:00.000Z'));
    assert.equal(result.hasAccess, true, 'an open-ended active subscription (no end date) must not be treated as expired');
  });
});
