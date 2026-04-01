import { NextRequest, NextResponse } from 'next/server';
import { getConnection, query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError } from '@/lib/errorLogger';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  try {
    const body = await req.json();
    const { learnerIds, classId } = body;

    if (!learnerIds || !Array.isArray(learnerIds) || learnerIds.length === 0) {
      return NextResponse.json({ success: false, message: 'No learners selected' }, { status: 400 });
    }

    if (!classId) {
      return NextResponse.json({ success: false, message: 'Class ID is required' }, { status: 400 });
    }

    const connection = await getConnection();
    const results = { inserted: 0, updated: 0, errors: [] as string[] };

    try {
      await connection.beginTransaction();

      for (const learnerId of learnerIds) {
        // Find the existing active enrollment for this student in this school
        const [existing] = await connection.execute(
          'SELECT id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = "active" LIMIT 1',
          [learnerId, schoolId]
        ) as any[];

        if ((existing as any[]).length > 0) {
          // Update active enrollment to new class
          await connection.execute(
            'UPDATE enrollments SET class_id = ?, updated_at = NOW() WHERE id = ? AND school_id = ?',
            [classId, (existing as any[])[0].id, schoolId]
          );
          results.updated++;
        } else {
          // No active enrollment — create one
          await connection.execute(
            'INSERT INTO enrollments (school_id, student_id, class_id, status, enrollment_date) VALUES (?, ?, ?, "active", CURDATE())',
            [schoolId, learnerId, classId]
          );
          results.inserted++;
        }
      }

      await connection.commit();

      // Audit (non-transactional — after commit)
      logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.REASSIGNED_CLASS,
        entityType: 'enrollment',
        entityId: classId,
        details: { learnerIds, classId, ...results },
        source: 'WEB',
        ip: req.headers.get('x-forwarded-for') || undefined,
      }).catch(() => { /* non-critical */ });

      // Fire-and-forget notification
      query(
        `INSERT INTO notifications (school_id, actor_user_id, action, entity_type, entity_id, title, message, priority, channel, created_at)
         VALUES (?, ?, 'bulk_class_assign', 'enrollment', ?, ?, ?, 'normal', 'system', NOW())`,
        [schoolId, session.userId, classId,
         'Bulk Class Assignment',
         `${results.updated + results.inserted} student(s) assigned to class`]
      ).catch(() => {});

      return NextResponse.json({
        success: true,
        message: `Assigned ${results.updated + results.inserted} student(s) to class`,
        updated: results.updated,
        inserted: results.inserted,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('[bulk-assign] error:', error);
    logSystemError({ endpoint: '/api/students/bulk-assign', method: 'POST', error }).catch(() => {});
    return NextResponse.json({ success: false, message: error.message || 'Failed to assign class', error: { code: 'BULK_ASSIGN_FAILED' } }, { status: 500 });
  }
}