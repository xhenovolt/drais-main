import { NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { validateAllocationInput as validateInput, validateOwnership } from '@/lib/allocation-validation';
import { checkModule } from '@/lib/auth/requireModule';

export async function POST(req: Request) {
  let connection;
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }

    const body = await req.json();
    const allocations = Array.isArray(body) ? body : body.allocations;

    if (!Array.isArray(allocations) || allocations.length === 0) {
      throw new Error('Allocations array is required.');
    }

    if (allocations.length > 100) {
      throw new Error('Maximum 100 allocations per bulk operation.');
    }

    connection = await getConnection();
    await connection.beginTransaction();

    const results: any[] = [];
    const errors: string[] = [];

    for (let i = 0; i < allocations.length; i++) {
      const item = allocations[i];
      try {
        const { class_id, subject_id, teacher_id, custom_initials } = validateInput(item);

        // Validate ownership of class, subject, teacher
        await validateOwnership(connection, session.schoolId, { class_id, subject_id, teacher_id });

        // Check for existing allocation (class, subject) pair
        const [existingRows] = await connection.execute(
          `SELECT id, teacher_id, custom_initials
           FROM class_subjects
           WHERE class_id = ? AND subject_id = ?`,
          [class_id, subject_id]
        );

        if (existingRows.length > 0) {
          // Update existing
          const existing = existingRows[0];
          await connection.execute(
            `UPDATE class_subjects
             SET teacher_id = ?, custom_initials = ?
             WHERE id = ?`,
            [teacher_id, custom_initials, existing.id]
          );
          results.push({ action: 'updated', id: existing.id, class_id, subject_id });
        } else {
          // Insert new (no school_id column — class already belongs to school via validation)
          const [result] = await connection.execute(
            `INSERT INTO class_subjects (class_id, subject_id, teacher_id, custom_initials)
             VALUES (?, ?, ?, ?)`,
            [class_id, subject_id, teacher_id, custom_initials]
          );
          results.push({ action: 'created', id: (result as any).insertId, class_id, subject_id });
        }
      } catch (err: any) {
        errors.push(`Row ${i + 1}: ${err.message}`);
      }
    }

    if (errors.length > 0) {
      await connection.rollback();
      await connection.end();
      return NextResponse.json(
        { success: false, message: 'Bulk operation failed', errors },
        { status: 400 }
      );
    }

    await connection.commit();
    await connection.end();

    return NextResponse.json({
      success: true,
      message: `Bulk operation completed: ${results.filter(r => r.action === 'created').length} created, ${results.filter(r => r.action === 'updated').length} updated`,
      data: results,
    });
  } catch (error) {
    if (connection) {
      try { await connection.rollback(); } catch {}
      await connection.end();
    }
    console.error('Error in bulk allocation:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
