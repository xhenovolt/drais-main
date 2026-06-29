/**
 * Server-only CRUD for report comment rules.
 *
 * Kept separate from reportComments.ts because that module's pure
 * `resolveComment` is imported by a client component (the live preview on
 * /settings/report-comments). Mixing the mysql2-backed `query` import into the
 * same file pulled `tls` into the client bundle and broke the Vercel build.
 */
import { query } from '@/lib/db';
import type { CommentRule } from './reportComments';

export async function listCommentRules(schoolId: number) {
  return query(
    `SELECT * FROM report_comment_rules WHERE school_id = ? ORDER BY is_active DESC, priority ASC, id DESC`,
    [schoolId],
  ) as Promise<any[]>;
}

export async function createCommentRule(schoolId: number, b: CommentRule, userId?: number | null): Promise<number> {
  const res = (await query(
    `INSERT INTO report_comment_rules
       (school_id, scope, subject_id, class_id, program_id, grade_code, min_score, max_score,
        competency_level, comment_text, language, priority, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [schoolId, b.scope ?? 'global', b.subject_id ?? null, b.class_id ?? null, b.program_id ?? null,
     b.grade_code || null, b.min_score ?? null, b.max_score ?? null, b.competency_level || null,
     b.comment_text, b.language || 'en', b.priority ?? 100, b.is_active === false ? 0 : 1, userId ?? null],
  )) as unknown as { insertId: number };
  return res.insertId;
}

export async function updateCommentRule(schoolId: number, id: number, b: Partial<CommentRule>): Promise<void> {
  const cols = ['scope', 'subject_id', 'class_id', 'program_id', 'grade_code', 'min_score', 'max_score', 'competency_level', 'comment_text', 'language', 'priority', 'is_active'];
  const sets: string[] = []; const params: any[] = [];
  for (const c of cols) if ((b as any)[c] !== undefined) {
    sets.push(`${c} = ?`);
    params.push(c === 'is_active' ? ((b as any)[c] ? 1 : 0) : ((b as any)[c] === '' ? null : (b as any)[c]));
  }
  if (!sets.length) return;
  params.push(id, schoolId);
  await query(`UPDATE report_comment_rules SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`, params);
}

export async function deleteCommentRule(schoolId: number, id: number): Promise<void> {
  await query(`DELETE FROM report_comment_rules WHERE id = ? AND school_id = ?`, [id, schoolId]);
}
