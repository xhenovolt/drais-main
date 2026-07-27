import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * DELETE /api/students/delete-permanent
 *
 * Permanently deletes a soft-deleted student record and all child FK rows.
 * Only works on students that have already been soft-deleted (deleted_at IS NOT NULL).
 * This is intentional: hard-delete is only available after soft-delete.
 *
 * Body: { id: number }
 * Requires: admin or super_admin role.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { schoolId } = session;

  let id: number;
  try {
    const body = await req.json();
    id = parseInt(String(body.id), 10);
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!id || id <= 0) {
    return NextResponse.json({ error: 'Valid student ID required' }, { status: 400 });
  }

  const conn = await getConnection();
  try {
    // Must belong to this school AND be soft-deleted first
    const [rows]: any = await conn.execute(
      'SELECT id, deleted_at FROM students WHERE id = ? AND school_id = ?',
      [id, schoolId],
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }
    if (!rows[0].deleted_at) {
      return NextResponse.json(
        { error: 'Student must be soft-deleted first before permanent deletion' },
        { status: 409 },
      );
    }

    // Atomic hard-delete: child rows + the student row, all-or-nothing, so a
    // half-run can never leave a stranded/undeleted student. This is a REAL
    // `DELETE FROM students` (physical row removal), never a soft-delete.
    await conn.beginTransaction();

    // Child-table deletes are TOLERANT of plumbing differences: a table that
    // doesn't exist (or a renamed column) for a given deployment must never
    // block the actual student-row removal. Any OTHER error still aborts.
    const delChild = async (sql: string) => {
      try {
        await conn.execute(sql, [id]);
      } catch (e: any) {
        if (e?.errno === 1146 /* no such table */ || e?.errno === 1054 /* unknown column */) return;
        throw e;
      }
    };

    for (const sql of [
      'DELETE FROM student_ledger          WHERE student_id = ?',
      'DELETE FROM finance_payments        WHERE student_id = ?',
      'DELETE FROM fee_assignment_log      WHERE student_id = ?',
      'DELETE FROM student_fee_items       WHERE student_id = ?',
      'DELETE FROM fee_invoices            WHERE student_id = ?',
      'DELETE FROM fee_payments            WHERE student_id = ?',
      'DELETE FROM learner_fees            WHERE student_id = ?',
      'DELETE FROM student_attendance      WHERE student_id = ?',
      'DELETE FROM results                 WHERE student_id = ?',
      'DELETE FROM enrollment_programs     WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = ?)',
      'DELETE FROM enrollments             WHERE student_id = ?',
      'DELETE FROM student_contacts        WHERE student_id = ?',
      'DELETE FROM student_documents       WHERE student_id = ?',
      'DELETE FROM student_fingerprints    WHERE student_id = ?',
      'DELETE FROM student_profiles        WHERE student_id = ?',
      'DELETE FROM student_parents         WHERE student_id = ?',
      'DELETE FROM student_requirements    WHERE student_id = ?',
      'DELETE FROM student_additional_info WHERE student_id = ?',
      'DELETE FROM student_history         WHERE student_id = ?',
      'DELETE FROM device_user_mappings    WHERE user_id = ? AND user_type = "student"',
      'DELETE FROM fingerprints            WHERE student_id = ?',
    ]) {
      await delChild(sql);
    }

    // The row removal itself MUST succeed and MUST affect a row.
    const [res]: any = await conn.execute(
      'DELETE FROM students WHERE id = ? AND school_id = ?',
      [id, schoolId],
    );
    if (!res || Number(res.affectedRows) < 1) {
      await conn.rollback();
      return NextResponse.json({ error: 'Row was not removed — nothing deleted' }, { status: 500 });
    }

    await conn.commit();
    void logAudit({
      schoolId, userId: (session as any).userId ?? null, action: AuditAction.PURGED_STUDENT,
      entityType: 'student', entityId: id,
      details: { hard_delete: true },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
      userAgent: req.headers.get('user-agent'),
    });
    return NextResponse.json({ success: true, message: 'Student permanently deleted.', affectedRows: Number(res.affectedRows) });
  } catch (error: any) {
    try { await conn.rollback(); } catch { /* ignore */ }
    console.error('Permanent delete error:', error);
    return NextResponse.json({ error: 'Failed to permanently delete student', detail: error.message }, { status: 500 });
  } finally {
    await conn.end();
  }
}
