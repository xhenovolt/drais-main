/**
 * @drais/repo-sqlite — provisioning seed writes.
 *
 * Deliberately NOT part of SchoolRepo/StudentRepo's normal create()/update()
 * contract. Provisioning is a different operation from ordinary app writes:
 * it needs to preserve the source row's exact id/timestamps (an upsert of a
 * full record), not generate a fresh auto-increment id and fresh audit
 * timestamps the way a real user action would. Keeping this separate means
 * the repo contract's create()/update() semantics stay honest for every
 * other caller — "create a new row" always means exactly that.
 *
 * ID preservation is a deliberate, scoped-to-this-phase choice: a freshly
 * provisioned local install starts as an exact 1:1 copy with no local
 * writes yet, so there is no ID-collision risk to design around. Real sync
 * (roadmap Phase 9-10) will need its own stable cross-system identity
 * (sync_uuid, per docs/architecture/DRAIS_V2_ARCHITECTURE_AUDIT.md §12.2)
 * once local writes can diverge from the source — that is a materially
 * different problem from this one and is intentionally not solved here.
 *
 * Upsert (INSERT ... ON CONFLICT DO UPDATE), not a raw INSERT, so
 * re-provisioning the same school (refresh from cloud) is safe to re-run.
 */
import type { SqliteConnection } from './connection';
import type { SchoolRecord, StudentRecord, PersonRecord, StaffRecord, ClassRecord, EnrollmentRecord } from '../contract/types';

/**
 * subscription_* fields are carried through here deliberately (Phase 7,
 * sub-effort 7) — this is the actual mechanism behind the user's confirmed
 * design (2026-08-21): "the subscription is carried with them" the first
 * time a school is provisioned offline. Re-provisioning (this function is
 * an upsert) refreshes the carried snapshot to whatever the source
 * currently says, same as every other field here.
 */
export function seedSchool(db: SqliteConnection, r: SchoolRecord): void {
  db.prepare(`
    INSERT INTO schools (id, name, legal_name, short_code, email, phone, currency, address, logo_url, status,
                          subscription_status, subscription_plan, subscription_type, trial_start_date,
                          trial_end_date, subscription_start_date, subscription_end_date, created_at, updated_at, deleted_at)
    VALUES (@id, @name, @legalName, @shortCode, @email, @phone, @currency, @address, @logoUrl, @status,
            @subscriptionStatus, @subscriptionPlan, @subscriptionType, @trialStartDate, @trialEndDate,
            @subscriptionStartDate, @subscriptionEndDate, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, legal_name=excluded.legal_name, short_code=excluded.short_code,
      email=excluded.email, phone=excluded.phone, currency=excluded.currency, address=excluded.address,
      logo_url=excluded.logo_url, status=excluded.status, subscription_status=excluded.subscription_status,
      subscription_plan=excluded.subscription_plan, subscription_type=excluded.subscription_type,
      trial_start_date=excluded.trial_start_date, trial_end_date=excluded.trial_end_date,
      subscription_start_date=excluded.subscription_start_date, subscription_end_date=excluded.subscription_end_date,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, name: r.name, legalName: r.legalName, shortCode: r.shortCode, email: r.email,
    phone: r.phone, currency: r.currency, address: r.address, logoUrl: r.logoUrl, status: r.status,
    subscriptionStatus: r.subscriptionStatus, subscriptionPlan: r.subscriptionPlan,
    subscriptionType: r.subscriptionType, trialStartDate: r.trialStartDate, trialEndDate: r.trialEndDate,
    subscriptionStartDate: r.subscriptionStartDate, subscriptionEndDate: r.subscriptionEndDate,
    createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}

export function seedStudent(db: SqliteConnection, r: StudentRecord): void {
  db.prepare(`
    INSERT INTO students (id, school_id, person_id, admission_no, village_id, admission_date, status, notes, created_at, updated_at, deleted_at)
    VALUES (@id, @schoolId, @personId, @admissionNo, @villageId, @admissionDate, @status, @notes, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, person_id=excluded.person_id, admission_no=excluded.admission_no,
      village_id=excluded.village_id, admission_date=excluded.admission_date, status=excluded.status,
      notes=excluded.notes, updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, schoolId: r.schoolId, personId: r.personId, admissionNo: r.admissionNo,
    villageId: r.villageId, admissionDate: r.admissionDate, status: r.status, notes: r.notes,
    createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}

export function seedPerson(db: SqliteConnection, r: PersonRecord): void {
  db.prepare(`
    INSERT INTO people (id, school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address, photo_url, created_at, updated_at, deleted_at)
    VALUES (@id, @schoolId, @firstName, @lastName, @otherName, @gender, @dateOfBirth, @phone, @email, @address, @photoUrl, @createdAt, @updatedAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, first_name=excluded.first_name, last_name=excluded.last_name,
      other_name=excluded.other_name, gender=excluded.gender, date_of_birth=excluded.date_of_birth,
      phone=excluded.phone, email=excluded.email, address=excluded.address, photo_url=excluded.photo_url,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at
  `).run({
    id: r.id, schoolId: r.schoolId, firstName: r.firstName, lastName: r.lastName, otherName: r.otherName,
    gender: r.gender, dateOfBirth: r.dateOfBirth, phone: r.phone, email: r.email, address: r.address,
    photoUrl: r.photoUrl, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
  });
}

/** Phase 7, sub-effort 15 (provisioning gap closed as part of it): staff
 *  identity fields only — no salary/bank fields exist on StaffRecord at
 *  all (see staff-repo.ts's header), so there is nothing to carry or omit
 *  here, unlike the other seed functions. */
export function seedStaff(db: SqliteConnection, r: StaffRecord): void {
  db.prepare(`
    INSERT INTO staff (id, school_id, branch_id, person_id, staff_no, department_id, role_id, position,
                        position_id, employment_type, qualification, experience_years, hire_date, status,
                        manager_id, updated_at, deleted_at, deleted_by, delete_reason, restored_at, restored_by)
    VALUES (@id, @schoolId, @branchId, @personId, @staffNo, @departmentId, @roleId, @position,
            @positionId, @employmentType, @qualification, @experienceYears, @hireDate, @status,
            @managerId, @updatedAt, @deletedAt, @deletedBy, @deleteReason, @restoredAt, @restoredBy)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, branch_id=excluded.branch_id, person_id=excluded.person_id,
      staff_no=excluded.staff_no, department_id=excluded.department_id, role_id=excluded.role_id,
      position=excluded.position, position_id=excluded.position_id, employment_type=excluded.employment_type,
      qualification=excluded.qualification, experience_years=excluded.experience_years, hire_date=excluded.hire_date,
      status=excluded.status, manager_id=excluded.manager_id, updated_at=excluded.updated_at,
      deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by, delete_reason=excluded.delete_reason,
      restored_at=excluded.restored_at, restored_by=excluded.restored_by
  `).run({
    id: r.id, schoolId: r.schoolId, branchId: r.branchId, personId: r.personId, staffNo: r.staffNo,
    departmentId: r.departmentId, roleId: r.roleId, position: r.position, positionId: r.positionId,
    employmentType: r.employmentType, qualification: r.qualification, experienceYears: r.experienceYears,
    hireDate: r.hireDate, status: r.status, managerId: r.managerId, updatedAt: r.updatedAt,
    deletedAt: r.deletedAt, deletedBy: r.deletedBy, deleteReason: r.deleteReason,
    restoredAt: r.restoredAt, restoredBy: r.restoredBy,
  });
}

export function seedClass(db: SqliteConnection, r: ClassRecord): void {
  db.prepare(`
    INSERT INTO classes (id, school_id, name, curriculum_id, program_id, class_level, head_teacher_id,
                          capacity, code, level, name_ar, created_at, updated_at, deleted_at,
                          deleted_by, delete_reason, restored_at, restored_by)
    VALUES (@id, @schoolId, @name, @curriculumId, @programId, @classLevel, @headTeacherId,
            @capacity, @code, @level, @nameAr, @createdAt, @updatedAt, @deletedAt,
            @deletedBy, @deleteReason, @restoredAt, @restoredBy)
    ON CONFLICT(id) DO UPDATE SET
      school_id=excluded.school_id, name=excluded.name, curriculum_id=excluded.curriculum_id,
      program_id=excluded.program_id, class_level=excluded.class_level, head_teacher_id=excluded.head_teacher_id,
      capacity=excluded.capacity, code=excluded.code, level=excluded.level, name_ar=excluded.name_ar,
      updated_at=excluded.updated_at, deleted_at=excluded.deleted_at, deleted_by=excluded.deleted_by,
      delete_reason=excluded.delete_reason, restored_at=excluded.restored_at, restored_by=excluded.restored_by
  `).run({
    id: r.id, schoolId: r.schoolId, name: r.name, curriculumId: r.curriculumId, programId: r.programId,
    classLevel: r.classLevel, headTeacherId: r.headTeacherId, capacity: r.capacity, code: r.code,
    level: r.level, nameAr: r.nameAr, createdAt: r.createdAt, updatedAt: r.updatedAt, deletedAt: r.deletedAt,
    deletedBy: r.deletedBy, deleteReason: r.deleteReason, restoredAt: r.restoredAt, restoredBy: r.restoredBy,
  });
}

/** EnrollmentRepo is read-only (see contract/types.ts's EnrollmentRecord
 *  header), but provisioning still needs to WRITE these rows into the
 *  local file somehow — this is that write, deliberately kept here
 *  alongside the other seed functions rather than added to the repo's
 *  own contract, which stays read-only on purpose. */
export function seedEnrollment(db: SqliteConnection, r: EnrollmentRecord): void {
  db.prepare(`
    INSERT INTO enrollments (id, student_id, class_id, stream_id, academic_year_id, term_id,
                              status, enrollment_type, enrollment_date, created_at, deleted_at)
    VALUES (@id, @studentId, @classId, @streamId, @academicYearId, @termId,
            @status, @enrollmentType, @enrollmentDate, @createdAt, @deletedAt)
    ON CONFLICT(id) DO UPDATE SET
      student_id=excluded.student_id, class_id=excluded.class_id, stream_id=excluded.stream_id,
      academic_year_id=excluded.academic_year_id, term_id=excluded.term_id, status=excluded.status,
      enrollment_type=excluded.enrollment_type, enrollment_date=excluded.enrollment_date,
      deleted_at=excluded.deleted_at
  `).run({
    id: r.id, studentId: r.studentId, classId: r.classId, streamId: r.streamId,
    academicYearId: r.academicYearId, termId: r.termId, status: r.status,
    enrollmentType: r.enrollmentType, enrollmentDate: r.enrollmentDate,
    createdAt: r.createdAt, deletedAt: r.deletedAt,
  });
}
