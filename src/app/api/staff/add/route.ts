import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { createSuccessResponse, createErrorResponse, ApiErrorCode } from '@/lib/apiResponse';
import { logAudit, AuditAction } from '@/lib/audit';
import { logSystemError, logSystemEvent, LogLevel } from '@/lib/systemLogger';
import { notifyStaffCreated, notifyErrorOccurred } from '@/lib/notificationTrigger';

export async function POST(req: NextRequest) {
  let connection;
  const requestId = crypto.getRandomValues(new Uint8Array(16))
    .reduce((str, num) => str + num.toString(16).padStart(2, '0'), '');
  
  try {
    const session = await getSessionSchoolId(req);
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
      experience_years: parseInt(formData.get('experience_years') as string) || 0,
      hire_date: formData.get('hire_date') as string || null,
      salary: parseFloat(formData.get('salary') as string) || null,
      
      // Organizational Info
      department_id: formData.get('department_id') ? parseInt(formData.get('department_id') as string) : null,
      branch_id: formData.get('branch_id') ? parseInt(formData.get('branch_id') as string) : 1,
      role_id: formData.get('role_id') ? parseInt(formData.get('role_id') as string) : null,
      
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


    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Check which columns exist in the staff table
      const [columnsResult] = await connection.execute(`
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() 
        AND TABLE_NAME = 'staff'
      `);
      const existingColumns = (columnsResult as any[]).map(col => col.COLUMN_NAME);

      // Fix: Ensure staff table has AUTO_INCREMENT on id and PRIMARY KEY
      try {
        const [autoIncResult] = await connection.execute(`
          SELECT AUTO_INCREMENT 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'staff'
        `);
        const autoIncrement = (autoIncResult as any[])[0]?.AUTO_INCREMENT;
        
        if (!autoIncrement) {
          const [maxIdResult] = await connection.execute(`SELECT COALESCE(MAX(id), 0) as maxId FROM staff`);
          const maxId = ((maxIdResult as any[])[0]?.maxId || 0) + 1;
          
          try {
            await connection.execute(`ALTER TABLE staff ADD PRIMARY KEY (id)`);
          } catch (e) {
            // Primary key might already exist
          }
          
          await connection.execute(`ALTER TABLE staff MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT`);
          await connection.execute(`ALTER TABLE staff AUTO_INCREMENT = ?`, [maxId]);
        }
      } catch (autoIncError) {
        // Ignore - table may already be fixed
        console.warn('Auto increment check/fix skipped:', autoIncError);
      }

      // Add columns one by one if they don't exist
      const columnsToAdd = [
        { name: 'branch_id', def: 'BIGINT DEFAULT 1 AFTER school_id' },
        { name: 'department_id', def: 'BIGINT DEFAULT NULL AFTER staff_no' },
        { name: 'role_id', def: 'BIGINT DEFAULT NULL AFTER department_id' },
        { name: 'employment_type', def: "ENUM('permanent','contract','volunteer','part-time') DEFAULT 'permanent' AFTER position" },
        { name: 'qualification', def: 'VARCHAR(255) DEFAULT NULL AFTER employment_type' },
        { name: 'experience_years', def: 'INT DEFAULT 0 AFTER qualification' },
        { name: 'salary', def: 'DECIMAL(14,2) DEFAULT NULL AFTER hire_date' },
        { name: 'bank_name', def: 'VARCHAR(150) DEFAULT NULL AFTER salary' },
        { name: 'bank_account_no', def: 'VARCHAR(100) DEFAULT NULL AFTER bank_name' },
        { name: 'nssf_no', def: 'VARCHAR(100) DEFAULT NULL AFTER bank_account_no' },
        { name: 'tin_no', def: 'VARCHAR(100) DEFAULT NULL AFTER nssf_no' }
      ];

      for (const col of columnsToAdd) {
        if (!existingColumns.includes(col.name)) {
          try {
            await connection.execute(`ALTER TABLE staff ADD COLUMN ${col.name} ${col.def}`);
          } catch (e) {
            // Column might have been added by concurrent request
            console.warn(`Column ${col.name} add failed, probably already exists:`, e);
          }
        }
      }

      // Handle photo upload if provided
      let photoUrl = null;
      const photoFile = formData.get('photo') as File;
      if (photoFile && photoFile.size > 0) {
        // TODO: Implement proper photo upload logic to cloud storage
        photoUrl = `/uploads/staff/photo_${Date.now()}.jpg`;
      }

      // 1. Insert into people table
      const [personResult] = await connection.execute(`
        INSERT INTO people (
          school_id, first_name, last_name, other_name, gender, 
          date_of_birth, phone, email, address, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        staffData.schoolId, staffData.first_name, staffData.last_name, 
        staffData.other_name, staffData.gender, staffData.date_of_birth,
        staffData.phone, staffData.email, staffData.address, photoUrl
      ]);

      const personId = (personResult as any).insertId;

      // Generate staff number if not provided
      const finalStaffNo = staffData.staff_no || `STAFF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Build dynamic insert query based on existing columns
      const baseColumns = ['school_id', 'person_id', 'staff_no', 'position', 'status'];
      const baseValues = [staffData.schoolId, personId, finalStaffNo, staffData.position, 'active'];
      
      const optionalColumns: { [key: string]: any } = {
        branch_id: staffData.branch_id,
        department_id: staffData.department_id,
        role_id: staffData.role_id,
        employment_type: staffData.employment_type,
        qualification: staffData.qualification,
        experience_years: staffData.experience_years,
        hire_date: staffData.hire_date,
        salary: staffData.salary,
        bank_name: staffData.bank_name,
        bank_account_no: staffData.bank_account_no,
        nssf_no: staffData.nssf_no,
        tin_no: staffData.tin_no
      };

      // Add columns that exist in the table
      Object.entries(optionalColumns).forEach(([column, value]) => {
        if (existingColumns.includes(column)) {
          baseColumns.push(column);
          baseValues.push(value);
        }
      });

      const placeholders = baseColumns.map(() => '?').join(', ');
      const insertQuery = `
        INSERT INTO staff (${baseColumns.join(', ')})
        VALUES (${placeholders})
      `;

      // 2. Insert into staff table
      const [staffResult] = await connection.execute(insertQuery, baseValues);
      const staffId = (staffResult as any).insertId;

      // 3. Create user account if requested
      let userId = null;
      if (staffData.create_account && staffData.username && staffData.password) {
        // Hash password (in production, use bcrypt)
        const hashedPassword = Buffer.from(staffData.password).toString('base64');
        
        const [userResult] = await connection.execute(`
          INSERT INTO users (
            school_id, role_id, username, email, phone, password_hash, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'active')
        `, [
          staffData.schoolId, staffData.role_id,
          staffData.username, staffData.email, staffData.phone, hashedPassword
        ]);

        userId = (userResult as any).insertId;

        // Create staff_user_accounts table if it doesn't exist and link staff to user
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS staff_user_accounts (
            staff_id BIGINT NOT NULL,
            user_id BIGINT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (staff_id, user_id)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        `);

        await connection.execute(`
          INSERT INTO staff_user_accounts (staff_id, user_id) VALUES (?, ?)
        `, [staffId, userId]);
      }

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

      await connection.commit();

      // Log to audit trail
      await logAudit({
        schoolId: sessionSchoolId,
        userId: sessionUserId,
        action: AuditAction.CREATED_STAFF,
        entityType: 'staff',
        entityId: staffId,
        details: {
          staffNo: finalStaffNo,
          firstName: staffData.first_name,
          lastName: staffData.last_name,
          position: staffData.position,
          hasUserAccount: !!userId
        }
      }).catch(err => console.error('Audit log failed:', err));

      // Log success event
      await logSystemEvent({
        schoolId: sessionSchoolId,
        level: LogLevel.INFO,
        source: '/api/staff/add',
        message: `Staff created successfully: ${staffData.first_name} ${staffData.last_name}`,
        userId: sessionUserId,
        requestId,
        context: { staffId, personId, userId }
      }).catch(err => console.error('System log failed:', err));

      // Send notifications to admin users (try to get admin users for school)
      try {
        const [admins] = await connection.execute(`
          SELECT DISTINCT u.id 
          FROM users u
          WHERE u.school_id = ? AND u.status = 'active'
          LIMIT 10
        `, [sessionSchoolId]);

        const adminIds = (admins as any[]).map(admin => admin.id);
        if (adminIds.length > 0) {
          await notifyStaffCreated(
            sessionSchoolId,
            {
              staffId,
              staffName: `${staffData.first_name} ${staffData.last_name}`,
              position: staffData.position,
              userId
            },
            adminIds
          ).catch(err => console.error('Notification failed:', err));
        }
      } catch (notifError) {
        console.error('Failed to send notifications:', notifError);
        // Don't fail the request over notification errors
      }

      return createSuccessResponse({
        staff_id: staffId,
        person_id: personId,
        user_id: userId,
        staff_no: finalStaffNo,
        documents: documents,
        message: 'Staff member added successfully'
      }, 201);

    } catch (dbError: any) {
      await connection.rollback();
      throw dbError;
    }

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
    if (connection) {
      try {
        await connection.end();
      } catch (e) {
        console.error('Connection cleanup error:', e);
      }
    }
  }
}
