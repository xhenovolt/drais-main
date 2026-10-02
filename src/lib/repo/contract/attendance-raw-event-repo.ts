/**
 * @drais/repo-contract — AttendanceRawEventRepo interface.
 *
 * `attendance_raw_events` is APPEND_ONLY per §7/§12.3 — the real system's
 * own dedup key (school_id, device_sn, device_user_id, punch_at, source)
 * makes a duplicate device re-send routine, not an error. `create()`
 * reflects that: it returns whether the row was actually inserted rather
 * than throwing on a duplicate, matching src/lib/attendance/engine.ts's
 * recordRawEvent() semantics (INSERT IGNORE), not StudentRepo's
 * throw-on-duplicate-admission_no behavior — a genuinely different kind
 * of uniqueness (identity conflict vs. expected idempotent re-delivery).
 */
import type { AttendanceRawEventRecord, NewAttendanceRawEventInput } from './types';

export interface CreateRawEventResult {
  inserted: boolean;
  record: AttendanceRawEventRecord;
}

export interface AttendanceRawEventRepo {
  findById(schoolId: number, id: number): Promise<AttendanceRawEventRecord | null>;
  /** Idempotent by design — see this file's header. `inserted: false`
   *  means the dedup key already existed; `record` is always the
   *  (existing-or-new) row either way. */
  create(input: NewAttendanceRawEventInput): Promise<CreateRawEventResult>;
  listByPersonAndDateRange(schoolId: number, personId: number, fromDate: string, toDate: string): Promise<AttendanceRawEventRecord[]>;
  /** Phase 7 sub-effort 19. The append-only invariant in this file's
   *  header is about REAL device data, which a biometric terminal
   *  reported and which stays immutable forever. A punch this layer
   *  itself created (source='manual', via the offline marking screen)
   *  is different — the one thing this layer can create, it can also
   *  undo before it's treated as settled fact. Implementations MUST
   *  refuse (RepoError) to delete any row whose source isn't 'manual',
   *  so this can never become a backdoor to erase real device history. */
  deleteManualEvent(schoolId: number, id: number): Promise<void>;
}
