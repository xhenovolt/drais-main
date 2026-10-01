/**
 * @drais/repo-contract — ReportSnapshotRepo interface.
 * See ./types.ts's header on ReportSnapshotRecord for the read-only scope.
 */
import type { ReportSnapshotRecord, ListOptions } from './types';

export interface ReportSnapshotRepo {
  /** Index rows only (snapshotJson is null) — for a list screen that
   *  shouldn't load every payload just to show what's available. */
  listReadyBySchool(schoolId: number, opts?: ListOptions): Promise<ReportSnapshotRecord[]>;
  /** The full record INCLUDING the payload, for viewing one snapshot. */
  findBySnapshotId(schoolId: number, snapshotId: string): Promise<ReportSnapshotRecord | null>;
}
