/**
 * @drais/repo-sqlite — ReportSnapshotRepo, SQLite implementation.
 * Mirrors mysql/report-snapshot-repo.ts's contract exactly.
 */
import type { SqliteConnection } from './connection';
import type { ReportSnapshotRepo } from '../contract/report-snapshot-repo';
import type { ReportSnapshotRecord, ReportSnapshotStatus, ListOptions } from '../contract/types';

interface SnapshotRow {
  id: number;
  snapshot_id: string;
  school_id: number;
  type: string;
  term_id: number;
  year_id: number;
  result_type_id: number | null;
  status: ReportSnapshotStatus;
  class_count: number;
  student_count: number;
  result_count: number;
  generated_at: string;
  completed_at: string | null;
  snapshot_json: string | null;
}

function toRecord(r: SnapshotRow, includePayload: boolean): ReportSnapshotRecord {
  return {
    id: r.id,
    snapshotId: r.snapshot_id,
    schoolId: r.school_id,
    type: r.type,
    termId: r.term_id,
    yearId: r.year_id,
    resultTypeId: r.result_type_id,
    status: r.status,
    classCount: r.class_count,
    studentCount: r.student_count,
    resultCount: r.result_count,
    generatedAt: r.generated_at,
    completedAt: r.completed_at,
    snapshotJson: includePayload ? r.snapshot_json : null,
  };
}

const INDEX_COLS = `id, snapshot_id, school_id, type, term_id, year_id, result_type_id,
                     status, class_count, student_count, result_count, generated_at, completed_at`;

export function createSqliteReportSnapshotRepo(db: SqliteConnection): ReportSnapshotRepo {
  return {
    async listReadyBySchool(schoolId, opts: ListOptions = {}) {
      const limit = Math.max(1, Math.min(500, opts.limit ?? 100));
      const rows = db.prepare(
        `SELECT ${INDEX_COLS} FROM report_snapshots
          WHERE school_id = ? AND status = 'ready'
          ORDER BY generated_at DESC LIMIT ?`,
      ).all(schoolId, limit) as SnapshotRow[];
      return rows.map((r) => toRecord(r, false));
    },

    async findBySnapshotId(schoolId, snapshotId) {
      const row = db.prepare(
        `SELECT ${INDEX_COLS}, snapshot_json FROM report_snapshots
          WHERE snapshot_id = ? AND school_id = ? LIMIT 1`,
      ).get(snapshotId, schoolId) as SnapshotRow | undefined;
      return row ? toRecord(row, true) : null;
    },
  };
}
