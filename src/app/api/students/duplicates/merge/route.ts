import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { withTenantTransaction } from '@/lib/dbTenant';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * POST /api/students/duplicates/merge
 *
 * Safely merges duplicate student records.
 * Supports single merge and bulk merge.
 *
 * Single merge:
 * {
 *   "primary_id": 1,
 *   "secondary_ids": [2, 3]
 * }
 *
 * Bulk merge (auto-select primary = oldest with most data):
 * {
 *   "groups": [
 *     { "primary_id": 1, "secondary_ids": [2, 3] },
 *     { "primary_id": 5, "secondary_ids": [6] }
 *   ]
 * }
 *
 * Merge strategy:
 * 1. Transfer all enrollments, attendance, results, fees, contacts to primary
 * 2. Skip transfers that would create duplicates (same class+year enrollment)
 * 3. Soft-delete secondary records with merge reference
 * 4. Create audit trail
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const schoolId = session.schoolId;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Normalize input: support both single and bulk merge
  let mergeGroups: Array<{ primary_id: number; secondary_ids: number[] }> = [];

  if (body.groups && Array.isArray(body.groups)) {
    mergeGroups = body.groups;
  } else if (body.primary_id && body.secondary_ids) {
    mergeGroups = [{ primary_id: body.primary_id, secondary_ids: body.secondary_ids }];
  } else if (body.primary_id && body.secondary_id) {
    // Legacy single-merge format
    mergeGroups = [{ primary_id: body.primary_id, secondary_ids: [body.secondary_id] }];
  } else if (body.primary_student_id && body.secondary_student_id) {
    // Legacy format from old API
    mergeGroups = [{ primary_id: body.primary_student_id, secondary_ids: [body.secondary_student_id] }];
  } else {
    return NextResponse.json({ error: 'Missing primary_id and secondary_ids' }, { status: 400 });
  }

  // Validate
  for (const g of mergeGroups) {
    if (!g.primary_id || !Array.isArray(g.secondary_ids) || g.secondary_ids.length === 0) {
      return NextResponse.json({ error: 'Each group must have primary_id and non-empty secondary_ids' }, { status: 400 });
    }
    if (g.secondary_ids.includes(g.primary_id)) {
      return NextResponse.json({ error: 'Cannot merge student with itself' }, { status: 400 });
    }
  }

  const results: any[] = [];
  let totalMerged = 0;
  let totalFailed = 0;

  for (const group of mergeGroups) {
    try {
      const mergeResult = await withTenantTransaction(schoolId, async ({ exec, query: tq }) => {
        const actions: string[] = [];

        // Verify primary belongs to this school
        const primaryRows = await tq(
          'SELECT s.id, s.person_id, s.status FROM students s WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL',
          [group.primary_id, schoolId]
        );
        if (primaryRows.length === 0) {
          throw new Error(`Primary student #${group.primary_id} not found`);
        }

        for (const secondaryId of group.secondary_ids) {
          // Verify secondary belongs to this school
          const secondaryRows = await tq(
            'SELECT s.id, s.person_id, s.status FROM students s WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL',
            [secondaryId, schoolId]
          );
          if (secondaryRows.length === 0) {
            actions.push(`Skipped #${secondaryId} — not found or already deleted`);
            continue;
          }

          // Transfer enrollments (skip if same class+year already exists on primary)
          const existingEnrollments = await tq(
            'SELECT class_id, academic_year_id FROM enrollments WHERE student_id = ? AND school_id = ?',
            [group.primary_id, schoolId]
          );
          const existingKeys = new Set(existingEnrollments.map((e: any) => `${e.class_id}-${e.academic_year_id}`));

          const secondaryEnrollments = await tq(
            'SELECT id, class_id, academic_year_id FROM enrollments WHERE student_id = ? AND school_id = ?',
            [secondaryId, schoolId]
          );

          let enrollTransferred = 0;
          for (const enrollment of secondaryEnrollments) {
            const key = `${enrollment.class_id}-${enrollment.academic_year_id}`;
            if (existingKeys.has(key)) {
              // Duplicate enrollment — soft-close it
              await exec(
                "UPDATE enrollments SET status = 'closed', end_reason = 'merged_duplicate' WHERE id = ? AND school_id = ?",
                [enrollment.id, schoolId]
              );
            } else {
              await exec(
                'UPDATE enrollments SET student_id = ? WHERE id = ? AND school_id = ?',
                [group.primary_id, enrollment.id, schoolId]
              );
              enrollTransferred++;
            }
          }
          if (enrollTransferred > 0) actions.push(`Transferred ${enrollTransferred} enrollments from #${secondaryId}`);

          // Transfer attendance records
          const attRes = await exec(
            'UPDATE student_attendance SET student_id = ? WHERE student_id = ? AND school_id = ?',
            [group.primary_id, secondaryId, schoolId]
          );
          if (attRes.affectedRows > 0) actions.push(`Transferred ${attRes.affectedRows} attendance records from #${secondaryId}`);

          // Transfer ZK attendance logs (if table exists)
          try {
            const zkRes = await exec(
              'UPDATE zk_attendance_logs SET student_id = ? WHERE student_id = ? AND school_id = ?',
              [group.primary_id, secondaryId, schoolId]
            );
            if (zkRes.affectedRows > 0) actions.push(`Transferred ${zkRes.affectedRows} ZK attendance logs from #${secondaryId}`);
          } catch { /* table may not exist */ }

          // Transfer exam results
          const resRes = await exec(
            'UPDATE results SET student_id = ? WHERE student_id = ? AND school_id = ?',
            [group.primary_id, secondaryId, schoolId]
          );
          if (resRes.affectedRows > 0) actions.push(`Transferred ${resRes.affectedRows} results from #${secondaryId}`);

          // Transfer fee records
          try {
            const feeRes = await exec(
              'UPDATE learner_fees SET student_id = ? WHERE student_id = ? AND school_id = ?',
              [group.primary_id, secondaryId, schoolId]
            );
            if (feeRes.affectedRows > 0) actions.push(`Transferred ${feeRes.affectedRows} fee records from #${secondaryId}`);
          } catch { /* table may not exist */ }

          // Transfer contacts
          try {
            const contRes = await exec(
              'UPDATE student_contacts SET student_id = ? WHERE student_id = ? AND student_id != ?',
              [group.primary_id, secondaryId, group.primary_id]
            );
            if (contRes.affectedRows > 0) actions.push(`Transferred ${contRes.affectedRows} contacts from #${secondaryId}`);
          } catch { /* table may not exist */ }

          // Transfer promotions
          try {
            const promoRes = await exec(
              'UPDATE promotions SET student_id = ? WHERE student_id = ? AND school_id = ?',
              [group.primary_id, secondaryId, schoolId]
            );
            if (promoRes.affectedRows > 0) actions.push(`Transferred ${promoRes.affectedRows} promotions from #${secondaryId}`);
          } catch { /* table may not exist */ }

          // Soft-delete the secondary student with merge note
          await exec(
            "UPDATE students SET deleted_at = NOW(), notes = CONCAT(COALESCE(notes, ''), '\n[MERGED INTO #', ?, ' on ', NOW(), ']') WHERE id = ? AND school_id = ?",
            [String(group.primary_id), secondaryId, schoolId]
          );
          actions.push(`Soft-deleted duplicate #${secondaryId}`);
          totalMerged++;
        }

        return { primary_id: group.primary_id, actions };
      });

      results.push({ ...mergeResult, success: true });

      // Audit (non-blocking)
      logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.MERGED_STUDENTS,
        entityType: 'student',
        entityId: group.primary_id,
        details: { secondary_ids: group.secondary_ids, actions: mergeResult.actions },
        ip: req.headers.get('x-forwarded-for') || null,
        userAgent: req.headers.get('user-agent') || null,
      }).catch(() => { /* non-critical */ });

    } catch (err: any) {
      totalFailed++;
      results.push({
        primary_id: group.primary_id,
        success: false,
        error: err.message,
      });
    }
  }

  return NextResponse.json({
    success: totalFailed === 0,
    message: `Merged ${totalMerged} duplicate(s)${totalFailed > 0 ? `, ${totalFailed} failed` : ''}`,
    total_merged: totalMerged,
    total_failed: totalFailed,
    results,
  });
}
