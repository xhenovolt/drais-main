import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit } from '@/lib/audit';
import { logSystemError } from '@/lib/errorLogger';

export async function PUT(req: NextRequest) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated', error: { code: 'AUTH_REQUIRED' } }, { status: 401 });
    }
    const schoolId = session.schoolId;

    let body: any;
    try { body = await req.json(); } catch {
      return NextResponse.json({ success: false, message: 'Invalid JSON body', error: { code: 'INVALID_BODY' } }, { status: 400 });
    }

    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, message: 'Student ID is required', error: { code: 'MISSING_ID' } }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Fetch current student + person data (tenant-isolated)
      const [studentRows] = await connection.execute(
        `SELECT s.id, s.person_id, s.status AS student_status,
                p.first_name, p.last_name, p.other_name, p.gender,
                p.date_of_birth, p.phone, p.email, p.address, p.photo_url
         FROM students s JOIN people p ON s.person_id = p.id
         WHERE s.id = ? AND s.school_id = ?`,
        [id, schoolId]
      ) as any[];

      if (studentRows.length === 0) {
        await connection.rollback();
        return NextResponse.json({ success: false, message: 'Student not found or access restricted', error: { code: 'STUDENT_NOT_FOUND' } }, { status: 404 });
      }

      const current = studentRows[0];
      const personId = current.person_id;

      // --- Dynamic people UPDATE: only fields explicitly sent ---
      const personFields: Record<string, string> = {
        first_name: 'first_name', last_name: 'last_name', other_name: 'other_name',
        gender: 'gender', date_of_birth: 'date_of_birth', phone: 'phone',
        email: 'email', address: 'address', photo_url: 'photo_url',
      };
      const setClauses: string[] = [];
      const setParams: any[] = [];
      const changedFields: Record<string, { old: any; new: any }> = {};

      for (const [bodyKey, col] of Object.entries(personFields)) {
        if (bodyKey in body && body[bodyKey] !== undefined) {
          setClauses.push(`${col} = ?`);
          setParams.push(body[bodyKey]);
          if (body[bodyKey] !== current[col]) {
            changedFields[bodyKey] = { old: current[col], new: body[bodyKey] };
          }
        }
      }

      if (setClauses.length > 0) {
        setClauses.push('updated_at = NOW()');
        setParams.push(personId);
        await connection.execute(
          `UPDATE people SET ${setClauses.join(', ')} WHERE id = ?`,
          setParams
        );
      }

      // --- students.status: only if provided ---
      if ('status' in body && body.status !== undefined) {
        await connection.execute(
          'UPDATE students SET status = ?, updated_at = NOW() WHERE id = ? AND school_id = ?',
          [body.status, id, schoolId]
        );
        if (body.status !== current.student_status) {
          changedFields['status'] = { old: current.student_status, new: body.status };
        }
      }

      // --- enrollment class change if class_id provided ---
      if (body.class_id) {
        const [existingEnrollment] = await connection.execute(
          'SELECT id FROM enrollments WHERE student_id = ? AND school_id = ? AND status = "active" LIMIT 1',
          [id, schoolId]
        ) as any[];

        if (existingEnrollment.length > 0) {
          await connection.execute(
            'UPDATE enrollments SET class_id = ?, updated_at = NOW() WHERE id = ? AND school_id = ?',
            [body.class_id, existingEnrollment[0].id, schoolId]
          );
        } else {
          await connection.execute(
            'INSERT INTO enrollments (school_id, student_id, class_id, status, enrollment_date) VALUES (?, ?, ?, "active", CURDATE())',
            [schoolId, id, body.class_id]
          );
        }
      }

      await connection.commit();

      // Fetch updated row for response
      const [updatedRows] = await connection.execute(
        `SELECT p.first_name, p.last_name, p.other_name, p.gender,
                p.date_of_birth, p.phone, p.email, p.address, p.photo_url,
                s.status
         FROM students s JOIN people p ON s.person_id = p.id
         WHERE s.id = ? AND s.school_id = ?`,
        [id, schoolId]
      ) as any[];
      const updatedStudent = updatedRows[0] ?? null;

      // Post-commit audit (fire-and-forget)
      const changedKeys = Object.keys(changedFields);
      if (changedKeys.length > 0) {
        logAudit({
          schoolId,
          userId: session.userId,
          action: 'STUDENT_UPDATED',
          entityType: 'student',
          entityId: Number(id),
          details: {
            changed_fields: changedKeys,
            old_values: Object.fromEntries(changedKeys.map(k => [k, changedFields[k].old])),
            new_values: Object.fromEntries(changedKeys.map(k => [k, changedFields[k].new])),
          },
          ip: req.headers.get('x-forwarded-for') || null,
          userAgent: req.headers.get('user-agent') || null,
        }).catch(e => console.error('[edit] audit error:', e));
      }

      return NextResponse.json({ success: true, message: 'Student updated successfully', data: updatedStudent });
    } catch (error) {
      await connection.rollback();
      throw error;
    }
  } catch (error: any) {
    console.error('[STUDENT_EDIT ERROR]', error);
    logSystemError({ endpoint: '/api/students/edit', method: 'PUT', error }).catch(() => {});
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to update student',
      error: { code: 'UPDATE_FAILED' },
    }, { status: 500 });
  } finally {
    if (connection) {
      try { await connection.end(); } catch { /* ignore */ }
    }
  }
}