/**
 * P4 — DRCE template workflow.
 *
 * Pure status-transition rules + minimal SQL helpers. The route layer
 * calls these after checking permissions; the editor surfaces them via
 * /api/drce/capabilities so the UI only shows verbs the user can actually
 * perform.
 *
 * Lifecycle (linear, with a single backwards arrow):
 *
 *   draft ── submit ──▶ pending_approval ── approve ──▶ approved
 *                            │                              │
 *                            └── reject ◀──┐                │
 *                                          │                │
 *                          (back to draft) │           publish
 *                                                            │
 *                                                            ▼
 *                                                       published
 *                                                            │
 *                                                         archive
 *                                                            │
 *                                                            ▼
 *                                                       archived
 *
 * Render paths intentionally ignore status (they always render the
 * current schema_json) so the new column never accidentally hides
 * a live template. Status is governance metadata, not a visibility flag.
 */
import { query } from '@/lib/db';

export type TemplateStatus =
  | 'draft' | 'pending_approval' | 'approved' | 'published' | 'archived';

export type WorkflowAction =
  | 'submit' | 'approve' | 'reject' | 'publish' | 'archive' | 'unarchive';

/** Map of allowed (from → action → next) transitions. The function below uses it. */
const TRANSITIONS: Record<TemplateStatus, Partial<Record<WorkflowAction, TemplateStatus>>> = {
  draft:            { submit: 'pending_approval' },
  pending_approval: { approve: 'approved', reject: 'draft' },
  approved:         { publish: 'published', reject: 'draft' },
  published:        { archive: 'archived' },
  archived:         { unarchive: 'draft' },
};

export function nextStatus(from: TemplateStatus, action: WorkflowAction): TemplateStatus | null {
  return TRANSITIONS[from]?.[action] ?? null;
}

/** Which permission code gates each workflow action. */
export const ACTION_PERMISSION: Record<WorkflowAction, string> = {
  submit:    'drce.edit',
  approve:   'drce.approve',
  reject:    'drce.approve',  // rejection is part of the approval verb
  publish:   'drce.publish',
  archive:   'drce.admin',
  unarchive: 'drce.admin',
};

/** Database-side handler — single UPDATE with the correct column writes. */
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
      // Wipe pending stamps so the next submit cycle is clean. Keep the notes
      // so authors can see why it was sent back.
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

/** Convenience capability summary used by the editor to render the right buttons. */
export interface DRCECapabilities {
  view:    boolean;
  edit:    boolean;
  approve: boolean;
  publish: boolean;
  admin:   boolean;
}

/** Given a user's capabilities + a document's status, return the actions that
 *  are simultaneously allowed by lifecycle AND by permission. */
export function allowedActions(
  status: TemplateStatus,
  caps:   DRCECapabilities,
): WorkflowAction[] {
  const out: WorkflowAction[] = [];
  for (const action of Object.keys(TRANSITIONS[status] ?? {}) as WorkflowAction[]) {
    const perm = ACTION_PERMISSION[action];
    const granted =
      caps.admin ||
      (perm === 'drce.edit'    && caps.edit) ||
      (perm === 'drce.approve' && caps.approve) ||
      (perm === 'drce.publish' && caps.publish) ||
      (perm === 'drce.admin'   && caps.admin);
    if (granted) out.push(action);
  }
  return out;
}
