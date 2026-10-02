/**
 * @drais/repo — the offline-academics slice (Phase 7 sub-effort 17, writes
 * added sub-effort 19 on explicit user instruction: full CRUD, not a
 * viewer).
 *
 * Deliberately smaller than "academics," same discipline as every prior
 * module: browse classes, see who teaches what in one (via ClassSubjectRepo,
 * sub-effort 16) and who's currently enrolled in it (via EnrollmentRepo,
 * sub-effort 15) — composed from clean repo calls, not a raw join.
 *
 * Marks entry (class_results) is real write-heavy data with the same
 * conflict-risk class online `results` has (two teachers editing the same
 * student's marks) — ClassResultRepo already has full CRUD (sub-effort 2),
 * so this is wiring, not new repo-layer business logic. No `resultTypeId`
 * picker exists in this layer (no ResultTypeRepo) — the caller supplies a
 * raw id; documented as a known gap, not silently guessed.
 */
import type { Repos } from '../contract';
import type { NewClassInput, NewSubjectInput, NewClassSubjectInput, NewClassResultInput } from '../contract/types';
import { RepoError } from '../contract/types';

export interface OfflineClassSummary {
  id: number;
  name: string;
  code: string | null;
  classLevel: number | null;
}

export async function listOfflineClasses(repos: Repos, schoolId: number): Promise<OfflineClassSummary[]> {
  const classes = await repos.classes.listBySchool(schoolId, { limit: 1000 });
  return classes.map((c) => ({ id: c.id, name: c.name, code: c.code, classLevel: c.classLevel }));
}

export interface OfflineClassSubjectRow {
  id: number;
  subjectId: number;
  subjectName: string | null;
  teacherId: number | null;
  teacherName: string | null;
  allocationRole: string;
}

export interface OfflineClassStudentRow {
  studentId: number;
  name: string;
  admissionNo: string | null;
}

export interface OfflineClassDetail {
  id: number;
  name: string;
  code: string | null;
  subjects: OfflineClassSubjectRow[];
  roster: OfflineClassStudentRow[];
}

/** Null means the class doesn't exist (or isn't this school's) — the
 *  caller shows a clean "not found," same as every other detail view in
 *  this layer. Subjects/teachers/roster that reference a row this
 *  install doesn't have resolve to null fields rather than being
 *  dropped or crashing — a partial picture is more honest than a
 *  silently incomplete list. */
export async function getOfflineClassDetail(repos: Repos, schoolId: number, classId: number): Promise<OfflineClassDetail | null> {
  const cls = await repos.classes.findById(schoolId, classId);
  if (!cls) return null;

  const allocations = await repos.classSubjects.listActiveByClassId(schoolId, classId);
  const subjects: OfflineClassSubjectRow[] = [];
  for (const a of allocations) {
    const subject = await repos.subjects.findById(schoolId, a.subjectId);
    let teacherName: string | null = null;
    if (a.teacherId != null) {
      const teacher = await repos.staff.findById(schoolId, a.teacherId);
      if (teacher) {
        const person = await repos.people.findById(teacher.personId);
        if (person) teacherName = `${person.firstName} ${person.lastName}`.trim();
      }
    }
    subjects.push({
      id: a.id, subjectId: a.subjectId, subjectName: subject?.name ?? null,
      teacherId: a.teacherId, teacherName, allocationRole: a.allocationRole,
    });
  }

  const enrollments = await repos.enrollments.listActiveByClassId(schoolId, classId);
  const roster: OfflineClassStudentRow[] = [];
  for (const e of enrollments) {
    const student = await repos.students.findById(schoolId, e.studentId);
    if (!student) continue; // an orphaned enrollment (student deleted independently) — skip, same reasoning offline-students already uses
    const person = await repos.people.findById(student.personId);
    if (!person) continue;
    roster.push({ studentId: student.id, name: `${person.firstName} ${person.lastName}`.trim(), admissionNo: student.admissionNo });
  }

  return { id: cls.id, name: cls.name, code: cls.code, subjects, roster };
}

// ── Sub-effort 19: classes CRUD (wiring only — ClassRepo already has
// full create/update/softDelete/restore since sub-effort 2) ────────────

export async function createOfflineClass(repos: Repos, schoolId: number, input: Pick<NewClassInput, 'name' | 'code' | 'classLevel'>): Promise<OfflineClassSummary> {
  if (!input.name?.trim()) throw new RepoError('name is required', 'INVALID_INPUT');
  const cls = await repos.classes.create({ schoolId, name: input.name.trim(), code: input.code ?? null, classLevel: input.classLevel ?? null });
  return { id: cls.id, name: cls.name, code: cls.code, classLevel: cls.classLevel };
}

export async function updateOfflineClass(repos: Repos, schoolId: number, id: number, patch: Partial<Pick<NewClassInput, 'name' | 'code' | 'classLevel'>>): Promise<OfflineClassSummary> {
  const cls = await repos.classes.update(schoolId, id, patch);
  return { id: cls.id, name: cls.name, code: cls.code, classLevel: cls.classLevel };
}

export async function deleteOfflineClass(repos: Repos, schoolId: number, id: number, deletedBy: number | null): Promise<void> {
  await repos.classes.softDelete(schoolId, id, { deletedBy });
}

// ── Sub-effort 19: subjects CRUD (wiring only — SubjectRepo already has
// full CRUD since sub-effort 4) ─────────────────────────────────────────

export interface OfflineSubjectSummary { id: number; name: string; code: string | null }

export async function listOfflineSubjects(repos: Repos, schoolId: number): Promise<OfflineSubjectSummary[]> {
  const subjects = await repos.subjects.listBySchool(schoolId, { limit: 1000 });
  return subjects.map((s) => ({ id: s.id, name: s.name, code: s.code }));
}

export async function createOfflineSubject(repos: Repos, schoolId: number, input: Pick<NewSubjectInput, 'name' | 'code'>): Promise<OfflineSubjectSummary> {
  if (!input.name?.trim()) throw new RepoError('name is required', 'INVALID_INPUT');
  const subject = await repos.subjects.create({ schoolId, name: input.name.trim(), code: input.code ?? null });
  return { id: subject.id, name: subject.name, code: subject.code };
}

export async function updateOfflineSubject(repos: Repos, schoolId: number, id: number, patch: Partial<Pick<NewSubjectInput, 'name' | 'code'>>): Promise<OfflineSubjectSummary> {
  const subject = await repos.subjects.update(schoolId, id, patch);
  return { id: subject.id, name: subject.name, code: subject.code };
}

export async function deleteOfflineSubject(repos: Repos, schoolId: number, id: number, deletedBy: number | null): Promise<void> {
  await repos.subjects.softDelete(schoolId, id, { deletedBy });
}

// ── Sub-effort 19: teacher allocation CRUD (ClassSubjectRepo's new
// create/update/end, added this same sub-effort) ───────────────────────

export async function assignTeacherToSubject(
  repos: Repos, schoolId: number, input: NewClassSubjectInput,
): Promise<OfflineClassSubjectRow> {
  if (!input.classId || !input.subjectId) throw new RepoError('classId and subjectId are required', 'INVALID_INPUT');
  const allocation = await repos.classSubjects.create(schoolId, input);
  const subject = await repos.subjects.findById(schoolId, allocation.subjectId);
  let teacherName: string | null = null;
  if (allocation.teacherId != null) {
    const teacher = await repos.staff.findById(schoolId, allocation.teacherId);
    if (teacher) {
      const person = await repos.people.findById(teacher.personId);
      if (person) teacherName = `${person.firstName} ${person.lastName}`.trim();
    }
  }
  return {
    id: allocation.id, subjectId: allocation.subjectId, subjectName: subject?.name ?? null,
    teacherId: allocation.teacherId, teacherName, allocationRole: allocation.allocationRole,
  };
}

export async function endTeacherAllocation(repos: Repos, schoolId: number, id: number): Promise<void> {
  await repos.classSubjects.end(schoolId, id);
}

// ── Sub-effort 19: marks entry (ClassResultRepo already has full CRUD
// since sub-effort 2 — this is wiring, not new repo-layer logic) ───────

export interface OfflineMarkInput {
  studentId: number;
  classId: number;
  subjectId: number;
  resultTypeId: number;
  termId?: number | null;
  score?: number | null;
  grade?: string | null;
  remarks?: string | null;
}

/** Upsert by the natural key (student, class, subject, term, result
 *  type) — creates if no row exists for that combination yet, updates
 *  in place if one does. Mirrors how a real marks-entry screen behaves:
 *  re-entering the same cell corrects it, it doesn't pile up duplicate
 *  rows. */
export async function upsertOfflineResult(repos: Repos, schoolId: number, input: OfflineMarkInput) {
  const existing = await repos.classResults.findByStudentSubjectTerm(
    schoolId, input.studentId, input.classId, input.subjectId, input.termId ?? null, input.resultTypeId,
  );
  if (existing) {
    return repos.classResults.update(schoolId, existing.id, {
      score: input.score ?? null, grade: input.grade ?? null, remarks: input.remarks ?? null,
    });
  }
  const createInput: NewClassResultInput = {
    studentId: input.studentId, classId: input.classId, subjectId: input.subjectId,
    termId: input.termId ?? null, resultTypeId: input.resultTypeId,
    score: input.score ?? null, grade: input.grade ?? null, remarks: input.remarks ?? null,
  };
  return repos.classResults.create(createInput);
}

export async function deleteOfflineResult(repos: Repos, schoolId: number, id: number, deletedBy: number | null): Promise<void> {
  await repos.classResults.softDelete(schoolId, id, { deletedBy });
}

export async function listOfflineResultsForClassSubject(
  repos: Repos, schoolId: number, classId: number, subjectId: number, termId: number | null = null,
) {
  return repos.classResults.listByClassAndSubject(schoolId, classId, subjectId, termId);
}
