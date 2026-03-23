/**
 * DRAIS Subscription & Trial Utility
 *
 * Server-side helpers for evaluating school subscription state.
 * These run inside API routes and server components — never on Edge Runtime.
 */

import { query } from '@/lib/db';

// ============================================
// TYPES
// ============================================

export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'expired';
export type SubscriptionType   = 'none' | 'trial' | 'monthly' | 'yearly';

export interface SubscriptionInfo {
  schoolId: number;
  schoolName: string;
  subscriptionStatus: SubscriptionStatus;
  subscriptionType: SubscriptionType;
  trialStartDate: Date | null;
  trialEndDate: Date | null;
  subscriptionStartDate: Date | null;
  subscriptionEndDate: Date | null;
  /** Days remaining in trial (null if not on trial or already expired) */
  trialDaysRemaining: number | null;
  /** Days remaining on paid subscription (null if not active paid plan) */
  subscriptionDaysRemaining: number | null;
  isTrialExpired: boolean;
  isSubscriptionExpired: boolean;
  hasAccess: boolean;
}

export interface SubscriptionCheckResult {
  allowed: boolean;
  info: SubscriptionInfo | null;
  reason?: 'expired' | 'inactive' | 'not_found';
}

// ============================================
// HELPERS
// ============================================

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

// ============================================
// CORE: FETCH & EVALUATE SUBSCRIPTION
// ============================================

/**
 * Fetch school subscription row and compute derived access state.
 * Also auto-marks expired trials in the database.
 */
export async function getSubscriptionInfo(schoolId: number): Promise<SubscriptionInfo | null> {
  // Select only core columns that exist in the current schema.
  // Extended columns (trial/subscription dates, subscription_type) are optional
  // — they may not yet exist in older deployments so we handle their absence gracefully.
  const rows = await query(
    `SELECT
       id,
       name,
       subscription_status,
       subscription_plan
     FROM schools
     WHERE id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [schoolId]
  );

  if (!rows || rows.length === 0) return null;
  const row = rows[0] as any;

  const now = new Date();

  // Date columns may not exist in this schema version — default to null
  const trialEndDate: Date | null    = row.trial_end_date          ? new Date(row.trial_end_date)          : null;
  const subEndDate: Date | null      = row.subscription_end_date   ? new Date(row.subscription_end_date)   : null;
  const trialStartDate: Date | null  = row.trial_start_date        ? new Date(row.trial_start_date)        : null;
  const subStartDate: Date | null    = row.subscription_start_date ? new Date(row.subscription_start_date) : null;

  let status: SubscriptionStatus = row.subscription_status as SubscriptionStatus;

  // Auto-expire: trial window has passed but DB still says 'trial'
  const isTrialExpired = status === 'trial' && trialEndDate !== null && trialEndDate < now;
  if (isTrialExpired) {
    status = 'expired';
    // Fire-and-forget DB update (don't await to keep this path fast)
    query(
      `UPDATE schools SET subscription_status = 'expired', updated_at = NOW() WHERE id = ?`,
      [schoolId]
    ).catch(() => {});
  }

  // Paid subscription end check
  const isSubscriptionExpired =
    status === 'active' &&
    subEndDate !== null &&
    subEndDate < now;

  if (isSubscriptionExpired) {
    status = 'expired';
    query(
      `UPDATE schools SET subscription_status = 'expired', updated_at = NOW() WHERE id = ?`,
      [schoolId]
    ).catch(() => {});
  }

  const trialDaysRemaining: number | null =
    status === 'trial' && trialEndDate
      ? Math.max(0, daysBetween(now, trialEndDate))
      : null;

  const subscriptionDaysRemaining: number | null =
    status === 'active' && subEndDate
      ? Math.max(0, daysBetween(now, subEndDate))
      : null;

  const hasAccess = status === 'active' || status === 'trial';

  return {
    schoolId:                   Number(row.id),
    schoolName:                 row.name,
    subscriptionStatus:         status,
    subscriptionType:           (row.subscription_plan || row.subscription_type || 'none') as SubscriptionType,
    trialStartDate,
    trialEndDate,
    subscriptionStartDate:      subStartDate,
    subscriptionEndDate:        subEndDate,
    trialDaysRemaining,
    subscriptionDaysRemaining,
    isTrialExpired,
    isSubscriptionExpired,
    hasAccess,
  };
}

/**
 * Shortcut: returns `true` if the school may use the system, `false` otherwise.
 * Handles all status branches (active, trial, expired, inactive).
 */
export async function schoolHasAccess(schoolId: number): Promise<SubscriptionCheckResult> {
  const info = await getSubscriptionInfo(schoolId);
  if (!info) return { allowed: false, info: null, reason: 'not_found' };

  if (!info.hasAccess) {
    return {
      allowed: false,
      info,
      reason: info.subscriptionStatus === 'expired' ? 'expired' : 'inactive',
    };
  }

  return { allowed: true, info };
}

// ============================================
// TRIAL INITIALIZATION
// ============================================

/**
 * Called right after a new school is created during signup.
 * Sets a 30-day free trial on the school record.
 */
export async function initializeFreeTrial(schoolId: number): Promise<void> {
  const trialStart = new Date();
  const trialEnd = new Date(trialStart.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Update core columns always present, then attempt to set date/type columns
  // (they may be absent on older deployments — failures are intentionally swallowed)
  await query(
    `UPDATE schools
     SET
       subscription_status = 'trial',
       subscription_plan   = 'trial',
       updated_at          = NOW()
     WHERE id = ?`,
    [schoolId]
  );

  // Attempt to set extended trial columns (added via migration)
  await query(
    `UPDATE schools
     SET
       subscription_type  = 'trial',
       trial_start_date   = ?,
       trial_end_date     = ?,
       updated_at         = NOW()
     WHERE id = ?`,
    [trialStart, trialEnd, schoolId]
  ).catch(() => {
    // Columns may not exist yet — safe to ignore, trial will still function
  });
}

// ============================================
// ADMIN: ACTIVATE SUBSCRIPTION
// ============================================

export interface ActivateSubscriptionOpts {
  schoolId: number;
  type: 'monthly' | 'yearly';
  /** Override start date; defaults to NOW() */
  startDate?: Date;
}

export async function activateSubscription(opts: ActivateSubscriptionOpts): Promise<void> {
  const { schoolId, type } = opts;
  const start = opts.startDate ?? new Date();
  const months = type === 'yearly' ? 12 : 1;
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);

  // 1. Always update core status column (present in all schema versions)
  await query(
    `UPDATE schools
     SET subscription_status = 'active', updated_at = NOW()
     WHERE id = ?`,
    [schoolId]
  );

  // 2. Update extended columns — wrapped in catch because older deployments
  //    that haven't run migration 017/018 may not have these columns yet.
  await query(
    `UPDATE schools
     SET
       subscription_type       = ?,
       trial_start_date        = NULL,
       trial_end_date          = NULL,
       subscription_start_date = ?,
       subscription_end_date   = ?,
       updated_at              = NOW()
     WHERE id = ?`,
    [type, start, end, schoolId]
  ).catch((err) => {
    console.warn('[Subscription] Extended column UPDATE skipped (run migration 018):', err?.code ?? err?.message);
  });
}
