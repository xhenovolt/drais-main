/**
 * @drais/repo — the first offline-students slice.
 *
 * Deliberately NOT a port of the real online students feature — an
 * investigation before writing any code found that feature to be ~55 API
 * routes, an enrollments-driven list view joined across classes/streams/
 * academic-years/terms/programs plus live fee balances, a 10+-table
 * profile endpoint, at least four inconsistent soft-delete code paths,
 * and several genuine live-schema ambiguities (see docs/architecture/
 * DRAIS_V2_ARCHITECTURE_AUDIT.md's Phase 7 sub-effort 11 entry for the
 * full writeup). None of that is reasonable to replicate as a first
 * offline module.
 *
 * Confirmed scope (2026-08-22, user, AskUserQuestion): a minimal NEW
 * screen — view/add/edit a student's core info only. schools + people
 * only: name, gender, date of birth, contact, admission number, status,
 * notes. No class/enrollment, no fees, no fingerprints, no Arabic names,
 * no admissions workflow. This is intentionally a different, smaller
 * thing than the real /students/list page — not a drop-in offline
 * replacement for it.
 *
 * Follows the same shape as offline-auth: pure, testable business logic
 * here, a thin NextRequest/NextResponse adapter in route-bridge.ts, and
 * genuinely new route files that dynamically import that bridge — lands
 * inert until wired, same discipline as every prior sub-effort.
 */
import type { Repos } from '../contract';
import type { StudentRecord, NewStudentInput, PersonRecord, NewPersonInput } from '../contract/types';
import { RepoError } from '../contract/types';

/** The merged shape this minimal screen actually needs — a student
 *  joined to its person record, composed here from two clean repo calls
 *  rather than a raw SQL join. For a single-school local file this is a
 *  deliberate, reasonable choice: no network latency, a synchronous
 *  driver, and a modest row count — the N+1-shaped composition this
 *  performs (one call per student to fetch its person) is not the
 *  problem it would be against a real network-bound multi-tenant DB. */
export interface OfflineStudentView {
  id: number;
  schoolId: number;
  personId: number;
  admissionNo: string | null;
  admissionDate: string | null;
  status: string;
  notes: string | null;
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
  createdAt: string;
  updatedAt: string;
}

function toView(student: StudentRecord, person: PersonRecord): OfflineStudentView {
  return {
    id: student.id, schoolId: student.schoolId, personId: student.personId,
    admissionNo: student.admissionNo, admissionDate: student.admissionDate,
    status: student.status, notes: student.notes,
    firstName: person.firstName, lastName: person.lastName, otherName: person.otherName,
    gender: person.gender, dateOfBirth: person.dateOfBirth, phone: person.phone,
    email: person.email, address: person.address, photoUrl: person.photoUrl,
    deletedAt: student.deletedAt, createdAt: student.createdAt, updatedAt: student.updatedAt,
  };
}

export interface ListOfflineStudentsOptions {
  limit?: number;
  includeDeleted?: boolean;
  /** Client-side-shaped search — case-insensitive substring match against
   *  first/last/other name or admission number. Matches the real online
   *  routes' own `LIKE` search fields (investigation §1), just evaluated
   *  in JS over the already-fetched page rather than pushed into SQL —
   *  reasonable at local-install scale, not something to over-engineer
   *  into the repo layer for a minimal first slice. */
  search?: string;
}

export async function listOfflineStudents(repos: Repos, schoolId: number, opts: ListOfflineStudentsOptions = {}): Promise<OfflineStudentView[]> {
  const students = await repos.students.listBySchool(schoolId, { limit: opts.limit ?? 500, includeDeleted: opts.includeDeleted });
  const views: OfflineStudentView[] = [];
  for (const s of students) {
    const person = await repos.people.findById(s.personId);
    if (!person) continue; // an orphaned student row (person deleted independently) — skip rather than crash the list
    views.push(toView(s, person));
  }
  if (!opts.search) return views;
  const q = opts.search.trim().toLowerCase();
  if (!q) return views;
  return views.filter((v) =>
    v.firstName.toLowerCase().includes(q) || v.lastName.toLowerCase().includes(q) ||
    (v.otherName ?? '').toLowerCase().includes(q) || (v.admissionNo ?? '').toLowerCase().includes(q));
}

export async function getOfflineStudent(repos: Repos, schoolId: number, id: number): Promise<OfflineStudentView | null> {
  const student = await repos.students.findById(schoolId, id);
  if (!student) return null;
  const person = await repos.people.findById(student.personId);
  if (!person) return null;
  return toView(student, person);
}

export interface NewOfflineStudentInput {
  firstName: string;
  lastName: string;
  otherName?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  admissionNo?: string | null;
  admissionDate?: string | null;
  status?: string;
  notes?: string | null;
}

/** Creates the person AND the student together — the real online "quick
 *  create" route (src/app/api/students/route.ts) does the same two-insert
 *  pattern. Not wrapped in a DB transaction: better-sqlite3 is
 *  synchronous and single-writer, so there's no concurrent-interleaving
 *  risk here the way there would be against a networked MySQL pool — if
 *  the second insert throws, the first has already committed, which is
 *  an acceptable, honestly-documented gap for this minimal slice rather
 *  than an invisible one. */
export async function createOfflineStudent(repos: Repos, schoolId: number, input: NewOfflineStudentInput): Promise<OfflineStudentView> {
  if (!input.firstName?.trim() || !input.lastName?.trim()) {
    throw new RepoError('firstName and lastName are required', 'INVALID_INPUT');
  }
  const personInput: NewPersonInput = {
    schoolId, firstName: input.firstName.trim(), lastName: input.lastName.trim(),
    otherName: input.otherName ?? null, gender: input.gender ?? null, dateOfBirth: input.dateOfBirth ?? null,
    phone: input.phone ?? null, email: input.email ?? null, address: input.address ?? null,
  };
  const person = await repos.people.create(personInput);
  const studentInput: NewStudentInput = {
    schoolId, personId: person.id, admissionNo: input.admissionNo ?? null,
    admissionDate: input.admissionDate ?? null, status: input.status ?? 'active', notes: input.notes ?? null,
  };
  const student = await repos.students.create(studentInput);
  return toView(student, person);
}

export async function updateOfflineStudent(repos: Repos, schoolId: number, id: number, patch: Partial<NewOfflineStudentInput>): Promise<OfflineStudentView> {
  const student = await repos.students.findById(schoolId, id);
  if (!student) throw new RepoError(`Student ${id} not found in school ${schoolId}`, 'NOT_FOUND');

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
    ? await repos.people.update(student.personId, personPatch)
    : await repos.people.findById(student.personId);
  if (!person) throw new RepoError(`Person ${student.personId} vanished for student ${id}`, 'NOT_FOUND');

  const studentPatch: Partial<NewStudentInput> = {};
  if (patch.admissionNo !== undefined) studentPatch.admissionNo = patch.admissionNo;
  if (patch.admissionDate !== undefined) studentPatch.admissionDate = patch.admissionDate;
  if (patch.status !== undefined) studentPatch.status = patch.status;
  if (patch.notes !== undefined) studentPatch.notes = patch.notes;
  const updatedStudent = Object.keys(studentPatch).length
    ? await repos.students.update(schoolId, id, studentPatch)
    : student;

  return toView(updatedStudent, person);
}

export async function deleteOfflineStudent(repos: Repos, schoolId: number, id: number, deletedBy: number | null, deleteReason?: string | null): Promise<void> {
  await repos.students.softDelete(schoolId, id, { deletedBy, deleteReason: deleteReason ?? null });
}

export async function restoreOfflineStudent(repos: Repos, schoolId: number, id: number, restoredBy: number | null): Promise<OfflineStudentView> {
  const student = await repos.students.restore(schoolId, id, restoredBy);
  const person = await repos.people.findById(student.personId);
  if (!person) throw new RepoError(`Person ${student.personId} vanished for restored student ${id}`, 'NOT_FOUND');
  return toView(student, person);
}
