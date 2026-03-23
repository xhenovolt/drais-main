import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getConnection } from '@/lib/db';
import { randomBytes } from 'crypto';

/**
 * Return the set of column names that actually exist in the schools table.
 * Used to build schema-safe INSERTs even if a migration has not yet run.
 */
async function getSchoolsColumns(connection: any): Promise<Set<string>> {
  const [cols] = await connection.execute<any[]>(
    `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'schools'`
  );
  return new Set<string>(cols.map((c: any) => c.COLUMN_NAME));
}

// Session configuration (same as login)
const SESSION_CONFIG = {
  TOKEN_LENGTH: 32,
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  COOKIE_NAME: 'drais_session',
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60,
  },
};

function generateSessionToken(): string {
  return randomBytes(SESSION_CONFIG.TOKEN_LENGTH).toString('hex');
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

interface SignupRequest {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  schoolName?: string; // For creating new school (first user)
  schoolId?: number; // For joining existing school
  phone?: string;
}

export async function POST(request: NextRequest) {
  let connection: Awaited<ReturnType<typeof getConnection>> | undefined;

  try {
    connection = await getConnection();
    const body: SignupRequest = await request.json();
    const { 
      firstName, 
      lastName, 
      email, 
      password, 
      confirmPassword, 
      schoolName,
      schoolId,
      phone 
    } = body;

    // ========================================
    // VALIDATION
    // ========================================

    // Required fields
    if (!firstName || !email || !password || !confirmPassword) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'First name, email, and password are required',
            code: 'MISSING_FIELDS'
          }
        },
        { status: 400 }
      );
    }

    // Password confirmation
    if (password !== confirmPassword) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Passwords do not match',
            code: 'PASSWORD_MISMATCH'
          }
        },
        { status: 400 }
      );
    }

    // Password strength
    if (password.length < 8) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Password must be at least 8 characters',
            code: 'WEAK_PASSWORD'
          }
        },
        { status: 400 }
      );
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Please enter a valid email address',
            code: 'INVALID_EMAIL'
          }
        },
        { status: 400 }
      );
    }

    // Must provide either schoolName (create new) or schoolId (join existing)
    if (!schoolName && !schoolId) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Please provide a school name to create a new school, or select an existing school to join',
            code: 'NO_SCHOOL_SPECIFIED'
          }
        },
        { status: 400 }
      );
    }

    // ========================================
    // CHECK FOR EXISTING USER
    // ========================================
    
    const [existingUsers] = await connection.execute<any[]>(
      `SELECT id FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1`,
      [email]
    );

    if (existingUsers.length > 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'An account with this email already exists',
            code: 'EMAIL_EXISTS'
          }
        },
        { status: 409 }
      );
    }

    // ========================================
    // START TRANSACTION
    // ========================================
    
    await connection.beginTransaction();

    try {
      const hashedPassword = await bcrypt.hash(password, 12);
      const displayName = `${firstName} ${lastName || ''}`.trim();
      let finalSchoolId: number;
      let isFirstUser = false;
      let setupComplete = false;

      // ========================================
      // SCENARIO 1: Create New School (First User)
      // ========================================
      
      if (schoolName) {
        // Get next school ID (TiDB doesn't auto-increment schools table)
        const [maxIdResult] = await connection.execute<any[]>(
          `SELECT COALESCE(MAX(id), 0) + 1 as next_id FROM schools`
        );
        const nextSchoolId = maxIdResult[0].next_id;

        // Compute trial dates in JS so they're explicit and testable
        const trialStartDate = new Date();
        const trialEndDate = new Date(trialStartDate.getTime() + 30 * 24 * 60 * 60 * 1000);

        // Defensive: only INSERT columns that actually exist in the schema.
        // Every optional column is checked before being added to the list.
        const availableCols = await getSchoolsColumns(connection);
        const hasSubStatus   = availableCols.has('subscription_status');
        const hasSubType     = availableCols.has('subscription_type');
        const hasTrialStart  = availableCols.has('trial_start_date');
        const hasTrialEnd    = availableCols.has('trial_end_date');
        const hasSetup       = availableCols.has('setup_complete');

        // Build column list and value list in tandem
        const colList: string[]  = ['id', 'name', 'status', 'created_at'];
        const values: any[]      = [nextSchoolId, schoolName, 'active', trialStartDate];

        if (hasSetup)      { colList.push('setup_complete');      values.push(false); }
        if (hasSubStatus)  { colList.push('subscription_status'); values.push('trial'); }
        if (hasSubType)    { colList.push('subscription_type');   values.push('trial'); }
        if (hasTrialStart) { colList.push('trial_start_date');    values.push(trialStartDate); }
        if (hasTrialEnd)   { colList.push('trial_end_date');      values.push(trialEndDate); }

        const placeholders = colList.map(() => '?').join(', ');

        // Create the school
        await connection.execute<any>(
          `INSERT INTO schools (${colList.join(', ')}) VALUES (${placeholders})`,
          values
        );

        finalSchoolId = nextSchoolId;
        isFirstUser = true;
        setupComplete = false;

        // Create Super Admin role for this school
        const [roleResult] = await connection.execute<any>(
          `INSERT INTO roles (school_id, name, slug, description, is_super_admin, is_active)
           VALUES (?, 'SuperAdmin', 'superadmin', 'Full system access for school owners', TRUE, TRUE)`,
          [finalSchoolId]
        );
        const superAdminRoleId = roleResult.insertId;

        // Create the user as active (first user is auto-activated)
        const [userResult] = await connection.execute<any>(
          `INSERT INTO users (school_id, first_name, last_name, email, phone, password_hash, is_active, is_verified, created_at)
           VALUES (?, ?, ?, ?, ?, ?, TRUE, TRUE, NOW())`,
          [finalSchoolId, firstName, lastName || '', email, phone || null, hashedPassword]
        );

        const userId = userResult.insertId;

        // Assign Super Admin role to user
        await connection.execute(
          `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_at)
           VALUES (?, ?, ?, TRUE, NOW())`,
          [userId, superAdminRoleId, finalSchoolId]
        );

      // ========================================
      // SCENARIO 2: Join Existing School
      // ========================================
      
      } else if (schoolId) {
        // Verify school exists and is active
        const [schools] = await connection.execute<any[]>(
          `SELECT id, name, status, setup_complete 
           FROM schools 
           WHERE id = ? AND deleted_at IS NULL`,
          [schoolId]
        );

        if (schools.length === 0) {
          await connection.rollback();
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                message: 'School not found',
                code: 'SCHOOL_NOT_FOUND'
              }
            },
            { status: 404 }
          );
        }

        const school = schools[0];
        
        if (school.status !== 'active') {
          await connection.rollback();
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                message: 'This school is not accepting new registrations',
                code: 'SCHOOL_INACTIVE'
              }
            },
            { status: 403 }
          );
        }

        finalSchoolId = school.id;
        setupComplete = Boolean(school.setup_complete);

        // Create user with PENDING status (requires admin activation)
        const [userResult] = await connection.execute<any>(
          `INSERT INTO users (school_id, first_name, last_name, email, phone, password_hash, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', NOW())`,
          [finalSchoolId, firstName, lastName || '', email, phone || null, hashedPassword]
        );

        const userId = userResult.insertId;

        // Get default Staff role for this school
        const [staffRoles] = await connection.execute<any[]>(
          `SELECT id FROM roles 
           WHERE school_id = ? AND slug = 'staff' AND is_active = TRUE
           LIMIT 1`,
          [finalSchoolId]
        );

        if (staffRoles.length > 0) {
          // Assign Staff role (will be inactive until user is activated)
          await connection.execute(
            `INSERT INTO user_roles (user_id, role_id, school_id, is_active, assigned_at)
             VALUES (?, ?, ?, FALSE, NOW())`,
            [userId, staffRoles[0].id, finalSchoolId]
          );
        }

        // Return success but indicate pending status
        await connection.commit();
        
        return NextResponse.json({
          success: true,
          message: 'Account created successfully. Please wait for administrator approval before you can log in.',
          pendingApproval: true,
          schoolName: school.name,
        });
      }

      // ========================================
      // CREATE SESSION (Only for first user / school creator)
      // ========================================
      
      if (isFirstUser) {
        // Get the created user ID
        const [users] = await connection.execute<any[]>(
          `SELECT id FROM users WHERE email = ? AND school_id = ? LIMIT 1`,
          [email, finalSchoolId]
        );

        if (users.length > 0) {
          const userId = users[0].id;
          const sessionToken = generateSessionToken();
          const expiresAt = new Date(Date.now() + SESSION_CONFIG.EXPIRY_MS);
          const ipAddress = getClientIp(request);
          const userAgent = request.headers.get('user-agent') || null;

          // Create session
          await connection.execute(
            `INSERT INTO sessions (user_id, school_id, session_token, expires_at, ip_address, user_agent, is_active)
             VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
            [userId, finalSchoolId, sessionToken, expiresAt, ipAddress, userAgent]
          );

          await connection.commit();

          // Create response with session cookie
          const response = NextResponse.json({
            success: true,
            message: 'Account and school created successfully',
            user: {
              id: userId,
              email,
              firstName,
              lastName: lastName || '',
              displayName,
              schoolId: finalSchoolId,
              schoolName,
              setupComplete: false,
              roles: ['super_admin'],
              permissions: ['*'],
              isSuperAdmin: true,
            },
            setupComplete: false,
            redirectTo: '/settings/school-setup',
          });

          // Set session cookie
          response.cookies.set(SESSION_CONFIG.COOKIE_NAME, sessionToken, SESSION_CONFIG.COOKIE_OPTIONS);
          response.cookies.set('drais_school_id', String(finalSchoolId), {
            ...SESSION_CONFIG.COOKIE_OPTIONS,
            httpOnly: false,
          });

          return response;
        }
      }

      await connection.commit();
      
      return NextResponse.json({
        success: true,
        message: 'Account created successfully',
      });

    } catch (error) {
      if (connection) await connection.rollback().catch(() => {});
      throw error;
    }

  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'An error occurred during signup. Please try again.',
          code: 'SERVER_ERROR'
        }
      },
      { status: 500 }
    );
  } finally {
    if (connection) {
      try { await connection.end(); } catch (err) {
        console.error('[Signup] Connection release failed:', err);
      }
    }
  }
}
