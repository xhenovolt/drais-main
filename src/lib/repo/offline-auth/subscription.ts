/**
 * @drais/repo — offline subscription-access evaluation.
 *
 * DRAIS V2, Phase 7 sub-effort 7. Closes the loop on the user's confirmed
 * design (2026-08-21): "the subscription is carried with them" at
 * provisioning time; a local install evaluates access against that
 * carried snapshot, no network call.
 *
 * NOT built on src/lib/subscription.ts's classifyPlan(), despite that
 * function being pure and tempting to reuse — a real bug, caught by
 * actually running this file's own test, not assumed: classifyPlan() FAILS
 * OPEN (returns expired:false, i.e. "has access") when every subscription
 * field is null. That's fine for classifyPlan()'s real purpose — labeling
 * an already-fetched, always-real row for a platform dashboard — but wrong
 * for an access GATE, where "we genuinely don't know this school's
 * subscription state" must mean no access, not access granted.
 *
 * The function actually used for access online is getSubscriptionInfo()'s
 * own inline `hasAccess = status === 'active' || status === 'trial'` plus
 * its auto-expiry-by-date checks (src/lib/subscription.ts:163-197) — but
 * that function is not pure (it queries the DB and writes auto-expiry
 * updates back to it) and isn't factored out as a reusable rule on its
 * own. Rather than touch that live file to extract one, this function
 * mirrors its access rule directly — deliberately duplicated logic, not
 * imported, consistent with §25a's accepted tradeoff (online code stays
 * untouched; a small, independently-tested duplicate is the cost of that).
 */
import type { SchoolRecord } from '../contract/types';

export interface OfflineSubscriptionAccess {
  hasAccess: boolean;
  /** The status this evaluation effectively used — 'expired' when an
   *  active/trial subscription's own end date has already passed, even if
   *  the carried status string still says otherwise (a stale snapshot
   *  that outlived its own end date, same auto-expiry rule as online). */
  effectiveStatus: SchoolRecord['subscriptionStatus'] | 'expired';
}

/** Mirrors getSubscriptionInfo()'s access rule exactly (src/lib/
 *  subscription.ts:163-197), evaluated against a SchoolRecord's carried
 *  snapshot instead of a live query. Fails CLOSED: any status other than
 *  'active'/'trial' — including null/undefined, i.e. "we don't know" —
 *  has no access. */
export function evaluateOfflineSubscriptionAccess(school: SchoolRecord, now: Date = new Date()): OfflineSubscriptionAccess {
  const status = school.subscriptionStatus;
  const trialEnd = school.trialEndDate ? new Date(school.trialEndDate) : null;
  const subEnd = school.subscriptionEndDate ? new Date(school.subscriptionEndDate) : null;

  const trialPassedEndDate = status === 'trial' && trialEnd !== null && trialEnd.getTime() < now.getTime();
  const subPassedEndDate = status === 'active' && subEnd !== null && subEnd.getTime() < now.getTime();

  const effectiveStatus: OfflineSubscriptionAccess['effectiveStatus'] =
    trialPassedEndDate || subPassedEndDate ? 'expired' : status;

  return {
    hasAccess: effectiveStatus === 'active' || effectiveStatus === 'trial',
    effectiveStatus,
  };
}
