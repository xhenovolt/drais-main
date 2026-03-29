import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSubscriptionInfo } from '@/lib/subscription';
import { randomBytes } from 'crypto';

// Session configuration
const SESSION_CONFIG = {
  TOKEN_LENGTH: 32, // 32 bytes = 256 bits
  EXPIRY_DAYS: 7,
  EXPIRY_MS: 7 * 24 * 60 * 60 * 1000,
  COOKIE_NAME: 'drais_session',
  COOKIE_OPTIONS: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days in seconds
  },
};

/**
 * Generate a cryptographically secure session token
 */
function generateSessionToken(): string {
  return randomBytes(SESSION_CONFIG.TOKEN_LENGTH).toString('hex');
}

/**
 * Get client IP address (supports proxies)
 */
function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0] ||
    request.headers.get('x-real-ip') ||
    '127.0.0.1'
  );
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Email and password are required',
            code: 'MISSING_CREDENTIALS'
          }
        },
        { status: 400 }
      );
    }

    // Query user from users table (not staff)
    // Try users table first, then fall back to staff for backward compatibility
    let users = await query(
      `SELECT 
        u.id,
        u.school_id AS schoolId,
        u.email,
        u.password_hash,
        CASE WHEN u.is_active = 0 THEN 'pending' WHEN u.is_active = 1 THEN 'active' ELSE 'inactive' END as status,
        COALESCE(u.first_name, '') as first_name,
        COALESCE(u.last_name, '') as last_name,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as display_name,
        COALESCE(u.must_change_password, FALSE) as must_change_password
      FROM users u
      WHERE u.email = ? 
        AND u.deleted_at IS NULL
      LIMIT 1`,
      [email]
    );

    if (!users || users.length === 0) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Invalid email or password',
            code: 'INVALID_CREDENTIALS'
          }
        },
        { status: 401 }
      );
    }

    const user = users[0];

    // Check account status
    if (user.status === 'pending') {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Your account is pending approval. Please contact your administrator.',
            code: 'ACCOUNT_PENDING'
          }
        },
        { status: 403 }
      );
    }

    if (user.status === 'inactive' || user.status === 'suspended' || user.status === 'locked') {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Your account has been deactivated. Please contact your administrator.',
            code: 'ACCOUNT_INACTIVE'
          }
        },
        { status: 403 }
      );
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      // Log failed attempt (optional: implement rate limiting)
      await query(
        `UPDATE users SET failed_login_attempts = COALESCE(failed_login_attempts, 0) + 1 WHERE id = ?`,
        [user.id]
      ).catch(() => {}); // Don't fail if this fails

      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Invalid email or password',
            code: 'INVALID_CREDENTIALS'
          }
        },
        { status: 401 }
      );
    }

    // Get school information if school_id exists
    let school = null;
    let setupComplete = true;
    
    if (user.schoolId) {
      const schools = await query(
        `SELECT id, name, status
         FROM schools
         WHERE id = ? AND deleted_at IS NULL`,
        [user.schoolId]
      );

      if (schools && schools.length > 0) {
        school = schools[0];

        // Block suspended schools at login — return 403 with clear message
        if (school.status === 'suspended') {
          console.warn(`[Auth/Login] Blocked login for suspended school #${school.id} — user ${user.email}`);
          return NextResponse.json(
            {
              success: false,
              error: {
                message: 'Your school account is suspended. Contact administrator.',
                code: 'SCHOOL_SUSPENDED',
              },
            },
            { status: 403 }
          );
        }

        setupComplete = true;
      }
    }

    // Generate session token
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_CONFIG.EXPIRY_MS);
    const ipAddress = getClientIp(request);
    const userAgent = request.headers.get('user-agent') || null;

    // Parse device info from UA (mirrors heartbeat route logic)
    const deviceInfo = userAgent ? parseDeviceInfo(userAgent) : null;

    // Create session in database — also set device_info and last_activity_at
    await query(
      `INSERT INTO sessions (user_id, school_id, session_token, expires_at, ip_address, user_agent, device_info, last_activity_at, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), TRUE)`,
      [user.id, user.schoolId, sessionToken, expiresAt, ipAddress, userAgent, deviceInfo]
    );

    // Update last login
    await query(
      `UPDATE users SET last_login_at = NOW(), failed_login_attempts = 0 WHERE id = ?`,
      [user.id]
    ).catch(() => {}); // Don't fail if this fails

    // Get user roles and permissions
    const roles = await query(
      `SELECT r.id, r.name
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?
         AND r.school_id = ?
         AND ur.is_active = TRUE`,
      [user.id, user.schoolId]
    ).catch(() => []);

    // Determine if super admin based on role name
    const isSuperAdmin = Array.isArray(roles) && roles.some((r: any) => 
      r.name?.toLowerCase().includes('admin') || r.name?.toLowerCase().includes('super')
    );
    
    let permissions: string[] = [];
    if (isSuperAdmin) {
      permissions = ['*']; // Wildcard for super admin
    } else if (Array.isArray(roles) && roles.length > 0) {
      const perms = await query(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE ur.user_id = ?
           AND r.school_id = ?
           AND ur.is_active = TRUE`,
        [user.id, user.schoolId]
      ).catch(() => []);
      
      permissions = Array.isArray(perms) ? perms.map((p: any) => p.code) : [];
    }

    const mustChangePassword = !!user.must_change_password;

    // Prepare user data for response
    const userData = {
      id: Number(user.id),
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      displayName: user.display_name?.trim() || user.email,
      schoolId: user.schoolId ? Number(user.schoolId) : null,
      schoolName: school?.name || null,
      setupComplete,
      roles: Array.isArray(roles) ? roles.map((r: any) => r.name) : [],
      permissions,
      isSuperAdmin,
      mustChangePassword,
    };

    // Create response with session cookie
    const response = NextResponse.json({
      success: true,
      user: userData,
      setupComplete,
      mustChangePassword,
    });

    // Set HTTP-only secure session cookie
    response.cookies.set(SESSION_CONFIG.COOKIE_NAME, sessionToken, SESSION_CONFIG.COOKIE_OPTIONS);

    // Also set school_id cookie for middleware (non-httpOnly so it can be read by middleware)
    if (user.schoolId) {
      response.cookies.set('drais_school_id', String(user.schoolId), {
        ...SESSION_CONFIG.COOKIE_OPTIONS,
        httpOnly: false, // Allow middleware to read
      });
    }

    // Set primary role cookie for Edge-compatible RBAC in middleware
    const primaryRole = Array.isArray(userData.roles) && userData.roles.length
      ? userData.roles[0]
      : (userData.isSuperAdmin ? 'Admin' : 'Staff');
    response.cookies.set('drais_role', primaryRole, {
      ...SESSION_CONFIG.COOKIE_OPTIONS,
      httpOnly: false, // Middleware needs to read this
    });

    // If user must change password, set a readable cookie for middleware redirect
    if (mustChangePassword) {
      response.cookies.set('drais_force_reset', '1', {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: SESSION_CONFIG.EXPIRY_MS / 1000,
      });
    }

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'An error occurred during login. Please try again.',
          code: 'SERVER_ERROR'
        }
      },
      { status: 500 }
    );
  }
}

/** Lightweight UA parser — mirrors /api/heartbeat/route.ts */
function parseDeviceInfo(ua: string): string {
  let browser = 'Unknown';
  let os      = 'Unknown';
  let device  = 'Desktop';

  if (/Edg\//.test(ua))            browser = 'Edge';
  else if (/Chrome\//.test(ua))    browser = 'Chrome';
  else if (/Firefox\//.test(ua))   browser = 'Firefox';
  else if (/Safari\//.test(ua))    browser = 'Safari';
  else if (/OPR\//.test(ua))       browser = 'Opera';

  if (/Android/.test(ua))          { os = 'Android'; device = 'Mobile'; }
  else if (/iPhone|iPad/.test(ua)) { os = 'iOS'; device = /iPad/.test(ua) ? 'Tablet' : 'Mobile'; }
  else if (/Windows/.test(ua))     os = 'Windows';
  else if (/Mac OS/.test(ua))      os = 'macOS';
  else if (/Linux/.test(ua))       os = 'Linux';

  return `${browser} / ${os} / ${device}`.slice(0, 500);
}
