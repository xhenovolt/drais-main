/**
 * DRCE Phase F — document version history helpers.
 *
 * Snapshots ride along with every successful save. Restoring a version is a
 * normal save of the older snapshot (which itself snapshots, so the restore
 * is itself undoable).
 *
 * Tenant safety: every helper is school-scoped via a JOIN on dvcf_documents
 * (which carries school_id). The version table has no school_id of its own
 * by design — joining is the boundary.
 */
import { query } from '@/lib/db';

export interface DocVersionRow {
  id:             number;
  document_id:    number;
  version_no:     number;
  name:           string | null;
  change_summary: string | null;
  author_user_id: number | null;
  created_at:     string;
}

export interface DocVersionFull extends DocVersionRow {
  schema_json: string;
}

/** Last version_no for a document, or 0 if none exist yet. */
export async function lastVersionNo(documentId: number): Promise<number> {
  const rows = (await query(
    `SELECT COALESCE(MAX(version_no), 0) AS n
       FROM drce_document_versions WHERE document_id = ?`,
    [documentId],
  )) as Array<{ n: number }>;
  return Number(rows[0]?.n ?? 0);
}

/** Append one version row. Pre-condition: caller already verified school ownership. */
export async function snapshotVersion(args: {
  documentId:     number;
  schemaJson:     string;
  name?:          string | null;
  changeSummary?: string | null;
  authorUserId?:  number | null;
}): Promise<{ version_no: number }> {
  const next = (await lastVersionNo(args.documentId)) + 1;
  await query(
    `INSERT INTO drce_document_versions
       (document_id, version_no, schema_json, name, change_summary, author_user_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      args.documentId,
      next,
      args.schemaJson,
      args.name ?? null,
      args.changeSummary ?? null,
      args.authorUserId ?? null,
    ],
  );
  return { version_no: next };
}

/** List versions for a document (most recent first). Tenant-checked via JOIN. */
export async function listVersions(
  documentId: number,
  schoolId:   number,
  limit:      number = 50,
): Promise<DocVersionRow[]> {
  return (await query(
    `SELECT v.id, v.document_id, v.version_no, v.name, v.change_summary,
            v.author_user_id, v.created_at
       FROM drce_document_versions v
       JOIN dvcf_documents d ON d.id = v.document_id
      WHERE v.document_id = ?
        AND (d.school_id IS NULL OR d.school_id = ?)
      ORDER BY v.version_no DESC
      LIMIT ?`,
    [documentId, schoolId, limit],
  )) as DocVersionRow[];
}

/** Fetch a single version including its full payload. Tenant-checked via JOIN. */
export async function getVersion(
  documentId: number,
  versionNo:  number,
  schoolId:   number,
): Promise<DocVersionFull | null> {
  const rows = (await query(
    `SELECT v.id, v.document_id, v.version_no, v.schema_json, v.name,
            v.change_summary, v.author_user_id, v.created_at
       FROM drce_document_versions v
       JOIN dvcf_documents d ON d.id = v.document_id
      WHERE v.document_id = ? AND v.version_no = ?
        AND (d.school_id IS NULL OR d.school_id = ?)
      LIMIT 1`,
    [documentId, versionNo, schoolId],
  )) as DocVersionFull[];
  return rows[0] ?? null;
}
