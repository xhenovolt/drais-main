/**
 * @drais/repo — the offline-academics slice (Phase 7 sub-effort 17).
 *
 * Deliberately smaller than "academics," same discipline as every prior
 * module: browse classes, see who teaches what in one (via ClassSubjectRepo,
 * sub-effort 16) and who's currently enrolled in it (via EnrollmentRepo,
 * sub-effort 15) — composed from clean repo calls, not a raw join. No
 * marks entry here: class_results is real write-heavy data with the same
 * conflict-risk class `results` has online (two teachers editing the same
 * student's marks) — sequenced as its own reviewed piece, not bundled in
 * silently. This slice is read-only browsing, full stop.
 */
import type { Repos } from '../contract';

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
      subjectId: a.subjectId, subjectName: subject?.name ?? null,
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
