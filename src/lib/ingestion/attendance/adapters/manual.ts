/**
 * Manual / WebAuthn / CSV adapters — the simpler half of the attendance
 * vendor set. Same canonical event shape; identity resolution still goes
 * through the central resolver so behaviour is consistent across the four
 * existing legacy paths (bulk-mark, biometric, manual mark, CSV import).
 */

import type { AttendanceAdapter, AttendanceAdapterResult } from '../event';
import { buildEvent, toCanonicalIsoUtc } from '../event';
import type { AttendanceEvent } from '../../types';

// ─── Manual bulk-mark adapter ────────────────────────────────────────────────
// Replaces the per-row loop in /api/attendance/bulk-mark.
//
// Caller passes a list of (studentId, date, presentOrAbsent). The adapter
// emits a synthetic check-in event for each present student. Direction is
// 'in' (we don't model "marked absent" as an event — absence is the
// absence of an event, per the canonical model).

interface ManualMarkPayload {
  vendor: 'manual';
  /** ISO date for the mark — adapter constructs the timestamp at the
   *  school's "session start" time (caller-supplied). */
  date: string;          // YYYY-MM-DD
  /** "session start" time in the school's local zone, HH:MM. Used for the
   *  synthetic timestamp. */
  sessionStartHHMM: string;
  marks: Array<{
    personId: number;
    personRole: 'student' | 'staff';
    present: boolean;
  }>;
}

export const manualMarkAdapter: AttendanceAdapter<ManualMarkPayload> = {
  vendor: 'manual',

  canHandle(payload: unknown): payload is ManualMarkPayload {
    return (
      typeof payload === 'object'
      && payload !== null
      && (payload as { vendor?: string }).vendor === 'manual'
      && Array.isArray((payload as { marks?: unknown }).marks)
    );
  },

  async adapt(payload, _resolver, options) {
    const events: AttendanceEvent[] = [];
    const errors: AttendanceAdapterResult['errors'] = [];

    const [hh, mm] = payload.sessionStartHHMM.split(':').map(n => Number.parseInt(n, 10));
    if (Number.isNaN(hh) || Number.isNaN(mm)) {
      errors.push({
        locator: 'sessionStartHHMM',
        message: `invalid HH:MM "${payload.sessionStartHHMM}"`,
        category: 'payload',
      });
      return { events, errors, orphanedCount: 0 };
    }

    const baseIso = `${payload.date}T${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00Z`;
    const ts = toCanonicalIsoUtc(baseIso);
    if (!ts) {
      errors.push({
        locator: 'date+sessionStartHHMM',
        message: `unparseable date "${payload.date}"`,
        category: 'timestamp',
      });
      return { events, errors, orphanedCount: 0 };
    }

    for (let i = 0; i < payload.marks.length; i++) {
      const m = payload.marks[i];
      if (!m.present) continue; // absence is not an event

      events.push(
        buildEvent({
          personId: m.personId,
          personRole: m.personRole,
          timestampUtc: ts,
          direction: 'in',
          method: 'manual',
          vendor: 'manual',
          rawPayloadRef: options?.rawPayloadRef,
          lateAfterHHMM: options?.lateAfterHHMM,
        }),
      );
    }

    return { events, errors, orphanedCount: 0 };
  },
};

// ─── WebAuthn adapter ────────────────────────────────────────────────────────
// Replaces /api/attendance/biometric. The credentialId is mapped to a
// person via the central identity resolver (which consults
// student_fingerprints under the hood). The "late after 8:30 AM"
// hardcode from the legacy route is replaced by options.lateAfterHHMM
// supplied by the caller from school settings.

interface WebAuthnPayload {
  vendor: 'webauthn';
  credentialId: string;
  timestampUtc?: string;        // default = "now"
  direction?: AttendanceEvent['direction'];
}

export const webauthnAdapter: AttendanceAdapter<WebAuthnPayload> = {
  vendor: 'webauthn',

  canHandle(payload: unknown): payload is WebAuthnPayload {
    return (
      typeof payload === 'object'
      && payload !== null
      && (payload as { vendor?: string }).vendor === 'webauthn'
      && typeof (payload as { credentialId?: string }).credentialId === 'string'
    );
  },

  async adapt(payload, resolver, options) {
    const events: AttendanceEvent[] = [];
    const errors: AttendanceAdapterResult['errors'] = [];
    let orphanedCount = 0;

    const ts = toCanonicalIsoUtc(payload.timestampUtc ?? new Date());
    if (!ts) {
      errors.push({ locator: 'timestampUtc', message: 'unparseable', category: 'timestamp' });
      return { events, errors, orphanedCount };
    }

    const identity = await resolver({ credentialId: payload.credentialId });
    if (identity.personId == null || identity.personRole == null) {
      orphanedCount++;
      errors.push({
        locator: 'credentialId',
        message: `credential ${payload.credentialId} not enrolled to any DRAIS person`,
        category: 'identity',
      });
      return { events, errors, orphanedCount };
    }

    events.push(
      buildEvent({
        personId: identity.personId,
        personRole: identity.personRole,
        timestampUtc: ts,
        direction: payload.direction ?? options?.defaultDirection ?? 'in',
        method: 'fingerprint',
        vendor: 'webauthn',
        rawPayloadRef: options?.rawPayloadRef,
        lateAfterHHMM: options?.lateAfterHHMM,
      }),
    );

    return { events, errors, orphanedCount };
  },
};

// ─── Registry — adapters callers register with the runtime ─────────────────

import { zktecoAdapter } from './zkteco';
import { dahuaAdapter } from './dahua';

/**
 * The runtime registry. Routes call attendanceAdapters.find(a =>
 * a.canHandle(payload)) to pick the right adapter. New vendors just
 * register here — no router changes needed.
 */
export const attendanceAdapters: ReadonlyArray<AttendanceAdapter<any>> = [
  zktecoAdapter,
  dahuaAdapter,
  webauthnAdapter,
  manualMarkAdapter,
];
