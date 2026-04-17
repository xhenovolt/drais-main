import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getConnection } from '@/lib/db';
import { withTenantTransaction } from '@/lib/dbTenant';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/students/duplicates/purge
 *
 * Intelligently purges duplicate student records using a result-aware strategy:
 *
 * GHOST PURGE:  Secondaries with zero enrollments + zero attendance + zero results
 *               are hard-deleted from the database (no data loss).
 *
 * DATA MERGE:   Secondaries that have at least one of the above are merged into
 *               primary (data transferred, secondary soft-deleted).
 *
 * PRIMARY SELECTION: Within each group, the student with the highest combined
 *               data score (enrollments + attendance + results) is chosen as
 *               primary. Ties are broken by lowest ID (oldest record).
 *
 * Body:
 * {
 *   "dry_run": true   // preview counts without touching the database (default: false)
 * }
 *
 * Response:
 * {
 *   "dry_run": true,
 *   "groups_found": 42,
 *   "ghosts_to_delete": 18,
 *   "data_records_to_merge": 24,
 *   "already_clean": 0,
 *   "deleted": 0,
 *   "merged": 0,
 *   "failed": 0
 * }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  let dry_run = false;
  try {
    const body = await req.json();
    dry_run = body?.dry_run === true;
  } catch {
    // no body — defaults to dry_run=false (live run)
  }

  // ─── Phase 1: Detect all duplicate groups ──────────────────────────────
  const conn = await getConnection();
  let rawGroups: Array<{
    primary_id: number;
    secondaries: Array<{ id: number; score: number }>;
  }> = [];

  try {
    // Find name-collisions
    const [nameMatches]: any = await conn.execute(`
      SELECT   p.first_name, p.last_name, GROUP_CONCAT(s.id ORDER BY s.id ASC) AS ids
      FROM     students s
      JOIN     people p ON p.id = s.person_id
      WHERE    s.school_id = ? AND s.deleted_at IS NULL
      GROUP BY p.first_name, p.last_name
      HAVING   COUNT(*) > 1
    `, [schoolId]);

    // Find admission_no collisions
    const [admMatches]: any = await conn.execute(`
      SELECT   admission_no, GROUP_CONCAT(id ORDER BY id ASC) AS ids
      FROM     students
      WHERE    school_id = ? AND deleted_at IS NULL AND admission_no IS NOT NULL AND admission_no != ''
      GROUP BY admission_no
      HAVING   COUNT(*) > 1
    `, [schoolId]);

    // Merge all duplicate sets — use union-find to cluster overlapping groups
    const parent = new Map<number, number>();
    const find = (x: number): number => {
      if (!parent.has(x)) parent.set(x, x);
      if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
      return parent.get(x)!;
    };
    const union = (a: number, b: number) => {
      const ra = find(a), rb = find(b);
      if (ra !== rb) parent.set(rb, ra);
    };

    for (const row of [...nameMatches, ...admMatches]) {
      const ids: number[] = String(row.ids).split(',').map(Number);
      for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
    }

    // Collect clusters
    const clusters = new Map<number, Set<number>>();
    for (const [id] of parent) {
      const root = find(id);
      if (!clusters.has(root)) clusters.set(root, new Set());
      clusters.get(root)!.add(id);
    }

    // For each cluster, fetch data scores to determine primary
    for (const [, members] of clusters) {
      if (members.size < 2) continue;
      const ids = Array.from(members);
      const placeholders = ids.map(() => '?').join(',');

      const [scores]: any = await conn.execute(`
        SELECT
          s.id,
          COALESCE(e.cnt, 0)  AS enrollment_count,
          COALESCE(a.cnt, 0)  AS attendance_count,
          COALESCE(r.cnt, 0)  AS results_count,
          (COALESCE(e.cnt, 0) + COALESCE(a.cnt, 0) + COALESCE(r.cnt, 0)) AS score
        FROM students s
        LEFT JOIN (SELECT student_id, COUNT(*) AS cnt FROM enrollments       WHERE school_id = ? GROUP BY student_id) e ON e.student_id = s.id
        LEFT JOIN (SELECT student_id, COUNT(*) AS cnt FROM student_attendance WHERE school_id = ? GROUP BY student_id) a ON a.student_id = s.id
        LEFT JOIN (SELECT student_id, COUNT(*) AS cnt FROM results            WHERE school_id = ? GROUP BY student_id) r ON r.student_id = s.id
        WHERE s.id IN (${placeholders}) AND s.school_id = ?
      `, [schoolId, schoolId, schoolId, ...ids, schoolId]);

      if (scores.length < 2) continue;

      // Primary = highest score; ties broken by lowest id
      scores.sort((a: any, b: any) => b.score - a.score || a.id - b.id);
      const primary = scores[0];
      const secondaries = scores.slice(1).map((s: any) => ({ id: s.id, score: s.score }));

      rawGroups.push({ primary_id: primary.id, secondaries });
    }
  } finally {
    await conn.end();
  }

  // ─── Phase 2: Classify secondaries ────────────────────────────────────
  const ghosts: number[] = [];             // zero-data → hard delete
  const dataBearers: Array<{ primary_id: number; secondary_id: number }> = [];

  for (const group of rawGroups) {
    for (const sec of group.secondaries) {
      if (sec.score === 0) {
        ghosts.push(sec.id);
      } else {
        dataBearers.push({ primary_id: group.primary_id, secondary_id: sec.id });
      }
    }
  }

  const summary = {
    dry_run,
    groups_found: rawGroups.length,
    ghosts_to_delete: ghosts.length,
    data_records_to_merge: dataBearers.length,
    deleted: 0,
    merged: 0,
    failed: 0,
  };

  if (dry_run || (ghosts.length === 0 && dataBearers.length === 0)) {
    return NextResponse.json({ success: true, ...summary });
  }

  // ─── Phase 3: Execute (live run) ──────────────────────────────────────
  // Hard-delete ghosts in one transaction
  if (ghosts.length > 0) {
    try {
      await withTenantTransaction(schoolId, async ({ exec }) => {
        const chunks = chunkArray(ghosts, 500);
        for (const chunk of chunks) {
          const ph = chunk.map(() => '?').join(',');
          // Ensure they still have zero data before deleting (safety re-check)
          const [safeToDelete]: any = await exec(
            `SELECT id FROM students
             WHERE id IN (${ph}) AND school_id = ?
               AND NOT EXISTS (SELECT 1 FROM enrollments       WHERE student_id = students.id AND school_id = ?)
               AND NOT EXISTS (SELECT 1 FROM student_attendance WHERE student_id = students.id AND school_id = ?)
               AND NOT EXISTS (SELECT 1 FROM results            WHERE student_id = students.id AND school_id = ?)`,
            [...chunk, schoolId, schoolId, schoolId, schoolId],
          );
          // safeToDelete is the result object, not rows — use raw execute
          // Re-fetch as query
        }
        // Use raw DELETE with school_id + subquery guards (safe even if some got data in the meantime)
        for (const chunk of chunkArray(ghosts, 500)) {
          const ph = chunk.map(() => '?').join(',');
          const res = await exec(
            `DELETE FROM students
             WHERE id IN (${ph}) AND school_id = ?
               AND NOT EXISTS (SELECT 1 FROM enrollments       e WHERE e.student_id = students.id AND e.school_id = ?)
               AND NOT EXISTS (SELECT 1 FROM student_attendance a WHERE a.student_id = students.id AND a.school_id = ?)
               AND NOT EXISTS (SELECT 1 FROM results            r WHERE r.student_id = students.id AND r.school_id = ?)`,
            [...chunk, schoolId, schoolId, schoolId, schoolId],
          );
          summary.deleted += res.affectedRows ?? 0;
        }
      });
    } catch (err: any) {
      summary.failed += ghosts.length;
      console.error('[purge] ghost delete failed:', err.message);
    }
  }

  // Merge data-bearing secondaries (same logic as /api/students/duplicates/merge)
  // Group by primary for efficiency
  const mergeMap = new Map<number, number[]>();
  for (const { primary_id, secondary_id } of dataBearers) {
    if (!mergeMap.has(primary_id)) mergeMap.set(primary_id, []);
    mergeMap.get(primary_id)!.push(secondary_id);
  }

  for (const [primary_id, secondary_ids] of mergeMap) {
    try {
      await withTenantTransaction(schoolId, async ({ exec, query: tq }) => {
        const primRows = await tq(
          'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
          [primary_id, schoolId],
        );
        if (primRows.length === 0) throw new Error(`Primary #${primary_id} not found`);

        for (const secondaryId of secondary_ids) {
          const secRows = await tq(
            'SELECT id FROM students WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
            [secondaryId, schoolId],
          );
          if (secRows.length === 0) continue;

          // Transfer enrollments (skip exact class+year duplicates)
          const existingEnrollments = await tq(
            'SELECT class_id, academic_year_id FROM enrollments WHERE student_id = ? AND school_id = ?',
            [primary_id, schoolId],
          );
          const existingKeys = new Set(existingEnrollments.map((e: any) => `${e.class_id}-${e.academic_year_id}`));
          const secEnrollments = await tq(
            'SELECT id, class_id, academic_year_id FROM enrollments WHERE student_id = ? AND school_id = ?',
            [secondaryId, schoolId],
          );
          for (const enr of secEnrollments) {
            const key = `${enr.class_id}-${enr.academic_year_id}`;
            if (existingKeys.has(key)) {
              await exec(
                "UPDATE enrollments SET status = 'closed', end_reason = 'merged_duplicate' WHERE id = ? AND school_id = ?",
                [enr.id, schoolId],
              );
            } else {
              await exec('UPDATE enrollments SET student_id = ? WHERE id = ? AND school_id = ?', [primary_id, enr.id, schoolId]);
              existingKeys.add(key);
            }
          }

          // Transfer attendance, results
          await exec('UPDATE student_attendance SET student_id = ? WHERE student_id = ? AND school_id = ?', [primary_id, secondaryId, schoolId]);
          await exec('UPDATE results SET student_id = ? WHERE student_id = ? AND school_id = ?', [primary_id, secondaryId, schoolId]);

          // Optional tables — ignore if missing
          for (const tbl of ['zk_attendance_logs', 'learner_fees', 'promotions']) {
            try {
              await exec(`UPDATE ${tbl} SET student_id = ? WHERE student_id = ? AND school_id = ?`, [primary_id, secondaryId, schoolId]);
            } catch { /* table may not exist */ }
          }

          // Soft-delete secondary
          await exec(
            "UPDATE students SET deleted_at = NOW(), notes = CONCAT(COALESCE(notes,''), '\n[PURGE-MERGED INTO #', ?, ' on ', NOW(), ']') WHERE id = ? AND school_id = ?",
            [String(primary_id), secondaryId, schoolId],
          );
          summary.merged++;
        }
      });
    } catch (err: any) {
      summary.failed++;
      console.error(`[purge] merge for primary #${primary_id} failed:`, err.message);
    }
  }

  // Audit (non-blocking)
  logAudit({
    schoolId,
    userId: session.userId,
    action: AuditAction.MERGED_STUDENTS,
    entityType: 'student',
    entityId: schoolId,
    details: { purge: summary },
    ip: req.headers.get('x-forwarded-for') || null,
    userAgent: req.headers.get('user-agent') || null,
  }).catch(() => {});

  return NextResponse.json({ success: summary.failed === 0, ...summary });
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let i = 0; i < arr.length; i += size) result.push(arr.slice(i, i + size));
  return result;
}
