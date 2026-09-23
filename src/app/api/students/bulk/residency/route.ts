import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { checkAnyPermission } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

const VALID_STATUSES = ['day', 'boarding'] as const;

/**
 * POST /api/students/bulk/residency
 *
 * Bulk-classify students as day scholar or boarding (students.residency_status,
 * migration 048). Mirrors /api/students/bulk/status's tenant-verification
 * shape, with the transaction + audit-after-commit pattern from
 * /api/students/bulk-assign.
 *
 * Request: { "student_ids": [1,2,3], "residency_status": "day" | "boarding" }
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const schoolId = session.schoolId;

  const denied = await checkAnyPermission(session.userId, schoolId, ['academics.residency.manage'], session.isSuperAdmin);
  if (denied) return denied;

  const conn = await getConnection();
  try {
    const { student_ids, residency_status } = await req.json();

    if (!student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return NextResponse.json({ error: 'Invalid student_ids' }, { status: 400 });
    }
    if (!residency_status || !VALID_STATUSES.includes(residency_status)) {
      return NextResponse.json(
        { error: `Invalid residency_status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }

    // Fetch current values first — both for the tenant-ownership check AND
    // to write an accurate before/after audit trail per student.
    const placeholders = student_ids.map(() => '?').join(',');
    const [existingRows]: any = await conn.execute(
      `SELECT id, residency_status FROM students
        WHERE school_id = ? AND deleted_at IS NULL AND id IN (${placeholders})`,
      [schoolId, ...student_ids],
    );
    if (existingRows.length !== student_ids.length) {
      return NextResponse.json({ error: 'Some students do not belong to your school' }, { status: 403 });
    }
    const changed = existingRows.filter((r: any) => r.residency_status !== residency_status);

    await conn.beginTransaction();
    try {
      await conn.execute(
        `UPDATE students
            SET residency_status = ?, residency_status_updated_at = NOW(), residency_status_updated_by = ?
          WHERE school_id = ? AND id IN (${placeholders})`,
        [residency_status, session.userId, schoolId, ...student_ids],
      );
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    }

    if (changed.length > 0) {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null;
      const userAgent = req.headers.get('user-agent');
      // One audit row per changed student — matches the per-record
      // old/new diff style used elsewhere (students/edit), so each
      // reclassification stays individually auditable rather than
      // collapsed into one opaque "bulk" entry.
      void Promise.all(changed.map((r: any) => logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.RESIDENCY_STATUS_CHANGED,
        entityType: 'student',
        entityId: r.id,
        details: { old: r.residency_status, new: residency_status, bulk: true },
        ip, userAgent,
      })));
    }

    return NextResponse.json({
      success: true,
      message: `Reclassified ${changed.length} of ${student_ids.length} student(s) as "${residency_status}"`,
      updated: changed.length,
      unchanged: student_ids.length - changed.length,
      residency_status,
    });
  } catch (error) {
    console.error('Bulk residency change error:', error);
    return NextResponse.json({ error: 'Failed to process bulk residency change' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
