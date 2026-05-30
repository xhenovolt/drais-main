/**
 * Canonical identity resolver — the single answer to "who is this?"
 * across the entire DRAIS data surface.
 *
 * Phase 0 found four divergent identity strategies across the codebase:
 *   - Students importer: name + class fuzzy
 *   - ZKTeco attendance: device_users table by (device_id, device_user_id)
 *   - Dahua attendance: CardNo assumed to BE the identity (broken)
 *   - WebAuthn biometric: credential_id direct lookup
 *
 * This module collapses all four into one. Every importer, every
 * adapter, every script that needs to ask "is this a known person?"
 * goes through resolveIdentity(claim, lookup).
 *
 * Design contract:
 *   - PURE — the resolver itself does no DB I/O. Callers supply a
 *     PersonLookup interface (defined below) that owns the DB queries.
 *     This keeps the resolver testable in isolation AND lets the same
 *     resolver run server-side (mysql2) or in a future offline client
 *     (sqlite).
 *   - DETERMINISTIC ordering of signals — the strongest signal that
 *     resolves to a unique person wins. Order is documented per signal
 *     so audits can replay the decision.
 *   - NEVER assumes a single signal is enough — even an exact
 *     admission_no match cross-checks against name when supplied, and
 *     downgrades confidence on disagreement (catches mis-keyed
 *     admission numbers).
 *   - NEVER silently picks one of multiple matches — ambiguous results
 *     are returned as `fuzzy-ambiguous` so the caller surfaces them to
 *     the human review queue.
 */

import type { IdentityClaim, ResolvedIdentity } from '../types';
import { combinedScore, normalizeHeader } from '../schema-inference/fuzzy';

/**
 * DB lookup contract. Implementations live near the data layer; the
 * resolver doesn't know about mysql2 / TiDB / SQLite. Each method is
 * allowed to return [] when nothing matches.
 */
export interface PersonLookup {
  /** Strict admission_no match within the school. Returns 0 or 1 row. */
  byAdmissionNo(admissionNo: string, schoolId: number): Promise<PersonRow[]>;
  /** Credential lookup — student_fingerprints OR staff_fingerprints. */
  byCredentialId(credentialId: string, schoolId: number): Promise<PersonRow[]>;
  /** Device-user mapping lookup — for (device_serial, device_user_id). */
  byDeviceMapping(
    deviceUserId: string,
    deviceSerial: string,
    schoolId: number,
  ): Promise<PersonRow[]>;
  /** Broad name search — case-insensitive prefix on first AND last name
   *  within the school. May return many rows; resolver ranks them. */
  byNamePrefix(
    firstName: string,
    lastName: string,
    schoolId: number,
    options?: { className?: string; streamName?: string },
  ): Promise<PersonRow[]>;
}

export interface PersonRow {
  personId: number;
  /** Person role at time of lookup. Resolver propagates this back. */
  role: 'student' | 'staff' | 'guardian';
  admissionNo: string | null;
  firstName: string | null;
  lastName: string | null;
  otherName: string | null;
  /** Active enrollment's class name, for student rows. */
  className: string | null;
  streamName: string | null;
}

export interface ResolveOptions {
  /** Below this confidence, even a single candidate is returned as
   *  `fuzzy-ambiguous` so the caller asks for human confirmation.
   *  Default 0.85. */
  autoApplyThreshold?: number;
  /** When fuzzy-matching by name, the minimum combined score required
   *  for a candidate to be considered at all. Default 0.70. */
  nameMatchFloor?: number;
}

/**
 * The resolver itself. ALWAYS returns a ResolvedIdentity — never throws,
 * never returns null. A clean miss is matchType='no-match' with
 * personId=null.
 */
export async function resolveIdentity(
  claim: IdentityClaim,
  schoolId: number,
  lookup: PersonLookup,
  options: ResolveOptions = {},
): Promise<ResolvedIdentity> {
  const autoApply = options.autoApplyThreshold ?? 0.85;
  const nameFloor = options.nameMatchFloor ?? 0.70;

  // 1. Credential ID — strongest. A WebAuthn credential is enrolled to
  //    exactly one person; if it matches, we trust it.
  if (claim.credentialId) {
    const rows = await lookup.byCredentialId(claim.credentialId, schoolId);
    if (rows.length === 1) {
      return makeMatch(rows[0], 'credential-exact', 1.0,
        `credential ${claim.credentialId} enrolled to person ${rows[0].personId}`);
    }
    if (rows.length > 1) {
      return makeAmbiguous(rows, 'credential-exact',
        `credential ${claim.credentialId} has ${rows.length} active enrolments — review required`);
    }
  }

  // 2. Admission number — also strong, BUT cross-check against name
  //    when caller supplies it. Catches mis-keyed admission numbers.
  if (claim.admissionNo) {
    const rows = await lookup.byAdmissionNo(claim.admissionNo, schoolId);
    if (rows.length === 1) {
      const row = rows[0];
      const nameAgreement = nameAgrees(claim, row);
      // Strict admission match with confirming name → 1.0.
      // Strict admission match with no name supplied → 0.95 (still
      // strong, but we leave room for cross-check elsewhere).
      // Strict admission match with DISAGREEING name → 0.60 + AMBIGUOUS,
      // so the caller asks "did you mean a different person?".
      if (nameAgreement.supplied && !nameAgreement.agrees) {
        return {
          personId: null,
          matchType: 'fuzzy-ambiguous',
          confidence: 0.60,
          candidates: [{
            personId: row.personId,
            confidence: 0.60,
            reason: `admission ${claim.admissionNo} matches but name disagrees`,
          }],
          reason: 'admission_no matched but name does not agree — human review required',
        };
      }
      return makeMatch(row, 'admission-exact',
        nameAgreement.supplied ? 1.0 : 0.95,
        `admission_no ${claim.admissionNo} matched`);
    }
    if (rows.length > 1) {
      // Schools sometimes reuse admission numbers across years. Surface.
      return makeAmbiguous(rows, 'admission-exact',
        `admission_no ${claim.admissionNo} matches ${rows.length} people`);
    }
  }

  // 3. Device mapping — looked up via the zk_user_mapping / device_users
  //    table. Replaces the Dahua "CardNo IS the identity" assumption.
  if (claim.deviceUserId && claim.deviceSerial) {
    const rows = await lookup.byDeviceMapping(
      claim.deviceUserId, claim.deviceSerial, schoolId,
    );
    if (rows.length === 1) {
      return makeMatch(rows[0], 'device-mapping-exact', 1.0,
        `device ${claim.deviceSerial} user ${claim.deviceUserId} mapped`);
    }
    if (rows.length > 1) {
      return makeAmbiguous(rows, 'device-mapping-exact',
        `device ${claim.deviceSerial} user ${claim.deviceUserId} maps to ${rows.length} people`);
    }
  }

  // 4. Name + class fuzzy — last resort. Most error-prone signal.
  if (claim.firstName && claim.lastName) {
    const rows = await lookup.byNamePrefix(
      claim.firstName, claim.lastName, schoolId,
      { className: claim.className, streamName: claim.streamName },
    );
    if (rows.length === 0) {
      return {
        personId: null,
        matchType: 'no-match',
        confidence: 0,
        candidates: [],
        reason: `no person matches name "${claim.firstName} ${claim.lastName}"`,
      };
    }
    // Rank candidates by combined name score.
    const ranked = rows
      .map(row => ({
        row,
        score: scoreNameAgreement(claim, row),
      }))
      .filter(c => c.score >= nameFloor)
      .sort((a, b) => b.score - a.score);

    if (ranked.length === 0) {
      return {
        personId: null,
        matchType: 'no-match',
        confidence: 0,
        candidates: [],
        reason: `name candidates exist but none score above ${nameFloor}`,
      };
    }

    if (ranked.length === 1 && ranked[0].score >= autoApply) {
      return makeMatch(ranked[0].row, 'name-class-exact', ranked[0].score,
        `name+class fuzzy match score ${ranked[0].score.toFixed(2)}`);
    }
    // Single candidate below auto-apply, or multiple candidates — AMBIGUOUS.
    return {
      personId: null,
      matchType: 'fuzzy-ambiguous',
      confidence: ranked[0].score,
      candidates: ranked.slice(0, 5).map(c => ({
        personId: c.row.personId,
        confidence: Math.round(c.score * 100) / 100,
        reason: `name+class score ${c.score.toFixed(2)}`,
      })),
      reason: ranked.length === 1
        ? `single candidate below auto-apply threshold ${autoApply}`
        : `${ranked.length} candidates — review required`,
    };
  }

  return {
    personId: null,
    matchType: 'no-match',
    confidence: 0,
    candidates: [],
    reason: 'no resolvable identity signal in claim',
  };
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeMatch(
  row: PersonRow,
  matchType: ResolvedIdentity['matchType'],
  confidence: number,
  reason: string,
): ResolvedIdentity {
  return {
    personId: row.personId,
    matchType,
    confidence,
    candidates: [],
    reason,
  };
}

function makeAmbiguous(
  rows: PersonRow[],
  preferredType: ResolvedIdentity['matchType'],
  reason: string,
): ResolvedIdentity {
  return {
    personId: null,
    matchType: 'fuzzy-ambiguous',
    confidence: 0.5,
    candidates: rows.slice(0, 5).map(r => ({
      personId: r.personId,
      confidence: 0.5,
      reason: `candidate from ${preferredType}`,
    })),
    reason,
  };
}

function nameAgrees(
  claim: IdentityClaim,
  row: PersonRow,
): { supplied: boolean; agrees: boolean } {
  if (!claim.firstName && !claim.lastName) return { supplied: false, agrees: true };
  const score = scoreNameAgreement(claim, row);
  return { supplied: true, agrees: score >= 0.7 };
}

function scoreNameAgreement(claim: IdentityClaim, row: PersonRow): number {
  const claimFirst = normalizeHeader(claim.firstName ?? '');
  const claimLast = normalizeHeader(claim.lastName ?? '');
  const rowFirst = normalizeHeader(row.firstName ?? '');
  const rowLast = normalizeHeader(row.lastName ?? '');
  // Compare BOTH orderings (some sources flip first/last).
  const direct = (
    (claimFirst ? combinedScore(claimFirst, rowFirst) : 1)
    + (claimLast ? combinedScore(claimLast, rowLast) : 1)
  ) / 2;
  const swapped = (
    (claimFirst ? combinedScore(claimFirst, rowLast) : 1)
    + (claimLast ? combinedScore(claimLast, rowFirst) : 1)
  ) / 2;
  let score = Math.max(direct, swapped);

  // Boost when class/stream agrees.
  if (claim.className && row.className) {
    if (normalizeHeader(claim.className) === normalizeHeader(row.className)) {
      score = Math.min(1, score + 0.1);
    }
  }
  if (claim.streamName && row.streamName) {
    if (normalizeHeader(claim.streamName) === normalizeHeader(row.streamName)) {
      score = Math.min(1, score + 0.05);
    }
  }
  return score;
}
