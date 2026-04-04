import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

/**
 * GET /api/admin/users
 * Enterprise user list with: roles, department, manager, session info,
 * online status (last_activity_at within 2 min), device, IP.
 * All data is school-scoped — multi-tenant safe.
 */
export async function GET(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const search     = searchParams.get('search')     ?? '';
  const roleFilter = searchParams.get('role')       ?? '';
  const deptFilter = searchParams.get('department') ?? '';
  const statusFilter = searchParams.get('status')   ?? '';

  const rows = await query(
    `SELECT
        u.id,
        u.school_id,
        COALESCE(u.first_name, '') AS first_name,
        COALESCE(u.last_name, '')  AS last_name,
        u.email,
        u.is_active,
        u.is_verified,
        COALESCE(u.must_change_password, 0) AS must_change_password,
        u.last_login_at,
        u.created_at,
        GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles,
        d.name   AS department_name,
        d.id     AS department_id,
        TRIM(CONCAT(
          COALESCE(mgr_s.first_name, mgr_p.first_name, ''), ' ',
          COALESCE(mgr_s.last_name,  mgr_p.last_name,  '')
        )) AS manager_name,
        sess.ip_address,
        sess.device_info,
        sess.session_started_at,
        sess.last_activity_at,
        CASE
          WHEN sess.last_activity_at IS NOT NULL
            AND sess.last_activity_at > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 1
          ELSE 0
        END AS is_online
      FROM users u
      LEFT JOIN user_roles ur  ON ur.user_id   = u.id AND ur.is_active = TRUE
      LEFT JOIN roles r        ON r.id          = ur.role_id AND r.school_id = u.school_id
      LEFT JOIN staff stf      ON stf.person_id  = u.person_id AND stf.school_id = u.school_id AND stf.deleted_at IS NULL
      LEFT JOIN departments d  ON d.id          = stf.department_id AND d.school_id = u.school_id
      LEFT JOIN staff mgr_s    ON mgr_s.id      = stf.manager_id AND mgr_s.deleted_at IS NULL
      LEFT JOIN people mgr_p   ON mgr_p.id      = mgr_s.person_id
      LEFT JOIN (
        SELECT
          user_id,
          ip_address,
          device_info,
          created_at              AS session_started_at,
          COALESCE(last_activity_at, created_at) AS last_activity_at,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY COALESCE(last_activity_at, created_at) DESC
          ) AS rn
        FROM sessions
        WHERE is_active = TRUE
      ) sess ON sess.user_id = u.id AND sess.rn = 1
      WHERE u.school_id    = ?
        AND u.deleted_at   IS NULL
        AND (? = '' OR LOWER(CONCAT(u.first_name, ' ', u.last_name, ' ', u.email)) LIKE LOWER(?))
      GROUP BY
        u.id, u.school_id, u.first_name, u.last_name, u.email,
        u.is_active, u.is_verified, u.must_change_password,
        u.last_login_at, u.created_at,
        d.name, d.id,
        mgr_s.first_name, mgr_s.last_name, mgr_p.first_name, mgr_p.last_name,
        sess.ip_address, sess.device_info, sess.session_started_at, sess.last_activity_at
      ORDER BY is_online DESC, u.last_login_at DESC, u.created_at DESC`,
    [session.schoolId, search, `%${search}%`]
  ) as any[];

  let users = (rows ?? []).map(u => ({
    ...u,
    roles:       u.roles ? u.roles.split(', ') : [],
    is_active:   !!u.is_active,
    is_verified: !!u.is_verified,
    is_online:   !!u.is_online,
    must_change_password: !!u.must_change_password,
    manager_name: u.manager_name?.trim() || null,
  }));

  // Client-side-style post-filters (role, department, status) applied server-side
  if (roleFilter)   users = users.filter(u => u.roles.some((r: string) => r.toLowerCase() === roleFilter.toLowerCase()));
  if (deptFilter)   users = users.filter(u => String(u.department_id) === deptFilter);
  if (statusFilter === 'active')   users = users.filter(u => u.is_active);
  if (statusFilter === 'inactive') users = users.filter(u => !u.is_active);
  if (statusFilter === 'online')   users = users.filter(u => u.is_online);

  return NextResponse.json({ success: true, message: 'Users loaded', data: users, total: users.length });
}

/**
 * POST /api/admin/users — Create a new user (admin only)
 */
export async function POST(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  const { first_name, last_name, email, password, phone, role_id } = body;
  if (!first_name || !last_name || !email || !password || !role_id) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  // Uniqueness check within school
  const existing = await query(
    'SELECT id FROM users WHERE school_id = ? AND email = ? AND deleted_at IS NULL LIMIT 1',
    [session.schoolId, email]
  ) as any[];
  if (existing?.length) return NextResponse.json({ error: 'Email already exists in this school' }, { status: 409 });

  const password_hash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (school_id, first_name, last_name, email, phone, password_hash, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, FALSE, NOW())`,
    [session.schoolId, first_name, last_name, email, phone ?? null, password_hash]
  ) as any;

  const userId = Number(result.insertId);
  await query(
    'INSERT INTO user_roles (user_id, role_id, school_id, assigned_by, is_active) VALUES (?, ?, ?, ?, TRUE)',
    [userId, role_id, session.schoolId, session.userId]
  );

  await logAudit({ schoolId: session.schoolId, userId: session.userId, action: AuditAction.CREATED_STAFF_ACCOUNT, entityType: 'user', entityId: userId });

  return NextResponse.json({ success: true, userId }, { status: 201 });
}
