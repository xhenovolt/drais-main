/**
 * @drais/repo-sqlite — ClassSubjectRepo, SQLite implementation.
 * Mirrors mysql/class-subject-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { ClassSubjectRepo } from '../contract/class-subject-repo';
import type { ClassSubjectRecord } from '../contract/types';

interface ClassSubjectRow {
  id: number;
  class_id: number;
  subject_id: number;
  teacher_id: number | null;
  allocation_role: string;
  display_on_report: number;
  status: string;
  academic_year_id: number | null;
  term_id: number | null;
}

function toRecord(r: ClassSubjectRow): ClassSubjectRecord {
  return {
    id: r.id, classId: r.class_id, subjectId: r.subject_id, teacherId: r.teacher_id,
    allocationRole: r.allocation_role, displayOnReport: r.display_on_report === 1,
    status: r.status, academicYearId: r.academic_year_id, termId: r.term_id,
  };
}

const SELECT_COLS = `cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.allocation_role,
                      cs.display_on_report, cs.status, cs.academic_year_id, cs.term_id`;
const BASE_SELECT = `SELECT ${SELECT_COLS} FROM class_subjects cs JOIN classes c ON c.id = cs.class_id`;

export function createSqliteClassSubjectRepo(db: SqliteConnection): ClassSubjectRepo {
  return {
    async listActiveByClassId(schoolId, classId) {
      const rows = db.prepare(
        `${BASE_SELECT}
          WHERE c.school_id = ? AND cs.class_id = ? AND cs.status = 'active' AND cs.superseded_by IS NULL
          ORDER BY cs.id ASC`,
      ).all(schoolId, classId) as ClassSubjectRow[];
      return rows.map(toRecord);
    },

    async listBySchool(schoolId) {
      const rows = db.prepare(
        `${BASE_SELECT} WHERE c.school_id = ? ORDER BY cs.id ASC`,
      ).all(schoolId) as ClassSubjectRow[];
      return rows.map(toRecord);
    },
  };
}
