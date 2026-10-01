/**
 * @drais/repo-mysql — ReportSnapshotRepo, MySQL/TiDB implementation.
 * See ../contract/report-snapshot-repo.ts's header for the read-only scope.
 * Deliberately does NOT reuse src/lib/snapshots/storage.ts's queries — this
 * repo is its own, independently-reviewed read path (§25a's rule: new repo
 * code is written fresh against the schema, not grafted onto an existing
 * online file), covering only the columns this slice's record type needs.
 */
import { query } from '@/lib/db';
import type { ReportSnapshotRepo } from '../contract/report-snapshot-repo';
import type { ReportSnapshotRecord, ReportSnapshotStatus, ListOptions } from '../contract/types';
import { toIso, toIsoRequired, toNum } from './util';

interface SnapshotIndexRow {
  id: number | string;
  snapshot_id: string;
  school_id: number | string;
  type: string;
  term_id: number | string;
  year_id: number | string;
  result_type_id: number | string | null;
  status: ReportSnapshotStatus;
  class_count: number;
  student_count: number;
  result_count: number;
  generated_at: string | Date;
  completed_at: string | Date | null;
}

function toRecord(r: SnapshotIndexRow, snapshotJson: string | null): ReportSnapshotRecord {
  return {
    id: toNum(r.id),
    snapshotId: r.snapshot_id,
    schoolId: toNum(r.school_id),
    type: r.type,
    termId: toNum(r.term_id),
    yearId: toNum(r.year_id),
    resultTypeId: r.result_type_id == null ? null : toNum(r.result_type_id),
    status: r.status,
    classCount: r.class_count,
    studentCount: r.student_count,
    resultCount: r.result_count,
    generatedAt: toIsoRequired(r.generated_at),
    completedAt: toIso(r.completed_at),
    snapshotJson,
  };
}

const INDEX_COLS = `id, snapshot_id, school_id, type, term_id, year_id, result_type_id,
                     status, class_count, student_count, result_count, generated_at, completed_at`;

export function createMysqlReportSnapshotRepo(): ReportSnapshotRepo {
  return {
    async listReadyBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
      const rows = (await query(
        `SELECT ${INDEX_COLS} FROM report_snapshots
          WHERE school_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT ${limit}`,
        [schoolId],
      )) as SnapshotIndexRow[];
      return rows.map((r) => toRecord(r, null));
    },

    async findBySnapshotId(schoolId, snapshotId) {
      const rows = (await query(
        `SELECT ${INDEX_COLS}, snapshot_json FROM report_snapshots
          WHERE snapshot_id = ? AND school_id = ? LIMIT 1`,
        [snapshotId, schoolId],
      )) as Array<SnapshotIndexRow & { snapshot_json: string | null }>;
      if (!rows.length) return null;
      return toRecord(rows[0], rows[0].snapshot_json ?? null);
    },
  };
}
