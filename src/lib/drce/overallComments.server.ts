/**
 * Server-only CRUD for the Intelligent Overall-Comment engine (Phase II).
 *
 * Kept separate from commentEngine.ts because that module's pure resolver is
 * imported by the snapshot generator and (for live preview) client-safe code
 * — mixing the mysql2-backed `query` import in would pull `tls` into client
 * bundles, exactly the problem reportComments.server.ts already documents.
 *
 * `report_overall_comment_rules` is created by
 * database/migrations/tidb/035_report_overall_comment_rules.sql (the
 * production schema strategy). ensureSchema() below is a defensive fallback
 * only — see scripts/db/migrate.mjs's header — so this module still works on
 * an environment where the migration hasn't been run yet.
 */
import { query } from '@/lib/db';
import type { CommentBankRule, CommentRole } from './commentEngine';
import type { VisibilityRule } from './visibility';

let ensured: Promise<void> | null = null;
function ensureSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS report_overall_comment_rules (
         id                BIGINT        NOT NULL AUTO_INCREMENT,
         school_id         BIGINT        NOT NULL,
         role              VARCHAR(24)   NOT NULL,
         template_id       BIGINT        NULL,
         custom_key        VARCHAR(64)   NULL,
         mode              VARCHAR(8)    NOT NULL DEFAULT 'replace',
         condition_json    JSON          NULL,
         comment_text      TEXT          NOT NULL,
         comment_text_ar   TEXT          NULL,
         priority          INT           NOT NULL DEFAULT 100,
         is_active         TINYINT       NOT NULL DEFAULT 1,
         created_by        BIGINT        NULL,
         created_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
         updated_at        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
         PRIMARY KEY (id),
         KEY idx_school_role_active (school_id, role, is_active)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, [],
    ).catch(() => {});
  })();
  return ensured;
}

interface Row {
  id: number;
  school_id: number;
  role: string;
  template_id: number | null;
  custom_key: string | null;
  mode: string;
  condition_json: string | VisibilityRule | null;
  comment_text: string;
  comment_text_ar: string | null;
  priority: number;
  is_active: number;
}

function toRule(r: Row): CommentBankRule {
  let condition: VisibilityRule | null = null;
  if (r.condition_json != null) {
    condition = typeof r.condition_json === 'string' ? JSON.parse(r.condition_json) : r.condition_json;
  }
  return {
    id: r.id,
    schoolId: r.school_id,
    role: r.role as CommentRole,
    templateId: r.template_id,
    customKey: r.custom_key,
    mode: (r.mode as 'replace' | 'append') || 'replace',
    condition,
    commentText: r.comment_text,
    commentTextAr: r.comment_text_ar,
    priority: r.priority,
    isActive: !!r.is_active,
  };
}

/**
 * List a school's overall-comment rules.
 * - No `templateId` (admin panel): every rule, regardless of scope, so
 *   admins can see and manage the full set in one place.
 * - `templateId` given (render-time resolution): only rules that apply to
 *   THAT template — unscoped (template_id IS NULL) rules plus any scoped
 *   specifically to it.
 */
export async function listOverallCommentRules(schoolId: number, templateId?: number | null): Promise<CommentBankRule[]> {
  await ensureSchema();
  const sql = templateId != null
    ? `SELECT * FROM report_overall_comment_rules WHERE school_id = ? AND (template_id IS NULL OR template_id = ?) ORDER BY is_active DESC, role ASC, priority ASC, id DESC`
    : `SELECT * FROM report_overall_comment_rules WHERE school_id = ? ORDER BY is_active DESC, role ASC, priority ASC, id DESC`;
  const params = templateId != null ? [schoolId, templateId] : [schoolId];
  const rows = (await query(sql, params).catch(() => [])) as Row[];
  return rows.map(toRule);
}

export async function createOverallCommentRule(
  schoolId: number,
  b: Partial<CommentBankRule>,
  userId?: number | null,
): Promise<number> {
  await ensureSchema();
  if (!b.role) throw new Error('role is required');
  if (!b.commentText?.trim()) throw new Error('commentText is required');
  if (b.role === 'custom' && !b.customKey?.trim()) throw new Error('customKey is required when role is "custom"');

  const res = (await query(
    `INSERT INTO report_overall_comment_rules
       (school_id, role, template_id, custom_key, mode, condition_json, comment_text, comment_text_ar, priority, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schoolId, b.role, b.templateId ?? null, b.customKey ?? null, b.mode ?? 'replace',
      b.condition ? JSON.stringify(b.condition) : null,
      b.commentText, b.commentTextAr ?? null,
      b.priority ?? 100, b.isActive === false ? 0 : 1, userId ?? null,
    ],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function updateOverallCommentRule(
  schoolId: number,
  id: number,
  b: Partial<CommentBankRule>,
): Promise<void> {
  await ensureSchema();
  const sets: string[] = [];
  const params: any[] = [];
  if (b.role !== undefined)          { sets.push('role = ?');            params.push(b.role); }
  if (b.templateId !== undefined)    { sets.push('template_id = ?');     params.push(b.templateId ?? null); }
  if (b.customKey !== undefined)     { sets.push('custom_key = ?');       params.push(b.customKey || null); }
  if (b.mode !== undefined)          { sets.push('mode = ?');             params.push(b.mode); }
  if (b.condition !== undefined)     { sets.push('condition_json = ?');   params.push(b.condition ? JSON.stringify(b.condition) : null); }
  if (b.commentText !== undefined)   { sets.push('comment_text = ?');     params.push(b.commentText); }
  if (b.commentTextAr !== undefined) { sets.push('comment_text_ar = ?');  params.push(b.commentTextAr || null); }
  if (b.priority !== undefined)      { sets.push('priority = ?');         params.push(b.priority); }
  if (b.isActive !== undefined)      { sets.push('is_active = ?');        params.push(b.isActive ? 1 : 0); }
  if (!sets.length) return;
  params.push(id, schoolId);
  await query(`UPDATE report_overall_comment_rules SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, params);
}

export async function deleteOverallCommentRule(schoolId: number, id: number): Promise<void> {
  await ensureSchema();
  await query(`DELETE FROM report_overall_comment_rules WHERE id = ? AND school_id = ?`, [id, schoolId]);
}

/** Bulk reorder — accepts an array of {id, priority} and applies them in one
 *  pass. Used by the admin UI's drag-to-reorder list. */
export async function reorderOverallCommentRules(
  schoolId: number,
  order: Array<{ id: number; priority: number }>,
): Promise<void> {
  await ensureSchema();
  for (const { id, priority } of order) {
    await query(
      `UPDATE report_overall_comment_rules SET priority = ? WHERE id = ? AND school_id = ?`,
      [priority, id, schoolId],
    );
  }
}
