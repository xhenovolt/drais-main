/**
 * AttendanceEvent — vendor-agnostic canonical event + the adapter contract.
 *
 * Phase 0 found 4 attendance ingestion paths writing to TWO different
 * physical tables with three different identity conventions:
 *   - ZKTeco TCP   uses `userID`            → lookup `device_users` table
 *   - Dahua HTTP   uses `CardNo`            → assumed-to-be-identity (broken)
 *   - WebAuthn     uses `credential_id`     → lookup `student_fingerprints`
 *   - Manual       uses `student_id`        → direct pass-through
 *
 * This module fixes that asymmetry by:
 *   1. Defining ONE canonical event (`AttendanceEvent` in ../types.ts).
 *   2. Defining ONE adapter shape (`AttendanceAdapter` below) that each
 *      vendor implements. Adapters convert vendor-shaped payloads INTO
 *      AttendanceEvent[]; they DO NOT write to DB.
 *   3. Forwarding identity resolution to the central identity module
 *      (../identity/index.ts) so the four divergent strategies collapse
 *      into one.
 *
 * Migration plan (Phase 2+, NOT this commit):
 *   - Wrap existing /api/attendance/zk-tcp, /api/attendance/dahua,
 *     /api/attendance/biometric, /api/attendance/bulk-mark routes so they
 *     parse → run adapter → emit AttendanceEvent[] → single canonical
 *     storage path. The legacy `attendance` and `dahua_attendance_logs`
 *     tables converge into one (the latter becomes a raw-payload archive).
 *
 * This file: types + adapter shape + helper builders only. No DB. No I/O.
 */

import type { AttendanceEvent, IdentityClaim } from '../types';

// ─── Adapter contract ────────────────────────────────────────────────────────

/**
 * A vendor adapter consumes a vendor-shaped payload, applies identity
 * resolution via a caller-supplied `resolveIdentity`, and emits
 * canonical AttendanceEvent[]. Adapters are PURE — they do not write
 * to DB and do not throw on per-row failures; they emit
 * `AttendanceAdapterResult.errors` instead.
 */
export interface AttendanceAdapter<TVendorPayload> {
  /** Vendor name. Set on AttendanceEvent.source.vendor. */
  vendor: AttendanceEvent['source']['vendor'];
  /** Pre-flight check: can this adapter handle this payload? Lets the
   *  router pick adapters by sniffing. */
  canHandle(payload: unknown): payload is TVendorPayload;
  /** Convert one vendor payload into N canonical events. */
  adapt(
    payload: TVendorPayload,
    resolver: AttendanceIdentityResolver,
    options?: AttendanceAdapterOptions,
  ): Promise<AttendanceAdapterResult>;
}

/**
 * Adapter-owned identity resolution. The pipeline supplies this so the
 * adapter doesn't need DB access. Implementations live in the identity
 * module and the runtime wires them together.
 */
export type AttendanceIdentityResolver = (claim: IdentityClaim) => Promise<{
  personId: number | null;
  personRole: 'student' | 'staff' | null;
  /** 0..1. Below the school's threshold → adapter still emits the event
   *  with personId, but flags it for review (TBD: per-school review queue). */
  confidence: number;
}>;

export interface AttendanceAdapterOptions {
  /** Late-arrival cutoff in HH:MM (24h, school local). Replaces the
   *  hardcoded "8:30 AM" from biometric/route.ts. NULL = never late. */
  lateAfterHHMM?: string | null;
  /** Default direction when the device payload doesn't say. Most schools
   *  treat ambiguous scans as check-in. */
  defaultDirection?: AttendanceEvent['direction'];
  /** Persist the raw payload pointer onto AttendanceEvent.source.rawPayloadRef. */
  rawPayloadRef?: string;
}

export interface AttendanceAdapterResult {
  /** Successfully canonicalised events. */
  events: AttendanceEvent[];
  /** Per-payload errors. The pipeline aggregates these into the run report
   *  rather than throwing — so a bad row in a batch of 500 doesn't lose
   *  the other 499. */
  errors: Array<{
    /** Pointer into the vendor payload (record index, sub-key, etc.). */
    locator: string;
    /** Why this row didn't canonicalise. */
    message: string;
    /** Was the identity unresolvable, vs malformed payload, vs other? */
    category: 'identity' | 'payload' | 'timestamp' | 'other';
  }>;
  /** Count of records the adapter saw but skipped because resolveIdentity
   *  returned a confidence below the auto-apply threshold. These should
   *  land in an orphan queue. */
  orphanedCount: number;
}

// ─── Helpers — used by adapters, useful in tests ─────────────────────────────

/**
 * Decide late-ness from a UTC timestamp + school-local cutoff. Returns
 * false when cutoff is null. School timezone is the caller's
 * responsibility — pass an already-localised cutoff if the school is
 * not in UTC.
 */
export function computeIsLate(
  timestampUtc: string,
  cutoffHHMM: string | null | undefined,
): boolean {
  if (!cutoffHHMM) return false;
  const [hh, mm] = cutoffHHMM.split(':').map(n => Number.parseInt(n, 10));
  if (Number.isNaN(hh) || Number.isNaN(mm)) return false;
  const dt = new Date(timestampUtc);
  if (Number.isNaN(dt.getTime())) return false;
  const tsMinutes = dt.getUTCHours() * 60 + dt.getUTCMinutes();
  const cutoffMinutes = hh * 60 + mm;
  return tsMinutes > cutoffMinutes;
}

/**
 * Convert assorted timestamp shapes — UNIX seconds, UNIX milliseconds,
 * ISO 8601, "YYYY-MM-DD HH:MM:SS" — into a canonical UTC ISO string.
 * Returns null when the input is unparseable; adapters surface that as
 * a 'timestamp' error.
 */
export function toCanonicalIsoUtc(input: unknown): string | null {
  if (input == null || input === '') return null;
  if (input instanceof Date) {
    return Number.isNaN(input.getTime()) ? null : input.toISOString();
  }
  // UNIX seconds (10 digits) or milliseconds (13 digits).
  if (typeof input === 'number' && Number.isFinite(input)) {
    const ms = input < 1e12 ? input * 1000 : input;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof input === 'string') {
    // All-digits string → assume UNIX seconds.
    if (/^\d{10}$/.test(input)) {
      return new Date(Number.parseInt(input, 10) * 1000).toISOString();
    }
    if (/^\d{13}$/.test(input)) {
      return new Date(Number.parseInt(input, 10)).toISOString();
    }
    const d = new Date(input);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

/**
 * Build a base event with the boilerplate filled in. Adapters call this
 * with their domain-specific pieces; ensures every canonical event has
 * source/method/timestampUtc/isLate set consistently.
 */
export function buildEvent(args: {
  personId: number;
  personRole: 'student' | 'staff';
  timestampUtc: string;
  direction: AttendanceEvent['direction'];
  method: AttendanceEvent['method'];
  vendor: AttendanceEvent['source']['vendor'];
  deviceSerial?: string;
  deviceUserId?: string;
  rawPayloadRef?: string;
  lateAfterHHMM?: string | null;
  vendorExtras?: Record<string, unknown>;
  geo?: { lat: number; lng: number };
}): AttendanceEvent {
  return {
    personId: args.personId,
    personRole: args.personRole,
    timestampUtc: args.timestampUtc,
    direction: args.direction,
    method: args.method,
    source: {
      vendor: args.vendor,
      deviceSerial: args.deviceSerial,
      deviceUserId: args.deviceUserId,
      rawPayloadRef: args.rawPayloadRef,
    },
    isLate: computeIsLate(args.timestampUtc, args.lateAfterHHMM),
    geo: args.geo,
    vendorExtras: args.vendorExtras,
  };
}
