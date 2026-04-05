import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { withTenantTransaction } from '@/lib/dbTenant';
import { getSessionSchoolId } from '@/lib/auth';
import { createSuccessResponse, createErrorResponse, ApiErrorCode } from '@/lib/apiResponse';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError, logSystemEvent, LogLevel } from '@/lib/systemLogger';
import { notifyStaffCreated, notifyErrorOccurred } from '@/lib/notificationTrigger';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  let session: Awaited<ReturnType<typeof getSessionSchoolId>> = null;
  const requestId = crypto.getRandomValues(new Uint8Array(16))
    .reduce((str, num) => str + num.toString(16).padStart(2, '0'), '');
  
  try {
    session = await getSessionSchoolId(req);
    if (!session) {
      return createErrorResponse(
        ApiErrorCode.UNAUTHORIZED,
        'Not authenticated',
        401
      );
    }
    const { schoolId: sessionSchoolId, userId: sessionUserId } = session;

    const formData = await req.formData();
    
    // Extract and validate all form data
    const staffData = {
      // Personal Info (people table)
      schoolId: sessionSchoolId,
      first_name: (formData.get('first_name') as string)?.trim() || null,
      last_name: (formData.get('last_name') as string)?.trim() || null,
      other_name: (formData.get('other_name') as string)?.trim() || null,
      gender: (formData.get('gender') as string)?.trim() || null,
      date_of_birth: formData.get('date_of_birth') as string || null,
      phone: (formData.get('phone') as string)?.trim() || null,
      email: (formData.get('email') as string)?.trim() || null,
      address: (formData.get('address') as string)?.trim() || null,
      
      // Professional Info (staff table)
      staff_no: (formData.get('staff_no') as string)?.trim() || null,
      position: (formData.get('position') as string)?.trim() || null,
      employment_type: (formData.get('employment_type') as string)?.trim() || 'permanent',
      qualification: (formData.get('qualification') as string)?.trim() || null,
      experience_years: parseInt(formData.get('experience_years', 10) as string) || 0,
      hire_date: formData.get('hire_date') as string || null,
      salary: parseFloat(formData.get('salary') as string) || null,
      
      // Organizational Info
      department_id: formData.get('department_id') ? parseInt(formData.get('department_id', 10) as string) : null,
      branch_id: formData.get('branch_id') ? parseInt(formData.get('branch_id', 10) as string) : 1,
      role_id: formData.get('role_id') ? parseInt(formData.get('role_id', 10) as string) : null,
      
      // Bank Info
      bank_name: (formData.get('bank_name') as string)?.trim() || null,
      bank_account_no: (formData.get('bank_account_no') as string)?.trim() || null,
      nssf_no: (formData.get('nssf_no') as string)?.trim() || null,
      tin_no: (formData.get('tin_no') as string)?.trim() || null,
      
      // User Account
      create_account: formData.get('create_account') === 'true',
      username: (formData.get('username') as string)?.trim() || null,
      password: formData.get('password') as string || null
    };

    // VALIDATION: Ensure required fields are present
    const validationErrors: string[] = [];
    if (!staffData.first_name) validationErrors.push('First name is required');
    if (!staffData.last_name) validationErrors.push('Last name is required');
    if (!staffData.position) validationErrors.push('Position is required');

    if (validationErrors.length > 0) {
      const errorMsg = validationErrors.join('; ');
      
      await logSystemEvent({
        schoolId: sessionSchoolId,
        level: LogLevel.WARNING,
        source: '/api/staff/add',
        message: `Staff creation validation failed: ${errorMsg}`,
        userId: sessionUserId,
        requestId
      }).catch(console.error);

      return createErrorResponse(
        ApiErrorCode.MISSING_FIELD,
        errorMsg,
        400
      );
    }


    // Pre-hash password outside of transaction (CPU-intensive)
    let hashedPassword: string | null = null;
    if (staffData.create_account && staffData.username && staffData.password) {
      hashedPassword = await bcrypt.hash(staffData.password, 12);
    }

    // Handle photo upload if provided
    let photoUrl = null;
    const photoFile = formData.get('photo') as File;
    if (photoFile && photoFile.size > 0) {
      // TODO: Implement proper photo upload logic to cloud storage
      photoUrl = `/uploads/staff/photo_${Date.now()}.jpg`;
    }

    const result = await withTenantTransaction(sessionSchoolId, async ({ exec }) => {
      // 1. Insert into people table
      const personResult = await exec(
        `INSERT INTO people (
          school_id, first_name, last_name, other_name, gender, 
          date_of_birth, phone, email, address, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          staffData.schoolId, staffData.first_name, staffData.last_name, 
          staffData.other_name, staffData.gender, staffData.date_of_birth,
          staffData.phone, staffData.email, staffData.address, photoUrl
        ]
      );
      const personId = personResult.insertId;

      // Generate staff number if not provided
      const finalStaffNo = staffData.staff_no || `STAFF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // 2. Insert into staff table
      const staffResult = await exec(
        `INSERT INTO staff (
          school_id, person_id, staff_no, position, status,
          department_id, employment_type, qualification, experience_years,
          hire_date, salary, bank_name, bank_account_no, nssf_no, tin_no
        ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          staffData.schoolId, personId, finalStaffNo, staffData.position,
          staffData.department_id, staffData.employment_type, staffData.qualification,
          staffData.experience_years, staffData.hire_date, staffData.salary,
          staffData.bank_name, staffData.bank_account_no, staffData.nssf_no, staffData.tin_no
        ]
      );
      const staffId = staffResult.insertId;

      // 3. Create user account if requested
      let userId = null;
      if (hashedPassword && staffData.email) {
        const userResult = await exec(
          `INSERT INTO users (
            school_id, person_id, first_name, last_name, email, phone,
            password_hash, is_active, is_verified, must_change_password, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, FALSE, TRUE, 'active')`,
          [
            staffData.schoolId, personId, staffData.first_name, staffData.last_name,
            staffData.email, staffData.phone, hashedPassword
          ]
        );
        userId = userResult.insertId;

        // Assign role via user_roles table if role_id is provided
        if (staffData.role_id && userId) {
          await exec(
            `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_by)
             VALUES (?, ?, ?, TRUE, ?)`,
            [userId, staffData.role_id, staffData.schoolId, sessionUserId]
          );
        }
      }

      return { personId, staffId, userId, finalStaffNo };
    });

    // 4. Handle document uploads if any
    const documents = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith('document_') && value instanceof File && value.size > 0) {
        documents.push({
          type: key.replace('document_', ''),
          filename: value.name,
          size: value.size
        });
      }
    }

    // Log to audit trail (non-blocking)
    logAudit({
      schoolId: sessionSchoolId,
      userId: sessionUserId,
      action: AuditAction.CREATED_STAFF,
      entityType: 'staff',
      entityId: result.staffId,
      details: {
        staffNo: result.finalStaffNo,
        firstName: staffData.first_name,
        lastName: staffData.last_name,
        position: staffData.position,
        hasUserAccount: !!result.userId
      }
    }).catch(err => console.error('Audit log failed:', err));

    // Log success event (non-blocking)
    logSystemEvent({
      schoolId: sessionSchoolId,
      level: LogLevel.INFO,
      source: '/api/staff/add',
      message: `Staff created successfully: ${staffData.first_name} ${staffData.last_name}`,
      userId: sessionUserId,
      requestId,
      context: { staffId: result.staffId, personId: result.personId, userId: result.userId }
    }).catch(err => console.error('System log failed:', err));

    // Send notifications to admin users (non-blocking)
    query(
      `SELECT DISTINCT u.id FROM users u WHERE u.school_id = ? AND u.status = 'active' LIMIT 10`,
      [sessionSchoolId]
    ).then(admins => {
      const adminIds = (admins as any[]).map((a: any) => a.id);
      if (adminIds.length > 0) {
        notifyStaffCreated(
          sessionSchoolId,
          {
            staffId: result.staffId,
            staffName: `${staffData.first_name} ${staffData.last_name}`,
            position: staffData.position ?? '',
            userId: result.userId
          },
          adminIds
        ).catch(err => console.error('Notification failed:', err));
      }
    }).catch(err => console.error('Failed to fetch admin recipients:', err));

    return createSuccessResponse({
      staff_id: result.staffId,
      person_id: result.personId,
      user_id: result.userId,
      staff_no: result.finalStaffNo,
      documents: documents,
      message: 'Staff member added successfully'
    }, 201);

  } catch (error: any) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    // Log the error
    await logSystemError({
      schoolId: session?.schoolId,
      source: '/api/staff/add',
      message: error?.message || 'Unknown error during staff creation',
      context: {
        errorCode: error?.code,
        errorErrno: error?.errno,
        errorSqlMessage: error?.sqlMessage
      },
      userId: session?.userId,
      requestId,
      statusCode: 500
    }).catch(err => console.error('Failed to log error:', err));

    console.error('Staff creation error:', error);

    // Handle specific database errors
    if (error?.code === 'ER_NO_REFERENCED_ROW' || error?.errno === 1452) {
      return createErrorResponse(
        ApiErrorCode.DATABASE_ERROR,
        'One or more references are invalid (department, role, or branch)',
        400,
        isDevelopment ? { message: error.message } : undefined
      );
    }

    if (error?.code === 'ER_DUP_ENTRY' || error?.errno === 1062) {
      return createErrorResponse(
        ApiErrorCode.DUPLICATE_ENTRY,
        'This staff member or username already exists',
        409,
        isDevelopment ? { message: error.message } : undefined
      );
    }

    if (error?.code === 'ER_BAD_NULL_ERROR' || error?.errno === 1048) {
      const fieldMatch = error?.message?.match(/Column '([^']+)'/);
      const fieldName = fieldMatch ? fieldMatch[1] : 'required field';
      return createErrorResponse(
        ApiErrorCode.MISSING_FIELD,
        `${fieldName} is required`,
        400,
        isDevelopment ? { message: error.message } : undefined
      );
    }

    // Generic server error
    return createErrorResponse(
      ApiErrorCode.DATABASE_ERROR,
      'Failed to create staff member. Please check the data and try again.',
      500,
      isDevelopment ? { message: error.message } : undefined
    );
  } finally {
    // Connection cleanup handled by withTenantTransaction
  }
}
