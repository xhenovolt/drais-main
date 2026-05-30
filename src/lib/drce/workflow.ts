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
// Client-bundle safe: this file has NO server-only imports (no @/lib/db,
// no fs, no anything Node-specific). Server-side mutations live in
// workflow-server.ts. DRCEEditor.tsx and other React clients only need
// the types + pure helpers below.

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

// applyTransition lives in workflow-server.ts so this module stays
// client-bundle safe. Server callers import it from there:
//   import { applyTransition } from '@/lib/drce/workflow-server';

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
