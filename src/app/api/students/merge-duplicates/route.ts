import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
/**
 * Merge two duplicate learner records
 * POST /api/students/merge-duplicates
 * 
 * Merges primary_id (keeper) with secondary_id (to be removed)
 * Preserves admission number and combines non-conflicting data
 */
export async function POST(req: NextRequest) {
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { primary_id, secondary_id, merge_strategy = 'keep_primary' } = body;

    if (!primary_id || !secondary_id || primary_id === secondary_id) {
      return NextResponse.json(
        { success: false, error: 'Invalid student IDs for merge' },
        { status: 400 }
      );
    }

    const connection = await getConnection();
    try {
      await connection.beginTransaction();

      // Get both students
      const [primaryRows]: any = await connection.execute(
        `SELECT s.*, p.* FROM students s 
         JOIN people p ON s.person_id = p.id 
         WHERE s.id = ? AND s.school_id = ?`,
        [primary_id, schoolId]
      );

      const [secondaryRows]: any = await connection.execute(
        `SELECT s.*, p.* FROM students s 
         JOIN people p ON s.person_id = p.id 
         WHERE s.id = ? AND s.school_id = ?`,
        [secondary_id, schoolId]
      );

      if (primaryRows.length === 0 || secondaryRows.length === 0) {
        throw new Error('One or both students not found');
      }

      const primary = primaryRows[0];
      const secondary = secondaryRows[0];

      // Merge enrollments: copy any missing enrollments from secondary
      const [primaryEnrollments]: any = await connection.execute(
        `SELECT class_id, academic_year_id FROM enrollments 
         WHERE student_id = ? AND status = 'active'`,
        [primary_id]
      );

      const [secondaryEnrollments]: any = await connection.execute(
        `SELECT * FROM enrollments 
         WHERE student_id = ? AND status = 'active'`,
        [secondary_id]
      );

      for (const enrollment of secondaryEnrollments || []) {
        const exists = primaryEnrollments?.some(
          (e: any) => e.class_id === enrollment.class_id && 
                     e.academic_year_id === enrollment.academic_year_id
        );
        
        if (!exists) {
          await connection.execute(
            `UPDATE enrollments SET student_id = ? WHERE id = ?`,
            [primary_id, enrollment.id]
          );
        }
      }

      // Merge contacts and support data
      const [secondaryContacts]: any = await connection.execute(
        `SELECT contact_id FROM student_contacts WHERE student_id = ?`,
        [secondary_id]
      );

      for (const contact of secondaryContacts || []) {
        await connection.execute(
          `UPDATE student_contacts SET student_id = ? WHERE student_id = ? AND contact_id = ?`,
          [primary_id, secondary_id, contact.contact_id]
        );
      }

      // Mark secondary as merged (soft delete with reference to primary)
      await connection.execute(
        `UPDATE students SET deleted_at = NOW(), notes = CONCAT(COALESCE(notes, ''), '\n[MERGED INTO #', ?, ']') WHERE id = ?`,
        [primary_id, secondary_id]
      );

      // Create audit log
      await connection.execute(
        `INSERT INTO audit_logs (school_id, entity_type, entity_id, action, changes, created_by) 
         VALUES (?, 'students', ?, 'merge', ?, NULL)`,
        [schoolId, primary_id, JSON.stringify({ merged_with: secondary_id })]
      );

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: `Successfully merged learner #${secondary_id} into #${primary_id}`,
        primary_id,
        secondary_id,
      });
    } catch (error: any) {
      await connection.rollback();
      throw error;
    } finally {
      await connection.end();
    }
  } catch (error: any) {
    console.error('Error merging duplicates:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
