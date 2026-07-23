/**
 * Identity Intelligence (Phase 8 of the Intelligence Program).
 *
 * Rigid mappings become a graded, self-diagnosing surface. For a school we
 * compute an identity-health score and a prioritised list of issues, each
 * with a PROPOSED action — never an automatic change:
 *
 *   duplicate  one person mapped to several device PINs → propose MERGE
 *              (keep the most recently active enrollment)
 *   unknown    a PIN producing punches with no confirmed person → propose MAP
 *   stale      an enrollment the device hasn't seen in a long time → REVIEW
 *   low_conf   a match that resolved on a weak score → REVIEW
 *
 * classifyIssues() and scoreIdentityHealth() are PURE and unit-tested. The
 * actual changes are performed only by the existing identity-matching /
 * enrollment flows after a human confirms — this layer diagnoses and routes.
 */

export type IdentityIssueKind = 'duplicate' | 'unknown' | 'stale' | 'low_conf';
export type IdentityAction = 'merge' | 'map' | 'review';

export interface DuplicateGroup {
  role_type: string; role_ref_id: number; name: string | null;
  enrollments: Array<{ pin: number; last_seen_days: number | null; enrolled_days: number | null }>;
}
export interface UnknownPin { device_sn: string | null; pin: string; events: number; last_event_days: number | null; suggested_name?: string | null; }
export interface StaleEnrollment { pin: number; name: string | null; role_type: string; last_seen_days: number; }

export interface IdentityIssue {
  kind: IdentityIssueKind; action: IdentityAction; severity: 'high' | 'medium' | 'low';
  subject: string; detail: string; recommendation: string;
  ref?: { role_type?: string; role_ref_id?: number; pin?: string | number; keep_pin?: number };
}

export interface IdentityInput {
  duplicates: DuplicateGroup[];
  unknowns: UnknownPin[];
  stales: StaleEnrollment[];
  totalEnrollments: number;
}

/** PURE: which enrollment to KEEP in a duplicate group — the most recently
 *  active on the device (fallback: most recently enrolled). */
export function chooseKeeper(g: DuplicateGroup): number {
  const scored = g.enrollments.map(e => ({
    pin: e.pin,
    // lower is better: prefer smallest last_seen_days, then smallest enrolled_days
    key: (e.last_seen_days ?? 9e9) * 1e6 + (e.enrolled_days ?? 9e9),
  }));
  scored.sort((a, b) => a.key - b.key);
  return scored[0].pin;
}

export function classifyIssues(input: IdentityInput): IdentityIssue[] {
  const issues: IdentityIssue[] = [];

  for (const g of input.duplicates) {
    if (g.enrollments.length < 2) continue;
    const keep = chooseKeeper(g);
    const drop = g.enrollments.filter(e => e.pin !== keep).map(e => e.pin);
    issues.push({
      kind: 'duplicate', action: 'merge', severity: 'high',
      subject: g.name || `${g.role_type} #${g.role_ref_id}`,
      detail: `Mapped to ${g.enrollments.length} device PINs (${g.enrollments.map(e => e.pin).join(', ')}). Attendance can double-count or split.`,
      recommendation: `Keep PIN ${keep} (most recently active) and unmap ${drop.join(', ')}.`,
      ref: { role_type: g.role_type, role_ref_id: g.role_ref_id, keep_pin: keep },
    });
  }

  for (const u of input.unknowns) {
    const recent = u.last_event_days != null && u.last_event_days <= 7;
    issues.push({
      kind: 'unknown', action: 'map', severity: recent && u.events >= 3 ? 'high' : 'medium',
      subject: `PIN ${u.pin}${u.device_sn ? ` on ${u.device_sn}` : ''}`,
      detail: `${u.events} punch(es) with no confirmed person${u.suggested_name ? ` — device name "${u.suggested_name}"` : ''}.`,
      recommendation: u.suggested_name
        ? `Likely "${u.suggested_name}" — confirm in Identity Matching.`
        : 'Map to a person via Detect & map / Identity Matching.',
      ref: { pin: u.pin, role_type: undefined },
    });
  }

  for (const s of input.stales) {
    issues.push({
      kind: 'stale', action: 'review', severity: 'low',
      subject: s.name || `${s.role_type} · PIN ${s.pin}`,
      detail: `Enrolled but the device hasn't recorded PIN ${s.pin} in ${s.last_seen_days} days.`,
      recommendation: 'Confirm the person is still enrolled on the device, or revoke the stale mapping.',
      ref: { pin: s.pin, role_type: s.role_type },
    });
  }

  const sev = { high: 0, medium: 1, low: 2 };
  return issues.sort((a, b) => sev[a.severity] - sev[b.severity]);
}

/** PURE: 0..100 identity-health score for the school. */
export function scoreIdentityHealth(input: IdentityInput): { score: number; band: 'clean' | 'minor' | 'attention'; summary: string } {
  const dup = input.duplicates.length;
  const unk = input.unknowns.length;
  const stale = input.stales.length;
  // Duplicates are the worst (silent double-counting); unknowns next; stale mild.
  const penalty = Math.min(100, dup * 12 + unk * 3 + stale * 1);
  const score = Math.max(0, 100 - penalty);
  const band = score >= 90 ? 'clean' : score >= 70 ? 'minor' : 'attention';
  const parts = [];
  if (dup) parts.push(`${dup} duplicate mapping${dup === 1 ? '' : 's'}`);
  if (unk) parts.push(`${unk} unknown PIN${unk === 1 ? '' : 's'}`);
  if (stale) parts.push(`${stale} stale enrollment${stale === 1 ? '' : 's'}`);
  return { score, band, summary: parts.length ? parts.join(' · ') : 'All device identities are clean' };
}
