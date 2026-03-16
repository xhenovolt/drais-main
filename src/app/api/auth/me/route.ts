import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSubscriptionInfo } from '@/lib/subscription';

const SESSION_COOKIE_NAME = 'drais_session';

/**
 * GET /api/auth/me
 * Returns the current authenticated user's information based on session cookie
 */
export async function GET(request: NextRequest) {
  try {
    // Get session token from cookie
    const sessionToken = request.cookies.get(SESSION_COOKIE_NAME)?.value;

    if (!sessionToken) {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Not authenticated',
            code: 'NOT_AUTHENTICATED'
          }
        },
        { status: 401 }
      );
    }

    // Validate session and get user data
    const sessions = await query(
      `SELECT 
        s.id as session_id,
        s.user_id,
        s.school_id AS schoolId,
        s.expires_at,
        s.is_active,
        u.id,
        u.email,
        u.first_name,
        u.last_name,
        CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, '')) as display_name,
        u.phone,
        CASE WHEN u.is_active = 0 THEN 'pending' WHEN u.is_active = 1 THEN 'active' ELSE 'inactive' END as status,
        u.avatar_url
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.session_token = ?
        AND s.is_active = TRUE
        AND s.expires_at > NOW()
        AND u.deleted_at IS NULL
      LIMIT 1`,
      [sessionToken]
    );

    // Check if session found
    if (!sessions || sessions.length === 0) {
      // Session invalid or expired
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Session expired or invalid',
            code: 'SESSION_EXPIRED'
          }
        },
        { status: 401 }
      );
    }

    const session = sessions[0];

    // Check user status
    if (session.status === 'pending') {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Your account is pending approval',
            code: 'ACCOUNT_PENDING'
          }
        },
        { status: 403 }
      );
    }

    if (session.status === 'inactive' || session.status === 'suspended' || session.status === 'locked') {
      return NextResponse.json(
        { 
          success: false, 
          error: { 
            message: 'Your account has been deactivated',
            code: 'ACCOUNT_INACTIVE'
          }
        },
        { status: 403 }
      );
    }

    // Get school information
    let school = null;
    let setupComplete = true;

    let subscriptionInfo = null;

    if (session.schoolId) {
      const schools = await query(
        `SELECT id, name, status, setup_complete, email, phone, address, school_type, logo_url
         FROM schools 
         WHERE id = ? AND deleted_at IS NULL`,
        [session.schoolId]
      );

      if (schools && schools.length > 0) {
        school = schools[0];
        setupComplete = Boolean(school.setup_complete);

        // Check school status
        if (school.status !== 'active') {
          return NextResponse.json(
            { 
              success: false, 
              error: { 
                message: 'This school account is not active',
                code: 'SCHOOL_INACTIVE'
              }
            },
            { status: 403 }
          );
        }

        // Check subscription access
        subscriptionInfo = await getSubscriptionInfo(Number(session.schoolId));
        if (subscriptionInfo && !subscriptionInfo.hasAccess) {
          return NextResponse.json(
            {
              success: false,
              error: {
                message: 'Your subscription has expired. Please subscribe to continue using DRAIS.',
                code: 'SUBSCRIPTION_EXPIRED',
              },
              subscriptionInfo: {
                status: subscriptionInfo.subscriptionStatus,
                type: subscriptionInfo.subscriptionType,
                trialEndDate: subscriptionInfo.trialEndDate,
                subscriptionEndDate: subscriptionInfo.subscriptionEndDate,
              },
            },
            { status: 402 }
          );
        }
      }
    }

    // Get user roles
    const roles = await query(
      `SELECT r.id, r.name, r.slug, r.is_super_admin
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = ?
         AND r.school_id = ?
         AND ur.is_active = TRUE
         AND r.is_active = TRUE`,
      [session.user_id, session.schoolId]
    ).catch(() => []);

    const isSuperAdmin = roles.some((r: any) => r.is_super_admin);

    // Get permissions
    let permissions: string[] = [];
    if (isSuperAdmin) {
      permissions = ['*'];
    } else {
      const perms = await query(
        `SELECT DISTINCT p.code
         FROM user_roles ur
         JOIN roles r ON ur.role_id = r.id
         JOIN role_permissions rp ON r.id = rp.role_id
         JOIN permissions p ON rp.permission_id = p.id
         WHERE ur.user_id = ?
           AND r.school_id = ?
           AND ur.is_active = TRUE
           AND r.is_active = TRUE
           AND p.is_active = TRUE`,
        [session.user_id, session.schoolId]
      ).catch(() => []);

      permissions = perms.map((p: any) => p.code);
    }

    // Prepare response
    const userData = {
      id: Number(session.user_id),
      email: session.email,
      firstName: session.first_name || '',
      lastName: session.last_name || '',
      displayName: session.display_name?.trim() || session.email,
      phone: session.phone,
      avatarUrl: session.avatar_url,
      schoolId: session.schoolId ? Number(session.schoolId) : null,
      schoolName: school?.name || null,
      school: school ? {
        id: Number(school.id),
        name: school.name,
        email: school.email,
        phone: school.phone,
        address: school.address,
        schoolType: school.school_type,
        logoUrl: school.logo_url,
        setupComplete,
      } : null,
      subscription: subscriptionInfo ? {
        status: subscriptionInfo.subscriptionStatus,
        type: subscriptionInfo.subscriptionType,
        trialEndDate: subscriptionInfo.trialEndDate,
        trialDaysRemaining: subscriptionInfo.trialDaysRemaining,
        subscriptionEndDate: subscriptionInfo.subscriptionEndDate,
        subscriptionDaysRemaining: subscriptionInfo.subscriptionDaysRemaining,
        hasAccess: subscriptionInfo.hasAccess,
      } : null,
      setupComplete,
      roles: roles.map((r: any) => ({
        id: Number(r.id),
        name: r.name,
        slug: r.slug,
        isSuperAdmin: Boolean(r.is_super_admin),
      })),
      permissions,
      isSuperAdmin,
    };

    return NextResponse.json({
      success: true,
      user: userData,
      setupComplete,
    });

  } catch (error) {
    console.error('Auth check error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: { 
          message: 'An error occurred while checking authentication',
          code: 'SERVER_ERROR'
        }
      },
      { status: 500 }
    );
  }
}
