/**
 * @drais/repo-mysql — ClassSubjectRepo, MySQL/TiDB implementation.
 * See ../contract/class-subject-repo.ts's header for the read-only scope
 * and the join-based tenant scoping (the real table has no school_id
 * column at all).
 */
import { query } from '@/lib/db';
import type { ClassSubjectRepo } from '../contract/class-subject-repo';
import type { ClassSubjectRecord } from '../contract/types';
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
  };
}
