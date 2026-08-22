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
  // ── Phase 7, sub-effort 7: subscription state ──────────────────────────
  // Added specifically so a local install can evaluate subscription access
  // OFFLINE, with no network call — the explicit design the user confirmed
  // (2026-08-21): "the subscription is carried with them" at provisioning
  // time, evaluated locally against that carried snapshot from then on
  // (necessarily as fresh as the last provision/sync, same as any offline
  // system). These fields map 1:1 onto src/lib/subscription.ts's own
  // classifyPlan()'s expected row shape — that function is already pure
  // (zero DB calls) — so the EXISTING online evaluation logic can run
  // unmodified against a SchoolRecord's carried snapshot; no separate
  // "offline subscription logic" needed or built. Also added here: the
  // richer deleted_by/delete_reason/restored_at/restored_by audit trail
  // schools genuinely has (confirmed live) that Phase 3's original build
  // predates and never captured.
  subscriptionStatus: SubscriptionStatus | null;
  subscriptionPlan: string | null;
  subscriptionType: SubscriptionType | null;
  trialStartDate: IsoDateTime | null;
  trialEndDate: IsoDateTime | null;
  subscriptionStartDate: IsoDateTime | null;
  subscriptionEndDate: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

/** Matches src/lib/subscription.ts's own SubscriptionStatus/SubscriptionType
 *  exactly (confirmed against the real schools.subscription_status/
 *  subscription_type ENUMs live) — not redefined independently, so the two
 *  can never silently drift apart. */
export type SubscriptionStatus = 'active' | 'inactive' | 'trial' | 'expired';
export type SubscriptionType = 'none' | 'trial' | 'monthly' | 'yearly';

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
  subscriptionStatus?: SubscriptionStatus | null;
  subscriptionPlan?: string | null;
  subscriptionType?: SubscriptionType | null;
  trialStartDate?: IsoDateTime | null;
  trialEndDate?: IsoDateTime | null;
  subscriptionStartDate?: IsoDateTime | null;
  subscriptionEndDate?: IsoDateTime | null;
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
  // Added for the first offline-students slice (2026-08-22) — the real
  // Trash system (docs/PHASE_1_CRUD_TRASH_ARCHITECTURE.md,
  // src/lib/trash/service.ts's archiveEntity()/restoreEntity()) genuinely
  // sets these on `students` (confirmed via the trash registry's own
  // displaySelect SQL: `e.deleted_by, e.delete_reason, e.restored_at,
  // e.restored_by` selected directly off the students table alias) —
  // Phase 3's original StudentRecord predates this session's later
  // discovery of the richer audit-trail pattern (classes/staff/etc.) and
  // never captured it. Purely additive.
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
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

// ── Phase 7, sub-effort 4: subjects, terms, academic_years ─────────────
// The three reference tables class_results already points at via
// subjectId/termId/academicYearId (sub-effort 2) but that don't exist
// locally yet — without them those ids are floating integers with no
// record behind them. Real schemas confirmed live, same discipline as
// every prior sub-effort. `subjects` reuses the `AcademicType` type
// already defined for class_results (`secular` | `theology` — the real
// `subjects.academic_type` ENUM matches it exactly, not a coincidence:
// it's the same real-world distinction).
//
// A third, genuinely new "missing timestamp" shape, distinct from both
// prior ones: `academic_years` has **neither `created_at` nor
// `updated_at` at all** — the first table in this repo layer missing
// both (staff, sub-effort 3, was missing only `created_at`). Its record
// type simply has no timestamp fields, not nullable ones — inventing
// nullable fields for columns that don't exist at all would be worse
// than omitting them, the same reasoning already applied to staff.

export interface SubjectRecord {
  id: number;
  schoolId: number;
  name: string;
  nameAr: string | null;
  code: string | null;
  subjectType: string | null;
  academicType: AcademicType;
  departmentId: number | null;
  subjectGroupId: number | null;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewSubjectInput {
  schoolId: number;
  name: string;
  nameAr?: string | null;
  code?: string | null;
  subjectType?: string | null;
  academicType?: AcademicType;
  departmentId?: number | null;
  subjectGroupId?: number | null;
}

export interface TermRecord {
  id: number;
  schoolId: number;
  name: string;
  nameAr: string | null;
  code: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  academicYearId: number | null;
  isActive: boolean | null;
  termNumber: number | null;
  status: string | null;
  notes: string | null;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewTermInput {
  schoolId: number;
  name: string;
  nameAr?: string | null;
  code?: string | null;
  startDate: IsoDate;
  endDate: IsoDate;
  academicYearId?: number | null;
  isActive?: boolean | null;
  termNumber?: number | null;
  status?: string | null;
  notes?: string | null;
}

/** No created_at/updated_at at all on the real table (see header above) —
 *  deliberately no timestamp fields, not nullable ones. */
export interface AcademicYearRecord {
  id: number;
  schoolId: number;
  name: string;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
  status: string | null;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewAcademicYearInput {
  schoolId: number;
  name: string;
  startDate?: IsoDate | null;
  endDate?: IsoDate | null;
  status?: string | null;
}

// ── Phase 7, sub-effort 6: users, roles, user_roles, role_permissions,
// permissions — the offline-authentication data layer ────────────────────
//
// Prompted by a real finding, not the next item on a pre-set list:
// src/lib/auth.ts's getSessionSchoolId() — the function EVERY protected API
// route calls first — reads sessions/users/staff/schools/roles/user_roles
// via raw query() with zero SQLite path. No offline route, however well
// built, is reachable until a user can authenticate without internet. This
// sub-effort builds the DATA layer that requires (real schemas confirmed
// live, same discipline as every prior sub-effort); it deliberately does
// NOT touch auth.ts, the login route, or any live session-validation code
// — see the roadmap doc's Phase 7 sub-effort 6 entry for the real, open
// policy questions (subscription checks offline? lockout state offline?
// audit logging offline?) that a real offline-login ROUTE needs answered
// first, which are product decisions, not something to invent unilaterally
// here.
//
// SECURITY SCOPE CUT, same reasoning as staff's salary/bank exclusion
// (repo-sqlite has no SQLCipher at-rest encryption yet): `users` really
// has `password_reset_token`, `verification_token`, `email_verification_
// token` (ephemeral, email-flow-only, meaningless without network anyway),
// `passcode_hash` (unused by the login flow actually read — src/app/api/
// auth/login/route.ts only ever checks password_hash — not proven needed,
// excluded until it is), `two_factor_secret` and `biometric_key` (raw
// secret/key material, NOT one-way-hashed — genuinely sensitive, same
// category as staff's bank_account_no). `password_hash` itself IS
// included — a one-way bcrypt hash is exactly the kind of secret that's
// safe to store even at rest unencrypted (that's what hashing is for),
// and offline password verification is impossible without it.
// `two_factor_enabled`/`biometric_enabled` (booleans, not the secrets
// themselves) are safe and included.
//
// `permissions` and `role_permissions` are GLOBAL/platform tables — no
// school_id at all, confirmed live — the first tables in this repo layer
// that are not tenant data. `role_permissions` additionally has NO `id`
// column (role_id+permission_id is the real composite key) — its repo
// methods are shaped around that (listByRole/grant/revoke), not the usual
// findById/create/update CRUD shape used everywhere else in this layer.

export type UserStatus = string; // real column has no DB-level ENUM constraint

export interface UserRecord {
  id: number;
  schoolId: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  avatarUrl: string | null;
  /** One-way bcrypt hash — see this section's header for why this is the
   *  one "secret-shaped" column deliberately included. */
  passwordHash: string;
  roleId: number | null; // legacy single-role FK; user_roles is the real many-to-many
  isActive: boolean | null;
  isVerified: boolean | null;
  lastLoginAt: IsoDateTime | null;
  lastPasswordChange: IsoDateTime | null;
  failedLoginAttempts: number | null;
  lockedUntil: IsoDateTime | null;
  createdBy: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  username: string | null;
  personId: number | null;
  status: UserStatus | null;
  profilePhoto: string | null;
  emailVerified: boolean | null;
  loginAttempts: number | null;
  lastActivity: IsoDateTime | null;
  /** JSON column — mysql2 auto-parses JSON columns to a JS value; SQLite
   *  stores it as a TEXT column, JSON.stringify/parse at the repo boundary. */
  preferences: Record<string, unknown> | null;
  twoFactorEnabled: boolean | null;
  biometricEnabled: boolean | null;
  mustChangePassword: boolean;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
  lastFailedLoginAt: IsoDateTime | null;
}

export interface NewUserInput {
  schoolId?: number | null;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | null;
  avatarUrl?: string | null;
  passwordHash: string;
  roleId?: number | null;
  isActive?: boolean | null;
  isVerified?: boolean | null;
  createdBy?: number | null;
  username?: string | null;
  personId?: number | null;
  status?: UserStatus | null;
  profilePhoto?: string | null;
  emailVerified?: boolean | null;
  preferences?: Record<string, unknown> | null;
  twoFactorEnabled?: boolean | null;
  biometricEnabled?: boolean | null;
  mustChangePassword?: boolean;
}

export interface RoleRecord {
  id: number;
  schoolId: number;
  name: string;
  slug: string | null;
  description: string | null;
  isSuperAdmin: boolean | null;
  isActive: boolean | null;
  isSystemRole: boolean | null;
  /** JSON column, distinct from (and possibly redundant with) the
   *  role_permissions join table below — real, kept as-is, not invented
   *  away; some code paths may read this directly instead of joining. */
  permissions: unknown | null;
  hierarchyLevel: number | null;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt: IsoDateTime | null;
  deletedBy: number | null;
  deleteReason: string | null;
  restoredAt: IsoDateTime | null;
  restoredBy: number | null;
}

export interface NewRoleInput {
  schoolId: number;
  name: string;
  slug?: string | null;
  description?: string | null;
  isSuperAdmin?: boolean | null;
  isActive?: boolean | null;
  isSystemRole?: boolean | null;
  permissions?: unknown | null;
  hierarchyLevel?: number | null;
}

/** No soft-delete audit trail on the real table — just is_active. */
export interface UserRoleRecord {
  id: number;
  userId: number;
  roleId: number;
  isActive: boolean | null;
  assignedBy: number | null;
  assignedAt: IsoDateTime | null;
  schoolId: number | null;
}

export interface NewUserRoleInput {
  userId: number;
  roleId: number;
  isActive?: boolean | null;
  assignedBy?: number | null;
  schoolId?: number | null;
}

/** Global platform catalog — no school_id at all (confirmed live). */
export interface PermissionRecord {
  id: number;
  code: string;
  module: string | null;
  resource: string | null;
  action: string | null;
  description: string | null;
  isActive: boolean | null;
  name: string | null;
  category: string | null;
  createdAt: IsoDateTime | null;
  updatedAt: IsoDateTime | null;
}

/** Pure join — role_id+permission_id is the real key, no own `id` column
 *  (confirmed live). Not a Record with an id; grant/revoke are the actual
 *  operations, not create/update/delete of a row with independent identity. */
export interface RolePermissionGrant {
  roleId: number;
  permissionId: number;
  createdAt: IsoDateTime | null;
}
