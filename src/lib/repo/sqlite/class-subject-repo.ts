/**
 * @drais/repo-sqlite — ClassSubjectRepo, SQLite implementation.
 * Mirrors mysql/class-subject-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { ClassSubjectRepo } from '../contract/class-subject-repo';
import type { ClassSubjectRecord, NewClassSubjectInput } from '../contract/types';
import { RepoError } from '../contract/types';

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
  const findByIdScoped = async (schoolId: number, id: number): Promise<ClassSubjectRecord | null> => {
    const row = db.prepare(`${BASE_SELECT} WHERE cs.id = ? AND c.school_id = ?`).get(id, schoolId) as ClassSubjectRow | undefined;
    return row ? toRecord(row) : null;
  };

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

    async create(schoolId, input: NewClassSubjectInput) {
      const owns = db.prepare(`SELECT 1 FROM classes WHERE id = ? AND school_id = ?`).get(input.classId, schoolId);
      if (!owns) throw new RepoError(`Class ${input.classId} not found in school ${schoolId}`, 'NOT_FOUND');

      const res = db.prepare(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id, allocation_role, status)
         VALUES (@classId, @subjectId, @teacherId, @allocationRole, 'active')`,
      ).run({
        classId: input.classId, subjectId: input.subjectId,
        teacherId: input.teacherId ?? null, allocationRole: input.allocationRole ?? 'primary_teacher',
      });
      const created = await findByIdScoped(schoolId, Number(res.lastInsertRowid));
      if (!created) throw new RepoError('Allocation vanished immediately after insert', 'NOT_FOUND');
      return created;
    },

    async update(schoolId, id, patch) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Allocation ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      const merged = {
        subjectId: patch.subjectId ?? existing.subjectId,
        teacherId: patch.teacherId !== undefined ? patch.teacherId : existing.teacherId,
        allocationRole: patch.allocationRole ?? existing.allocationRole,
      };
      db.prepare(`UPDATE class_subjects SET subject_id=@subjectId, teacher_id=@teacherId, allocation_role=@allocationRole WHERE id=@id`)
        .run({ id, ...merged });
      const updated = await findByIdScoped(schoolId, id);
      if (!updated) throw new RepoError(`Allocation ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async end(schoolId, id) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Allocation ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      db.prepare(`UPDATE class_subjects SET status = 'inactive' WHERE id = ?`).run(id);
      const ended = await findByIdScoped(schoolId, id);
      if (!ended) throw new RepoError(`Allocation ${id} vanished after end`, 'NOT_FOUND');
      return ended;
    },
  };
}
