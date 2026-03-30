/**
 * GET  /api/admin/staff   — paginated staff list with user-account status
 * POST /api/admin/staff   — create new staff member (with optional user account)
 *
 * Required permission: staff.read (GET) | staff.create (POST)
 */
import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { query, withTransaction } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission, withErrorHandling } from '@/lib/rbac';
import { logAudit, AuditAction } from '@/lib/audit';

function getIp(req: NextRequest) {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? req.headers.get('x-real-ip') ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET  — staff list
// ─────────────────────────────────────────────────────────────────────────────
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await requirePermission(session.userId, session.schoolId, 'staff.read', session.isSuperAdmin);

  const { searchParams } = new URL(req.url);
  const page      = Math.max(1, Number(searchParams.get('page')  ?? 1));
  const limit     = Math.min(200, Math.max(1, Number(searchParams.get('limit') ?? 50)));
  const search    = searchParams.get('search')     ?? '';
  const deptId    = searchParams.get('department') ?? null;
  const status    = searchParams.get('status')     ?? null;
  const offset    = (page - 1) * limit;

  const conditions: string[] = ['s.school_id = ?', 's.deleted_at IS NULL'];
  const values: any[]        = [session.schoolId];

  if (search) {
    conditions.push(`(
      p.first_name LIKE ? OR p.last_name LIKE ? OR p.email LIKE ?
      OR s.staff_no LIKE ? OR s.position LIKE ?
    )`);
    const like = `%${search}%`;
    values.push(like, like, like, like, like);
  }
  if (deptId) { conditions.push('s.department_id = ?'); values.push(Number(deptId)); }
  if (status) { conditions.push('s.status = ?');        values.push(status); }

  const where = conditions.join(' AND ');

  const [countRows, rows] = await Promise.all([
    query(`SELECT COUNT(*) AS total FROM staff s JOIN people p ON s.person_id = p.id WHERE ${where}`, values),
    query(
      `SELECT
         s.id,
         s.school_id,
         s.staff_no,
         s.position,
         s.department_id,
         s.status,
         s.hire_date,
         s.manager_id,
         s.created_at,
         p.first_name,
         p.last_name,
         p.email,
         p.phone,
         p.gender,
         p.photo_url,
         d.name          AS department_name,
         m.first_name    AS manager_first_name,
         m.last_name     AS manager_last_name,
         -- User account status
         u.id            AS user_id,
         (u.status = 'active') AS account_active,
         u.last_login,
         -- Roles (aggregated)
         GROUP_CONCAT(DISTINCT r.name ORDER BY r.name SEPARATOR ', ') AS roles
       FROM staff s
       JOIN people p ON s.person_id = p.id
       LEFT JOIN departments d ON s.department_id = d.id
       LEFT JOIN staff m_s ON s.manager_id = m_s.id
       LEFT JOIN people m ON m_s.person_id = m.id
       LEFT JOIN users u ON u.person_id = s.person_id AND u.school_id = s.school_id AND u.deleted_at IS NULL
       LEFT JOIN user_roles ur ON ur.user_id = u.id AND ur.school_id = s.school_id AND ur.is_active = TRUE
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE ${where}
       GROUP BY s.id, s.school_id, s.staff_no, s.position, s.department_id, s.status,
                s.hire_date, s.manager_id, s.created_at, p.first_name, p.last_name,
                p.email, p.phone, p.gender, p.photo_url, d.name,
                m.first_name, m.last_name, u.id, u.status, u.last_login
       ORDER BY p.first_name, p.last_name
       LIMIT ? OFFSET ?`,
      [...values, limit, offset],
    ),
  ]);

  const total = Number((countRows as any[])[0]?.total ?? 0);

  return NextResponse.json({
    staff: rows,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST  — create staff
// ─────────────────────────────────────────────────────────────────────────────
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  await requirePermission(session.userId, session.schoolId, 'staff.create', session.isSuperAdmin);

  const body = await req.json();
  const {
    first_name,  last_name,  other_name = null,
    gender = 'other', phone = null, email = null,
    position = null, hire_date = null, staff_no = null,
    department_id = null, manager_id = null, status = 'active',
    // Optional: immediately create user account
    create_account = false,
    username = null,
  } = body;

  if (!first_name?.trim() || !last_name?.trim()) {
    return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
  }

  const ip = getIp(req);

  const result = await withTransaction(async (conn) => {
    // 1. Create people record
    const [personRes]: any = await conn.execute(
      `INSERT INTO people (first_name, last_name, middle_name, gender, phone, email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [first_name.trim(), last_name.trim(), other_name, gender, phone, email],
    );
    const personId = personRes.insertId;

    // 2. Generate staff_no if not provided
    const finalStaffNo = staff_no?.trim() ||
      `STF${Date.now()}${Math.floor(Math.random() * 100).toString().padStart(2, '0')}`;

    // 3. Create staff record
    const [staffRes]: any = await conn.execute(
      `INSERT INTO staff
         (school_id, person_id, staff_no, position, hire_date, department_id, manager_id, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [session.schoolId, personId, finalStaffNo, position, hire_date, department_id, manager_id, status],
    );
    const staffId = staffRes.insertId;

    let userId: number | null = null;

    // 4. Optionally create user account
    if (create_account && username) {
      const tempPassword = Math.random().toString(36).slice(2, 10) + '!A1';
      const hash = await bcrypt.hash(tempPassword, 12);
      const [userRes]: any = await conn.execute(
        `INSERT INTO users
           (school_id, person_id, email, username, password_hash, role, status)
         VALUES (?, ?, ?, ?, ?, 'staff', 'active')`,
        [session.schoolId, personId, email, username.trim(), hash],
      );
      userId = userRes.insertId;
    }

    return { staffId, personId, userId };
  });

  await logAudit({
    schoolId: session.schoolId,
    userId:   session.userId,
    action:   AuditAction.CREATED_STAFF,
    entityType: 'staff',
    entityId:   result.staffId,
    details: { first_name, last_name, position, department_id, has_account: !!result.userId },
    ip,
  });

  return NextResponse.json({ success: true, staff_id: result.staffId, user_id: result.userId }, { status: 201 });
});
