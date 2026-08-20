/**
 * @drais/repo-contract — shared domain types.
 *
 * DRAIS V2, Phase 3 (docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §8,
 * §25 Phase 3): the repository-abstraction layer the SQLite decision (§5)
 * requires. This module and its siblings under src/lib/repo/ are NEW files
 * only — nothing here is imported by any existing route or page yet, and
 * nothing in src/lib/db.ts, src/lib/db/pools.ts, or src/lib/db/db-mode.ts
 * is touched by this layer (§8.1 "API isolation" — non-negotiable).
 *
 * Pure types only. Zero I/O, zero DB driver imports — safe to import from
 * anywhere, including a future UI layer, without pulling in mysql2 or
 * better-sqlite3.
 */

/** ISO-8601 datetime string ("2026-08-19T06:41:51.000Z"), UTC. */
export type IsoDateTime = string;

/** Calendar date string ("YYYY-MM-DD"), no time component, no timezone. */
export type IsoDate = string;

export type SchoolStatus = 'active' | 'inactive' | 'suspended';

export interface SchoolRecord {
  id: number;
  name: string;
  legalName: string | null;
  shortCode: string | null;
  email: string | null;
  phone: string | null;
  currency: string;
  address: string | null;
  logoUrl: string | null;
  status: SchoolStatus;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface NewSchoolInput {
  name: string;
  legalName?: string | null;
  shortCode?: string | null;
  email?: string | null;
  phone?: string | null;
  currency?: string;
  address?: string | null;
  logoUrl?: string | null;
  status?: SchoolStatus;
}

export interface StudentRecord {
  id: number;
  schoolId: number;
  personId: number;
  admissionNo: string | null;
  villageId: number | null;
  admissionDate: IsoDate | null;
  status: string;
  notes: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface NewStudentInput {
  schoolId: number;
  personId: number;
  admissionNo?: string | null;
  villageId?: number | null;
  admissionDate?: IsoDate | null;
  status?: string;
  notes?: string | null;
}

export interface ListOptions {
  limit?: number;
  includeDeleted?: boolean;
}

// ── Phase 7: repository layer expansion ─────────────────────────────────
// docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §25 Phase 7. `people`
// first because a StudentRecord has no name without it (Phase 3's own
// scope note); the attendance pair next because it's the brief's own
// first-named success-condition workflow ("record attendance").

export interface PersonRecord {
  id: number;
  schoolId: number | null; // real DDL: nullable, unlike almost every other school-scoped table
  firstName: string;
  lastName: string;
  otherName: string | null;
  gender: string | null;
  dateOfBirth: IsoDate | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photoUrl: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
}

export interface NewPersonInput {
  schoolId?: number | null;
  firstName: string;
  lastName: string;
  otherName?: string | null;
  gender?: string | null;
  dateOfBirth?: IsoDate | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  photoUrl?: string | null;
}

/** Matches attendance_raw_events.source's live ENUM (extended by
 *  src/lib/attendance/acquisition/schema.ts's ALTER — the base migration
 *  file only shows the original 4 values, exactly the "one file doesn't
 *  represent current state" gap this doc's §2.2 already flagged). */
export type AttendanceEventSource =
  | 'zkteco_push' | 'dahua_pull' | 'manual' | 'relay' | 'tcp_pull' | 'usb_import' | 'csv_import';
export type AttendanceRoleType = 'student' | 'staff' | 'visitor';

export interface AttendanceRawEventRecord {
  id: number;
  schoolId: number;
  deviceSn: string;
  deviceUserId: number;
  displayName: string | null;
  enrollmentId: number | null;
  personId: number | null;
  roleType: AttendanceRoleType | null;
  roleRefId: number | null;
  punchAt: IsoDateTime;
  verifyType: number | null;
  ioMode: number | null;
  source: AttendanceEventSource;
  matched: boolean;
  resolutionPath: string | null;
  resolutionScore: number | null;
  legacyTable: string | null;
  legacyId: number | null;
  ingestedAt: IsoDateTime;
}

export interface NewAttendanceRawEventInput {
  schoolId: number;
  deviceSn: string;
  deviceUserId: number;
  displayName?: string | null;
  enrollmentId?: number | null;
  personId?: number | null;
  roleType?: AttendanceRoleType | null;
  roleRefId?: number | null;
  punchAt: IsoDateTime;
  verifyType?: number | null;
  ioMode?: number | null;
  source: AttendanceEventSource;
  matched?: boolean;
  resolutionPath?: string | null;
  resolutionScore?: number | null;
  legacyTable?: string | null;
  legacyId?: number | null;
}

export type AttendanceDayRoleType = 'student' | 'staff';
export type AttendanceDayStatus = 'present' | 'late' | 'absent' | 'half_day' | 'early_leave' | 'holiday' | 'weekend';

export interface AttendanceRecordRecord {
  id: number;
  schoolId: number;
  personId: number;
  roleType: AttendanceDayRoleType;
  attendanceDate: IsoDate;
  firstInAt: IsoDateTime | null;
  lastOutAt: IsoDateTime | null;
  firstInDevice: string | null;
  lastOutDevice: string | null;
  status: AttendanceDayStatus;
  lateMinutes: number;
  earlyMinutes: number;
  totalMinutes: number;
  ruleId: number | null;
  rawEventCount: number;
  evaluatedAt: IsoDateTime;
}

/** One row per (personId, attendanceDate) — the real table's own
 *  uk_person_day unique key. upsertAttendanceRecord() (not create/update)
 *  is the repo method, matching how the real evaluator actually writes
 *  this table (recompute-and-replace the day's summary, not an ordinary
 *  single-row create). */
export interface UpsertAttendanceRecordInput {
  schoolId: number;
  personId: number;
  roleType: AttendanceDayRoleType;
  attendanceDate: IsoDate;
  firstInAt?: IsoDateTime | null;
  lastOutAt?: IsoDateTime | null;
  firstInDevice?: string | null;
  lastOutDevice?: string | null;
  status: AttendanceDayStatus;
  lateMinutes?: number;
  earlyMinutes?: number;
  totalMinutes?: number;
  ruleId?: number | null;
  rawEventCount?: number;
}

/** Thrown by a repo implementation for a caller-fixable input problem
 *  (not found, duplicate key, etc.) — distinguishes expected outcomes from
 *  genuine driver/connection failures, which propagate as-is. */
export class RepoError extends Error {
  constructor(message: string, public readonly code: 'NOT_FOUND' | 'DUPLICATE' | 'INVALID_INPUT') {
    super(message);
    this.name = 'RepoError';
  }
}

// ── Phase 7, sub-effort 2: classes + class_results ──────────────────────
// "Academic results + report cards" turned out to be a much larger domain
// than attendance was — src/lib/snapshots/queries.ts's real snapshot-
// generation query joins class_results against classes, subjects,
// class_subjects, staff, departments, subject_groups, and terms. classes
// is the minimum necessary slice here, not the whole thing: class_results
// has NO school_id column at all (confirmed via a live information_schema
// query, not any of the several conflicting historical dump files this
// repo has for it) — every real query in this codebase scopes it via
// `JOIN classes c ON c.id = cr.class_id WHERE c.school_id = ?`
// (src/lib/nexus/tools.ts:195-198). Without classes existing locally,
// class_results could not be safely tenant-scoped at all. subjects,
// terms, staff, departments, subject_groups, academic_years, and
// report_snapshots + DRCE's render path remain for future sub-efforts.

export interface ClassRecord {
  id: number;
  schoolId: number | null; // nullable in the real DDL, like people.school_id
  name: string;
  curriculumId: number | null;
  programId: number | null;
  classLevel: number | null;
  headTeacherId: number | null;
  capacity: number | null;
  code: string | null;
  level: number | null;
  nameAr: string | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewClassInput {
  schoolId?: number | null;
  name: string;
  curriculumId?: number | null;
  programId?: number | null;
  classLevel?: number | null;
  headTeacherId?: number | null;
  capacity?: number | null;
  code?: string | null;
  level?: number | null;
  nameAr?: string | null;
}

/** classes and class_results both carry a richer soft-delete/restore
 *  audit trail (deleted_by, delete_reason, restored_at, restored_by) than
 *  the simple deleted_at this repo layer used for schools/students/
 *  people/attendance_records — DRAIS already has a real Trash/restore
 *  system (docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md) these tables plug
 *  into online; this shape matches it rather than inventing a simpler one. */
export interface SoftDeleteOptions {
  deletedBy?: number | null;
  deleteReason?: string | null;
}

export type AcademicType = 'secular' | 'theology';

export interface ClassResultRecord {
  id: number;
  studentId: number;
  classId: number;
  subjectId: number;
  termId: number | null;
  resultTypeId: number;
  score: number | null;
  grade: string | null;
  remarks: string | null;
  academicYearId: number | null;
  academicType: AcademicType;
  programId: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewClassResultInput {
  studentId: number;
  classId: number;
  subjectId: number;
  termId?: number | null;
  resultTypeId: number;
  score?: number | null;
  grade?: string | null;
  remarks?: string | null;
  academicYearId?: number | null;
  academicType?: AcademicType;
  programId?: number | null;
}

// ── Phase 7, sub-effort 3: staff ────────────────────────────────────────
// Confirmed via a live information_schema query, same discipline as every
// prior sub-effort. Two real surprises, both deliberately handled rather
// than papered over:
//
// 1. SCOPE CUT, security-driven, not an oversight: the real `staff` table
//    also carries `salary DECIMAL(14,2)`, `bank_name`, `bank_account_no`,
//    `nssf_no`, `tin_no` — genuine payroll/financial PII. §15 of the
//    architecture audit already flags that repo-sqlite's local file is
//    plain better-sqlite3, NOT SQLCipher-encrypted-at-rest (a documented,
//    open gap, not yet closed). Syncing salary/bank-account/tax-ID data
//    into that unencrypted local file today would be a real security
//    regression, not a hypothetical one — so those five columns are
//    deliberately EXCLUDED from StaffRecord/NewStaffInput entirely. They
//    stay cloud-authoritative until repo-sqlite has at-rest encryption;
//    revisit this exclusion when that lands, not before.
// 2. NO created_at COLUMN AT ALL — the first table in this repo layer
//    without one (every prior table had both). updatedAt is therefore
//    genuinely nullable here (real rows can have NULL updated_at with no
//    created_at to fall back to) rather than forced non-null via
//    toIsoRequired's fallback chain, which would fabricate a fake
//    timestamp this table's own source data doesn't support.
//
// staff.first_name/last_name/first_name_ar/last_name_ar (redundant with
// person_id → people.first_name/last_name) are also deliberately left out
// here: person_id is NOT NULL on every real row, so `people` stays the
// single canonical name source for this repo layer, matching how
// students already work. If a caller ever needs the raw redundant
// staff-table name columns specifically, that's a real, separate need to
// add later — not assumed now.

export type StaffEmploymentType = 'permanent' | 'contract' | 'volunteer' | 'part-time';

export interface StaffRecord {
  id: number;
  schoolId: number;
  branchId: number | null;
  personId: number;
  staffNo: string | null;
  departmentId: number | null;
  roleId: number | null;
  position: string | null;
  positionId: number | null;
  employmentType: StaffEmploymentType | null;
  qualification: string | null;
  experienceYears: number | null;
  hireDate: IsoDate | null;
  status: string | null;
  managerId: number | null;
  updatedAt: IsoDateTime | null; // nullable — see header, no created_at to fall back to
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewStaffInput {
  schoolId: number;
  personId: number;
  branchId?: number | null;
  staffNo?: string | null;
  departmentId?: number | null;
  roleId?: number | null;
  position?: string | null;
  positionId?: number | null;
  employmentType?: StaffEmploymentType | null;
  qualification?: string | null;
  experienceYears?: number | null;
  hireDate?: IsoDate | null;
  status?: string | null;
  managerId?: number | null;
}
