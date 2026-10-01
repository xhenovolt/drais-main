/**
 * @drais/repo — the offline-staff slice (Phase 7 sub-effort 14).
 *
 * Same discipline as offline-students (sub-effort 11): a deliberately
 * smaller thing than the real staff feature, not a port of it. `StaffRepo`
 * already excludes salary/bank_name/bank_account_no/nssf_no/tin_no at the
 * repo layer (security-deferred until repo-sqlite has at-rest encryption —
 * see staff-repo.ts's header). This slice excludes a second layer on top of
 * that: departmentId/roleId/positionId/managerId/branchId are real columns
 * on `staff`, but every lookup table they point at (departments, roles,
 * positions, branches) has no repo in this layer yet, so showing a bare
 * foreign-key integer with no name behind it would be worse than not
 * showing it at all. What's left — identity (via person), staff number,
 * free-text position, employment type, qualification, experience, hire
 * date, status — is enough for "who is this staff member" without
 * pretending to be the org-structure feature.
 *
 * Mirrors offline-students' shape exactly: pure service logic here, a thin
 * NextRequest/NextResponse adapter in route-bridge.ts.
 */
import type { Repos } from '../contract';
import type { StaffRecord, NewStaffInput, PersonRecord, NewPersonInput, StaffEmploymentType } from '../contract/types';
import { RepoError } from '../contract/types';
import type { SqliteConnection } from '../sqlite/connection';

export interface OfflineStaffView {
  id: number;
  schoolId: number;
  personId: number;
  staffNo: string | null;
  position: string | null;
  employmentType: StaffEmploymentType | null;
  qualification: string | null;
  experienceYears: number | null;
  hireDate: string | null;
  status: string | null;
  firstName: string;
  lastName: string;
  otherName: string | null;
  gender: string | null;
  dateOfBirth: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  photoUrl: string | null;
  deletedAt: string | null;
  updatedAt: string | null;
}

function toView(staff: StaffRecord, person: PersonRecord): OfflineStaffView {
  return {
    id: staff.id, schoolId: staff.schoolId, personId: staff.personId,
    staffNo: staff.staffNo, position: staff.position, employmentType: staff.employmentType,
    qualification: staff.qualification, experienceYears: staff.experienceYears,
    hireDate: staff.hireDate, status: staff.status,
    firstName: person.firstName, lastName: person.lastName, otherName: person.otherName,
    gender: person.gender, dateOfBirth: person.dateOfBirth, phone: person.phone,
    email: person.email, address: person.address, photoUrl: person.photoUrl,
    deletedAt: staff.deletedAt, updatedAt: staff.updatedAt,
  };
}

export interface ListOfflineStaffOptions {
  limit?: number;
  includeDeleted?: boolean;
  /** Same JS-side substring match offline-students uses — reasonable at
   *  local-install scale, not pushed into SQL for a first slice. */
  search?: string;
}

export async function listOfflineStaff(repos: Repos, schoolId: number, opts: ListOfflineStaffOptions = {}): Promise<OfflineStaffView[]> {
  const staff = await repos.staff.listBySchool(schoolId, { limit: opts.limit ?? 500, includeDeleted: opts.includeDeleted });
  const views: OfflineStaffView[] = [];
  for (const s of staff) {
    const person = await repos.people.findById(s.personId);
    if (!person) continue; // an orphaned staff row (person deleted independently) — skip rather than crash the list
    views.push(toView(s, person));
  }
  if (!opts.search) return views;
  const q = opts.search.trim().toLowerCase();
  if (!q) return views;
  return views.filter((v) =>
    v.firstName.toLowerCase().includes(q) || v.lastName.toLowerCase().includes(q) ||
    (v.otherName ?? '').toLowerCase().includes(q) || (v.staffNo ?? '').toLowerCase().includes(q) ||
    (v.position ?? '').toLowerCase().includes(q));
}

export async function getOfflineStaff(repos: Repos, schoolId: number, id: number): Promise<OfflineStaffView | null> {
  const staff = await repos.staff.findById(schoolId, id);
  if (!staff) return null;
  const person = await repos.people.findById(staff.personId);
  if (!person) return null;
  return toView(staff, person);
}

export interface NewOfflineStaffInput {
  firstName: string;
  lastName: string;
  otherName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  staffNo?: string | null;
  position?: string | null;
  employmentType?: StaffEmploymentType | null;
  qualification?: string | null;
  experienceYears?: number | null;
  hireDate?: string | null;
  status?: string | null;
}

/** Creates the person AND the staff row together, same transaction
 *  discipline as createOfflineStudent — the route supplies the SQLite
 *  connection so both inserts share one transaction. */
export async function createOfflineStaff(
  repos: Repos,
  schoolId: number,
  input: NewOfflineStaffInput,
  db?: SqliteConnection,
): Promise<OfflineStaffView> {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    throw new RepoError('firstName and lastName are required', 'INVALID_INPUT');
  }
  const personInput: NewPersonInput = {
    schoolId, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
    otherName: input.otherName ?? null, gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null,
    phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null,
  };
  const staffInput: NewStaffInput = {
    schoolId, personId: 0, staffNo: input.staffNo ?? null, position: input.position ?? null,
    employmentType: input.employmentType ?? null, qualification: input.qualification ?? null,
    experienceYears: input.experienceYears ?? null, hireDate: input.hireDate ?? null,
    status: input.status ?? 'active',
  };

  if (db) {
    try {
      const create = db.transaction(() => {
        const personResult = db.prepare(
          `INSERT INTO people (school_id, first_name, last_name, other_name, gender, date_of_birth, phone, email, address)
           VALUES (@schoolId, @firstName, @lastName, @otherName, @gender, @dateOfBirth, @phone, @email, @address)`,
        ).run({
          schoolId: personInput.schoolId, firstName: personInput.firstName, lastName: personInput.lastName,
          otherName: personInput.otherName, gender: personInput.gender, dateOfBirth: personInput.dateOfBirth,
          phone: personInput.phone, email: personInput.email, address: personInput.address,
        });
        const personId = Number(personResult.lastInsertRowid);
        const staffResult = db.prepare(
          `INSERT INTO staff (school_id, person_id, staff_no, position, employment_type, qualification, experience_years, hire_date, status, updated_at)
           VALUES (@schoolId, @personId, @staffNo, @position, @employmentType, @qualification, @experienceYears, @hireDate, @status, @updatedAt)`,
        ).run({ ...staffInput, personId, updatedAt: new Date().toISOString() });
        return { personId, staffId: Number(staffResult.lastInsertRowid) };
      });
      const ids = create();
      const person = await repos.people.findById(ids.personId);
      const staff = await repos.staff.findById(schoolId, ids.staffId);
      if (!person || !staff) throw new RepoError('Staff member vanished immediately after transaction', 'NOT_FOUND');
      return toView(staff, person);
    } catch (err: any) {
      if (String(err?.code) === 'SQLITE_CONSTRAINT_UNIQUE' || /UNIQUE constraint failed/i.test(String(err?.message))) {
        throw new RepoError('Staff number already exists', 'DUPLICATE');
      }
      throw err;
    }
  }

  const person = await repos.people.create(personInput);
  const staff = await repos.staff.create({ ...staffInput, personId: person.id });
  return toView(staff, person);
}

export async function updateOfflineStaff(repos: Repos, schoolId: number, id: number, patch: Partial<NewOfflineStaffInput>): Promise<OfflineStaffView> {
  const staff = await repos.staff.findById(schoolId, id);
  if (!staff) throw new RepoError(`Staff ${id} not found in school ${schoolId}`, 'NOT_FOUND');

  const personPatch: Partial<NewPersonInput> = {};
  if (patch.firstName !== undefined) personPatch.firstName = patch.firstName;
  if (patch.lastName !== undefined) personPatch.lastName = patch.lastName;
  if (patch.otherName !== undefined) personPatch.otherName = patch.otherName;
  if (patch.gender !== undefined) personPatch.gender = patch.gender;
  if (patch.dateOfBirth !== undefined) personPatch.dateOfBirth = patch.dateOfBirth;
  if (patch.phone !== undefined) personPatch.phone = patch.phone;
  if (patch.email !== undefined) personPatch.email = patch.email;
  if (patch.address !== undefined) personPatch.address = patch.address;
  const person = Object.keys(personPatch).length
    ? await repos.people.update(staff.personId, personPatch)
    : await repos.people.findById(staff.personId);
  if (!person) throw new RepoError(`Person ${staff.personId} vanished for staff ${id}`, 'NOT_FOUND');

  const staffPatch: Partial<NewStaffInput> = {};
  if (patch.staffNo !== undefined) staffPatch.staffNo = patch.staffNo;
  if (patch.position !== undefined) staffPatch.position = patch.position;
  if (patch.employmentType !== undefined) staffPatch.employmentType = patch.employmentType;
  if (patch.qualification !== undefined) staffPatch.qualification = patch.qualification;
  if (patch.experienceYears !== undefined) staffPatch.experienceYears = patch.experienceYears;
  if (patch.hireDate !== undefined) staffPatch.hireDate = patch.hireDate;
  if (patch.status !== undefined) staffPatch.status = patch.status;
  const updatedStaff = Object.keys(staffPatch).length
    ? await repos.staff.update(schoolId, id, staffPatch)
    : staff;

  return toView(updatedStaff, person);
}

export async function deleteOfflineStaff(repos: Repos, schoolId: number, id: number, deletedBy: number | null, deleteReason?: string | null): Promise<void> {
  await repos.staff.softDelete(schoolId, id, { deletedBy, deleteReason: deleteReason ?? null });
}

export async function restoreOfflineStaff(repos: Repos, schoolId: number, id: number, restoredBy: number | null): Promise<OfflineStaffView> {
  const staff = await repos.staff.restore(schoolId, id, restoredBy);
  const person = await repos.people.findById(staff.personId);
  if (!person) throw new RepoError(`Person ${staff.personId} vanished for restored staff ${id}`, 'NOT_FOUND');
  return toView(staff, person);
}
