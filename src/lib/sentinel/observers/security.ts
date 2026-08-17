/**
 * DRAIS Sentinel — security observer.
 *
 * Reads the EXISTING audit_logs table (src/lib/audit.ts) — no new logging,
 * no inline hook added to the login route. Login already writes LOGIN_FAILED
 * / LOGIN via logAudit(); Sentinel just reads the pattern periodically.
 * Keeping this read-only and out of auth.ts/login/route.ts is deliberate:
 * those are the most sensitive files in the repo and this task's own
 * discipline rule is "do not silently alter unrelated business logic."
 */
import { query } from '@/lib/db';
import type { Observation } from '../types';

export async function observeSecurity(): Promise<Observation[]> {
  const observations: Observation[] = [];

  // Bruteforce-shaped pattern: many LOGIN_FAILED from the same school in a
  // short window (login-lockout.ts already blocks the account; this is the
  // platform-visibility layer on top — "is someone hammering this school").
  const bursts = (await query(
    `SELECT school_id, s.name, COUNT(*) n
       FROM audit_logs a LEFT JOIN schools s ON s.id = a.school_id
      WHERE a.action = 'LOGIN_FAILED' AND a.created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE)
      GROUP BY school_id, s.name
     HAVING n >= 15`,
  ).catch(() => [])) as Array<{ school_id: number; name: string; n: number }>;

  for (const row of bursts) {
    observations.push({
      kind: 'auth_bruteforce_pattern',
      observer: 'security',
      schoolId: Number(row.school_id) || null,
      module: 'Authentication',
      severity: row.n >= 50 ? 'high' : 'medium',
      confidence: 80,
      probableCause: 'A burst of failed logins against this school in a short window — credential-stuffing or a locked-out user retrying, not yet distinguishable.',
      userImpact: 'None yet if per-account lockout is holding; risk of legitimate users being locked out as collateral.',
      technicalImpact: `${row.n} LOGIN_FAILED event(s) in the last 15 minutes.`,
      evidence: [{ label: 'Failed logins (15m)', value: row.n }],
      recommendedAction: 'Review audit_logs for this school; confirm per-account lockout is engaging; consider IP-level throttling if not yet in place.',
      autoRemediationSafe: false,
      notifyRequired: row.n >= 50,
      dedupKey: `auth_bruteforce_pattern::${row.school_id ?? 'global'}::login`,
    });
  }

  // Privilege anomaly: a role grant/permission change outside business hours
  // or an unusual volume of role changes in a short window.
  const roleChanges = (await query(
    `SELECT school_id, COUNT(*) n FROM audit_logs
      WHERE action IN ('UPDATED_ROLE_PERMISSIONS','ASSIGNED_ROLE') AND created_at >= DATE_SUB(NOW(), INTERVAL 30 MINUTE)
      GROUP BY school_id HAVING n >= 10`,
  ).catch(() => [])) as Array<{ school_id: number; n: number }>;

  for (const row of roleChanges) {
    observations.push({
      kind: 'auth_privilege_anomaly',
      observer: 'security',
      schoolId: Number(row.school_id) || null,
      module: 'RBAC',
      severity: 'medium',
      confidence: 65,
      probableCause: 'An unusually high volume of role/permission changes in a short window — could be legitimate bulk admin work or a compromised admin account.',
      userImpact: 'None directly observable; flagged for review given the sensitivity of permission changes.',
      technicalImpact: `${row.n} role/permission change(s) in 30 minutes.`,
      evidence: [{ label: 'Role changes (30m)', value: row.n }],
      recommendedAction: 'Review audit_logs for this school to confirm the changes were expected.',
      autoRemediationSafe: false,
      notifyRequired: false,
      dedupKey: `auth_privilege_anomaly::${row.school_id ?? 'global'}::rbac`,
    });
  }

  return observations;
}
