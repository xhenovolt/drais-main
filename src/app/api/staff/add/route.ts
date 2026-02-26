import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    const formData = await req.formData();
    
    // Extract all form data
    const staffData = {
      // Personal Info (people table)
      school_id: parseInt(formData.get('school_id') as string) || 1,
      first_name: formData.get('first_name') as string,
      last_name: formData.get('last_name') as string,
      other_name: formData.get('other_name') as string || null,
      gender: formData.get('gender') as string || null,
      date_of_birth: formData.get('date_of_birth') as string || null,
      phone: formData.get('phone') as string || null,
      email: formData.get('email') as string || null,
      address: formData.get('address') as string || null,
      
      // Professional Info (staff table)
      staff_no: formData.get('staff_no') as string || null,
      position: formData.get('position') as string,
      employment_type: formData.get('employment_type') as string || 'permanent',
      qualification: formData.get('qualification') as string || null,
      experience_years: parseInt(formData.get('experience_years') as string) || 0,
      hire_date: formData.get('hire_date') as string || null,
      salary: parseFloat(formData.get('salary') as string) || null,
      
      // Organizational Info
      department_id: formData.get('department_id') ? parseInt(formData.get('department_id') as string) : null,
      branch_id: formData.get('branch_id') ? parseInt(formData.get('branch_id') as string) : 1, // Default to 1
      role_id: formData.get('role_id') ? parseInt(formData.get('role_id') as string) : null,
      
      // Bank Info
      bank_name: formData.get('bank_name') as string || null,
      bank_account_no: formData.get('bank_account_no') as string || null,
      nssf_no: formData.get('nssf_no') as string || null,
      tin_no: formData.get('tin_no') as string || null,
      
      // User Account
      create_account: formData.get('create_account') === 'true',
      username: formData.get('username') as string || null,
      password: formData.get('password') as string || null
    };

    // Validation
    if (!staffData.first_name || !staffData.last_name || !staffData.position) {
      return NextResponse.json({
        success: false,
        error: 'First name, last name, and position are required'
      }, { status: 400 });
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
      // This handles the case where the database schema was created without AUTO_INCREMENT
      try {
        // Check if id column has AUTO_INCREMENT
        const [autoIncResult] = await connection.execute(`
          SELECT AUTO_INCREMENT 
          FROM INFORMATION_SCHEMA.TABLES 
          WHERE TABLE_SCHEMA = DATABASE() 
          AND TABLE_NAME = 'staff'
        `);
        const autoIncrement = (autoIncResult as any[])[0]?.AUTO_INCREMENT;
        
        if (!autoIncrement) {
          // Get current max id to set next auto increment value
          const [maxIdResult] = await connection.execute(`SELECT COALESCE(MAX(id), 0) as maxId FROM staff`);
          const maxId = ((maxIdResult as any[])[0]?.maxId || 0) + 1;
          
          // Add PRIMARY KEY if not exists
          await connection.execute(`ALTER TABLE staff ADD PRIMARY KEY (id)`);
          
          // Modify column to be AUTO_INCREMENT (MariaDB syntax)
          await connection.execute(`ALTER TABLE staff MODIFY COLUMN id BIGINT NOT NULL AUTO_INCREMENT`);
          
          // Set the auto increment value
          await connection.execute(`ALTER TABLE staff AUTO_INCREMENT = ?`, [maxId]);
        }
      } catch (autoIncError) {
        // Ignore if already exists or other error - table may already be fixed
      }

      // Add columns one by one if they don't exist - MySQL compatible way
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
            // Ignore errors - column might have been added by another request
          }
        }
      }

      // Handle photo upload if provided
      let photoUrl = null;
      const photoFile = formData.get('photo') as File;
      if (photoFile && photoFile.size > 0) {
        // TODO: Implement photo upload logic
        // For now, we'll use a placeholder
        photoUrl = `/uploads/staff/photo_${Date.now()}.jpg`;
      }

      // 1. Insert into people table
      const [personResult] = await connection.execute(`
        INSERT INTO people (
          school_id, first_name, last_name, other_name, gender, 
          date_of_birth, phone, email, address, photo_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        staffData.school_id, staffData.first_name, staffData.last_name, 
        staffData.other_name, staffData.gender, staffData.date_of_birth,
        staffData.phone, staffData.email, staffData.address, photoUrl
      ]);

      const personId = personResult.insertId;

      // Generate staff number if not provided
      const finalStaffNo = staffData.staff_no || `STAFF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Build dynamic insert query based on existing columns (reuse columns check from above)
      const baseColumns = ['school_id', 'person_id', 'staff_no', 'position', 'status'];
      const baseValues = [staffData.school_id, personId, finalStaffNo, staffData.position, 'active'];
      
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
      const staffId = staffResult.insertId;

      // 3. Create user account if requested
      let userId = null;
      if (staffData.create_account && staffData.username && staffData.password) {
        // Hash password (in production, use bcrypt)
        const hashedPassword = Buffer.from(staffData.password).toString('base64'); // Simplified for demo
        
        const [userResult] = await connection.execute(`
          INSERT INTO users (
            school_id, role_id, username, email, phone, password_hash, status
          ) VALUES (?, ?, ?, ?, ?, ?, 'active')
        `, [
          staffData.school_id, staffData.role_id,
          staffData.username, staffData.email, staffData.phone, hashedPassword
        ]);

        userId = userResult.insertId;

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
          // TODO: Implement document upload logic
          documents.push({
            type: key.replace('document_', ''),
            filename: value.name,
            size: value.size
          });
        }
      }

      await connection.commit();

      return NextResponse.json({
        success: true,
        message: 'Staff member added successfully',
        data: {
          staff_id: staffId,
          person_id: personId,
          user_id: userId,
          staff_no: finalStaffNo,
          documents: documents
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error: any) {
    console.error('Staff creation error:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to create staff member',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
