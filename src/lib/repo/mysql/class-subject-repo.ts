/**
 * @drais/repo-mysql — ClassSubjectRepo, MySQL/TiDB implementation.
 * See ../contract/class-subject-repo.ts's header for the read-only scope
 * and the join-based tenant scoping (the real table has no school_id
 * column at all).
 */
import { query } from '@/lib/db';
import type { ClassSubjectRepo } from '../contract/class-subject-repo';
import type { ClassSubjectRecord, NewClassSubjectInput } from '../contract/types';
import { RepoError } from '../contract/types';
import { toNum, toNumOrNull } from './util';

interface ClassSubjectRow {
  id: number | string;
  class_id: number | string;
  subject_id: number | string;
  teacher_id: number | string | null;
  allocation_role: string;
  display_on_report: number;
  status: string;
  academic_year_id: number | string | null;
  term_id: number | string | null;
}

function toRecord(r: ClassSubjectRow): ClassSubjectRecord {
  return {
    id: toNum(r.id),
    classId: toNum(r.class_id),
    subjectId: toNum(r.subject_id),
    teacherId: toNumOrNull(r.teacher_id),
    allocationRole: r.allocation_role,
    displayOnReport: Number(r.display_on_report) === 1,
    status: r.status,
    academicYearId: toNumOrNull(r.academic_year_id),
    termId: toNumOrNull(r.term_id),
  };
}

const BASE_SELECT = `SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.allocation_role,
                             cs.display_on_report, cs.status, cs.academic_year_id, cs.term_id
                        FROM class_subjects cs
                        JOIN classes c ON c.id = cs.class_id`;

/** Shared by update()/end() — "does this allocation exist AND belong to
 *  this school," same join-based scoping every read method here uses. */
async function findByIdScoped(schoolId: number, id: number): Promise<ClassSubjectRecord | null> {
  const rows = (await query(
    `SELECT cs.id, cs.class_id, cs.subject_id, cs.teacher_id, cs.allocation_role,
            cs.display_on_report, cs.status, cs.academic_year_id, cs.term_id
       FROM class_subjects cs JOIN classes c ON c.id = cs.class_id
      WHERE cs.id = ? AND c.school_id = ? LIMIT 1`,
    [id, schoolId],
  )) as ClassSubjectRow[];
  return rows.length ? toRecord(rows[0]) : null;
}

export function createMysqlClassSubjectRepo(): ClassSubjectRepo {
  return {
    async listActiveByClassId(schoolId, classId) {
      const rows = (await query(
        `${BASE_SELECT}
          WHERE c.school_id = ? AND cs.class_id = ? AND cs.status = 'active' AND cs.superseded_by IS NULL
          ORDER BY cs.id ASC`,
        [schoolId, classId],
      )) as ClassSubjectRow[];
      return rows.map(toRecord);
    },

    async listBySchool(schoolId) {
      const rows = (await query(
        `${BASE_SELECT} WHERE c.school_id = ? ORDER BY cs.id ASC LIMIT 100000`,
        [schoolId],
      )) as ClassSubjectRow[];
      return rows.map(toRecord);
    },

    async create(schoolId, input: NewClassSubjectInput) {
      const owns = (await query(`SELECT 1 FROM classes WHERE id = ? AND school_id = ?`, [input.classId, schoolId])) as any[];
      if (!owns.length) throw new RepoError(`Class ${input.classId} not found in school ${schoolId}`, 'NOT_FOUND');

      const res = (await query(
        `INSERT INTO class_subjects (class_id, subject_id, teacher_id, allocation_role, status)
         VALUES (?, ?, ?, ?, 'active')`,
        [input.classId, input.subjectId, input.teacherId ?? null, input.allocationRole ?? 'primary_teacher'],
      )) as unknown as { insertId?: number };
      if (!res?.insertId) throw new RepoError('Insert did not return an id', 'INVALID_INPUT');
      const created = await findByIdScoped(schoolId, res.insertId);
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
      await query(
        `UPDATE class_subjects SET subject_id = ?, teacher_id = ?, allocation_role = ? WHERE id = ?`,
        [merged.subjectId, merged.teacherId, merged.allocationRole, id],
      );
      const updated = await findByIdScoped(schoolId, id);
      if (!updated) throw new RepoError(`Allocation ${id} vanished after update`, 'NOT_FOUND');
      return updated;
    },

    async end(schoolId, id) {
      const existing = await findByIdScoped(schoolId, id);
      if (!existing) throw new RepoError(`Allocation ${id} not found in school ${schoolId}`, 'NOT_FOUND');
      await query(`UPDATE class_subjects SET status = 'inactive' WHERE id = ?`, [id]);
      const ended = await findByIdScoped(schoolId, id);
      if (!ended) throw new RepoError(`Allocation ${id} vanished after end`, 'NOT_FOUND');
      return ended;
    },
  };
}
