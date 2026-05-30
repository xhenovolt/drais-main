/**
 * Server-only side of the DRCE template workflow.
 *
 * Holds the DB-touching `applyTransition` so the client-bundle-safe
 * `workflow.ts` (types + pure helpers only) can be imported from React
 * components without dragging `mysql2` and Node's `tls` into the browser
 * bundle. The API route at /api/dvcf/documents/[id]/workflow imports
 * from here; nothing else should.
 */
import { query } from '@/lib/db';
import {
  type TemplateStatus, type WorkflowAction, nextStatus,
} from './workflow';

export async function applyTransition(args: {
  documentId: number;
  schoolId:   number;
  userId:     number;
  action:     WorkflowAction;
  notes?:     string;
}): Promise<{ ok: true; nextStatus: TemplateStatus } | { ok: false; reason: string }> {
  const { documentId, schoolId, userId, action, notes } = args;

  const rows = (await query(
    `SELECT id, school_id, status FROM dvcf_documents WHERE id = ? LIMIT 1`,
    [documentId],
  )) as Array<{ id: number; school_id: number | null; status: TemplateStatus }>;
  const row = rows[0];
  if (!row) return { ok: false, reason: 'Document not found' };
  if (row.school_id !== null && row.school_id !== schoolId) {
    return { ok: false, reason: 'Forbidden — not your school' };
  }

  const next = nextStatus(row.status, action);
  if (!next) return { ok: false, reason: `Cannot ${action} from "${row.status}"` };

  const cols: string[] = [`status = ?`];
  const vals: unknown[] = [next];
  const now = new Date();

  switch (action) {
    case 'submit':
      cols.push('submitted_at = ?', 'submitted_by = ?'); vals.push(now, userId);
      break;
    case 'approve':
      cols.push('approved_at = ?', 'approved_by = ?');   vals.push(now, userId);
      if (notes) { cols.push('approval_notes = ?'); vals.push(notes.slice(0, 500)); }
      break;
    case 'reject':
      cols.push('submitted_at = NULL', 'submitted_by = NULL');
      if (notes) { cols.push('approval_notes = ?'); vals.push(notes.slice(0, 500)); }
      break;
    case 'publish':
      cols.push('published_at = ?', 'published_by = ?'); vals.push(now, userId);
      break;
    case 'archive':
      cols.push('archived_at = ?',  'archived_by = ?');  vals.push(now, userId);
      break;
    case 'unarchive':
      cols.push('archived_at = NULL', 'archived_by = NULL');
      break;
  }

  vals.push(documentId);
  await query(`UPDATE dvcf_documents SET ${cols.join(', ')} WHERE id = ?`, vals);
  return { ok: true, nextStatus: next };
}
