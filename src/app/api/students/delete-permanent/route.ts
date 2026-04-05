import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

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
    id = parseInt(String(body.id, 10), 10);
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

    // Cascade delete child tables in FK order
    await conn.execute('DELETE FROM student_ledger        WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM finance_payments      WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM fee_assignment_log    WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_fee_items     WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM fee_invoices          WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM fee_payments          WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM enrollment_programs   WHERE enrollment_id IN (SELECT id FROM enrollments WHERE student_id = ?)', [id]);
    await conn.execute('DELETE FROM enrollments           WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_contacts      WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_documents     WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_fingerprints  WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_profiles      WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_parents       WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_requirements  WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_additional_info WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM student_history       WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM device_user_mappings  WHERE user_id = ? AND user_type = "student"', [id]);
    await conn.execute('DELETE FROM fingerprints          WHERE student_id = ?', [id]);
    await conn.execute('DELETE FROM students              WHERE id = ? AND school_id = ?', [id, schoolId]);

    return NextResponse.json({ success: true, message: 'Student permanently deleted.' });
  } catch (error: any) {
    console.error('Permanent delete error:', error);
    return NextResponse.json({ error: 'Failed to permanently delete student', detail: error.message }, { status: 500 });
  } finally {
    await conn.end();
  }
}
