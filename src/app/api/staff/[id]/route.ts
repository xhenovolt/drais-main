import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * Staff member API for individual operations
 * GET - Fetch staff member details
 * PATCH - Update staff member
 * DELETE - Delete staff member (soft delete)
 */

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { id } = await params;
    const staffId = parseInt(id, 10);

    if (isNaN(staffId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid staff ID'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Fetch staff member with department info
    const [staffRows]: any = await connection.execute(
      `SELECT 
        s.id, s.school_id, s.person_id, s.staff_no, s.position, s.hire_date, s.status,
        s.department_id, s.role_id, s.employment_type, s.qualification, s.experience_years,
        s.salary, s.bank_name, s.bank_account_no, s.nssf_no, s.tin_no, s.performance_rating,
        p.first_name, p.last_name, p.other_name, p.gender, p.date_of_birth,
        p.email, p.phone, p.address, p.city,
        d.name as department_name
       FROM staff s
       LEFT JOIN people p ON s.person_id = p.id
       LEFT JOIN departments d ON s.department_id = d.id
       WHERE s.id = ? AND s.school_id = ? AND s.deleted_at IS NULL
       LIMIT 1`,
      [staffId, schoolId]
    );

    if (!staffRows || staffRows.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Staff member not found'
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: staffRows[0]
    });

  } catch (error: any) {
    console.error('Staff fetch error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch staff member',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { id } = await params;
    const staffId = parseInt(id, 10);
    const body = await req.json();

    if (isNaN(staffId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid staff ID'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Check if staff exists AND belongs to this school
      const [existingStaff]: any = await connection.execute(
        'SELECT id, person_id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
        [staffId, schoolId]
      );

      if (existingStaff.length === 0) {
        await connection.rollback();
        return NextResponse.json({
          success: false,
          error: 'Staff member not found'
        }, { status: 404 });
      }

      const personId = existingStaff[0].person_id;
      const updatedFields: string[] = [];
      const updateValues: any[] = [];

      // Update people table fields
      if (body.first_name !== undefined) {
        updatedFields.push('first_name = ?');
        updateValues.push(body.first_name);
      }
      if (body.last_name !== undefined) {
        updatedFields.push('last_name = ?');
        updateValues.push(body.last_name);
      }
      if (body.other_name !== undefined) {
        updatedFields.push('other_name = ?');
        updateValues.push(body.other_name);
      }
      if (body.gender !== undefined) {
        updatedFields.push('gender = ?');
        updateValues.push(body.gender);
      }
      if (body.phone !== undefined) {
        updatedFields.push('phone = ?');
        updateValues.push(body.phone);
      }
      if (body.email !== undefined) {
        updatedFields.push('email = ?');
        updateValues.push(body.email);
      }
      if (body.address !== undefined) {
        updatedFields.push('address = ?');
        updateValues.push(body.address);
      }
      if (body.date_of_birth !== undefined) {
        updatedFields.push('date_of_birth = ?');
        updateValues.push(body.date_of_birth);
      }

      // Update person table if there are updates
      if (updatedFields.length > 0) {
        updateValues.push(personId);
        updateValues.push(schoolId);
        await connection.execute(
          `UPDATE people SET ${updatedFields.join(', ')} WHERE id = ? AND school_id = ?`,
          updateValues
        );
      }

      // Update staff table fields
      const staffUpdatedFields: string[] = [];
      const staffUpdateValues: any[] = [];

      if (body.staff_no !== undefined) {
        staffUpdatedFields.push('staff_no = ?');
        staffUpdateValues.push(body.staff_no);
      }
      if (body.position !== undefined) {
        staffUpdatedFields.push('position = ?');
        staffUpdateValues.push(body.position);
      }
      if (body.hire_date !== undefined) {
        staffUpdatedFields.push('hire_date = ?');
        staffUpdateValues.push(body.hire_date);
      }
      if (body.status !== undefined) {
        staffUpdatedFields.push('status = ?');
        staffUpdateValues.push(body.status);
      }
      if (body.department_id !== undefined) {
        staffUpdatedFields.push('department_id = ?');
        staffUpdateValues.push(body.department_id);
      }
      if (body.role_id !== undefined) {
        staffUpdatedFields.push('role_id = ?');
        staffUpdateValues.push(body.role_id);
      }
      if (body.employment_type !== undefined) {
        staffUpdatedFields.push('employment_type = ?');
        staffUpdateValues.push(body.employment_type);
      }
      if (body.qualification !== undefined) {
        staffUpdatedFields.push('qualification = ?');
        staffUpdateValues.push(body.qualification);
      }
      if (body.experience_years !== undefined) {
        staffUpdatedFields.push('experience_years = ?');
        staffUpdateValues.push(body.experience_years);
      }
      if (body.salary !== undefined) {
        staffUpdatedFields.push('salary = ?');
        staffUpdateValues.push(body.salary);
      }
      if (body.bank_name !== undefined) {
        staffUpdatedFields.push('bank_name = ?');
        staffUpdateValues.push(body.bank_name);
      }
      if (body.bank_account_no !== undefined) {
        staffUpdatedFields.push('bank_account_no = ?');
        staffUpdateValues.push(body.bank_account_no);
      }
      if (body.nssf_no !== undefined) {
        staffUpdatedFields.push('nssf_no = ?');
        staffUpdateValues.push(body.nssf_no);
      }
      if (body.tin_no !== undefined) {
        staffUpdatedFields.push('tin_no = ?');
        staffUpdateValues.push(body.tin_no);
      }

      // Update staff table if there are updates
      if (staffUpdatedFields.length > 0) {
        staffUpdatedFields.push('updated_at = CURRENT_TIMESTAMP');
        staffUpdateValues.push(staffId);
        staffUpdateValues.push(schoolId);
        await connection.execute(
          `UPDATE staff SET ${staffUpdatedFields.join(', ')} WHERE id = ? AND school_id = ?`,
          staffUpdateValues
        );
      }

      // Handle device_user_id mapping update
      if (body.device_user_id !== undefined) {
        // Get the first device mapping for this staff member
        // Note: Staff typically don't have device mappings like students do
        // This is for future use if staff enrollment is needed
        const [deviceMapping]: any = await connection.execute(
          `SELECT id FROM device_user_mappings WHERE staff_id = ? AND school_id = ? LIMIT 1`,
          [staffId, schoolId]
        );

        if (deviceMapping.length > 0) {
          await connection.execute(
            `UPDATE device_user_mappings SET device_user_id = ? WHERE id = ?`,
            [body.device_user_id, deviceMapping[0].id]
          );
        }
      }

      await connection.commit();

      // Audit log (non-blocking)
      logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.UPDATED_STAFF,
        entityType: 'staff',
        entityId: staffId,
        details: { updatedFields: [...updatedFields, ...staffUpdatedFields] },
      }).catch(() => {});

      return NextResponse.json({
        success: true,
        message: 'Staff member updated successfully',
        data: {
          id: staffId
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Staff update error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to update staff member',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  let connection;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { id } = await params;
    const staffId = parseInt(id, 10);

    if (isNaN(staffId)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid staff ID'
      }, { status: 400 });
    }

    connection = await getConnection();

    // Check if staff exists AND belongs to this school
    const [existingStaff]: any = await connection.execute(
      'SELECT id FROM staff WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [staffId, schoolId]
    );

    if (existingStaff.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Staff member not found'
      }, { status: 404 });
    }

    // Soft delete by setting deleted_at — scoped by school_id
    await connection.execute(
      'UPDATE staff SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND school_id = ?',
      [staffId, schoolId]
    );

    // Audit log (non-blocking)
    logAudit({
      schoolId,
      userId: session.userId,
      action: AuditAction.DELETED_STAFF,
      entityType: 'staff',
      entityId: staffId,
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      message: 'Staff member deleted successfully'
    });

  } catch (error: any) {
    console.error('Staff delete error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete staff member',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
