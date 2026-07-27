import { NextRequest, NextResponse } from 'next/server';
import { getConnection, query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';
import { buildCsv, csvResponse } from '@/lib/export/serverCsv';
export async function GET(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const { searchParams } = new URL(req.url);
    // school_id derived from session below
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    const rawPage = pageParam ? parseInt(pageParam, 10) : NaN;
    const rawLimit = limitParam ? parseInt(limitParam, 10) : NaN;
    const usePagination = Number.isFinite(rawPage) && rawPage > 0 && Number.isFinite(rawLimit) && rawLimit > 0;
    const page = usePagination ? rawPage : 1;
    const limit = usePagination ? rawLimit : null;
    const offset = usePagination && limit ? Math.max(0, (page - 1) * limit) : 0;
    // Name/staff-no/position search — pickers (e.g. the attendance Assign
    // popup) rely on this to filter server-side instead of dumping the
    // full staff list at the user.
    const search = searchParams.get('search')?.trim() || '';
    // Bare `search=…&limit=…` (no page) must still cap the result set.
    const searchLimit = !usePagination && search && Number.isFinite(rawLimit) && rawLimit > 0
      ? Math.min(100, rawLimit) : null;

    connection = await getConnection();

    // Check if enhanced columns exist, if not create them
    try {
      await connection.execute(`
        ALTER TABLE staff 
        ADD COLUMN IF NOT EXISTS branch_id BIGINT DEFAULT 1 AFTER school_id,
        ADD COLUMN IF NOT EXISTS department_id BIGINT DEFAULT NULL AFTER staff_no,
        ADD COLUMN IF NOT EXISTS role_id BIGINT DEFAULT NULL AFTER department_id,
        ADD COLUMN IF NOT EXISTS employment_type ENUM('permanent','contract','volunteer','part-time') DEFAULT 'permanent' AFTER position,
        ADD COLUMN IF NOT EXISTS qualification VARCHAR(255) DEFAULT NULL AFTER employment_type,
        ADD COLUMN IF NOT EXISTS experience_years INT DEFAULT 0 AFTER qualification,
        ADD COLUMN IF NOT EXISTS salary DECIMAL(14,2) DEFAULT NULL AFTER hire_date,
        ADD COLUMN IF NOT EXISTS bank_name VARCHAR(150) DEFAULT NULL AFTER salary,
        ADD COLUMN IF NOT EXISTS bank_account_no VARCHAR(100) DEFAULT NULL AFTER bank_name,
        ADD COLUMN IF NOT EXISTS nssf_no VARCHAR(100) DEFAULT NULL AFTER bank_account_no,
        ADD COLUMN IF NOT EXISTS tin_no VARCHAR(100) DEFAULT NULL AFTER nssf_no,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER status,
        ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP NULL DEFAULT NULL AFTER updated_at
      `);
    } catch (alterError) {
      // Columns might already exist, continue
      console.log('Note: Some staff table columns may already exist');
    }

    // Search across full name (any order), staff number and position.
    // LOWER() on both sides → case-insensitive regardless of column collation.
    const searchWhere = search
      ? ` AND (LOWER(CONCAT_WS(' ', p.first_name, p.other_name, p.last_name)) LIKE ?
           OR LOWER(CONCAT_WS(' ', p.last_name, p.first_name)) LIKE ?
           OR LOWER(s.staff_no) LIKE ? OR LOWER(s.position) LIKE ?)`
      : '';
    const like = `%${search.toLowerCase()}%`;
    const searchParams2: any[] = search ? [like, like, like, like] : [];

    // ── CSV export (P3): standardized, metadata-headed, self-auditing ─────────
    if (searchParams.get('format') === 'csv') {
      const rows = (await query(
        `SELECT s.staff_no, p.first_name, p.other_name, p.last_name, s.position, s.status,
                p.gender, p.phone, p.email, s.hire_date
           FROM staff s JOIN people p ON s.person_id = p.id
          WHERE s.school_id = ? AND s.deleted_at IS NULL${searchWhere}
          ORDER BY p.first_name, p.last_name`,
        [schoolId, ...searchParams2],
      )) as any[];
      const sch = (await query('SELECT name FROM schools WHERE id = ? LIMIT 1', [schoolId]).catch(() => [])) as any[];
      const me = (await query('SELECT CONCAT(first_name, " ", last_name) AS nm, email FROM users WHERE id = ? LIMIT 1', [session.userId]).catch(() => [])) as any[];
      const csv = buildCsv(
        [
          { key: 'staff_no', label: 'Staff No' },
          { key: 'name', label: 'Name', value: (r: any) => [r.first_name, r.other_name, r.last_name].filter(Boolean).join(' ') },
          { key: 'position', label: 'Position' },
          { key: 'status', label: 'Status' },
          { key: 'gender', label: 'Gender' },
          { key: 'phone', label: 'Phone' },
          { key: 'email', label: 'Email' },
          { key: 'hire_date', label: 'Hire date', value: (r: any) => r.hire_date ? String(r.hire_date).slice(0, 10) : '' },
        ],
        rows,
        { title: 'DRAIS Staff Export', schoolName: sch[0]?.name ?? null, generatedBy: me[0]?.nm?.trim() || me[0]?.email || null, scope: search ? `search=${search}` : 'all' },
      );
      void logAudit({
        schoolId, userId: session.userId, action: AuditAction.EXPORTED_STAFF,
        entityType: 'staff', details: { rows: rows.length, search: search || null },
        ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || null,
        userAgent: req.headers.get('user-agent'),
      });
      return csvResponse(`staff-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    }

    // Get basic staff data
    let sql = `
      SELECT
        s.id,
        s.staff_no,
        s.position,
        s.hire_date,
        s.status,
        p.first_name,
        p.last_name,
        p.other_name,
        p.gender,
        p.phone,
        p.email,
        p.photo_url
      FROM staff s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL${searchWhere}
      ORDER BY p.first_name, p.last_name
    `;
    if (usePagination && limit) {
      sql += ` LIMIT ${Math.max(1, limit)} OFFSET ${Math.max(0, offset)}`;
    } else if (searchLimit) {
      sql += ` LIMIT ${searchLimit}`;
    }

    const [staffRows] = await connection.execute(sql, [schoolId, ...searchParams2]);

    // Count total records
    const [countRows] = await connection.execute(`
      SELECT COUNT(*) as total
      FROM staff s
      JOIN people p ON s.person_id = p.id
      WHERE s.school_id = ? AND s.deleted_at IS NULL${searchWhere}
    `, [schoolId, ...searchParams2]);

    const total = Array.isArray(countRows) ? countRows[0]?.total || 0 : 0;

    return NextResponse.json({
      success: true,
      data: staffRows,
      pagination: {
        page,
        limit,
        total,
        pages: usePagination && limit ? Math.ceil(total / limit) : 1
      }
    });

  } catch (error: any) {
    console.error('Staff fetch error:', error);
    return NextResponse.json({
      success: false,
      message: 'Failed to fetch staff data',
      data: []
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, message: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { first_name,
      last_name,
      other_name,
      gender,
      phone,
      email,
      position,
      hire_date,
      staff_no,
      department_id } = body;

    if (!first_name || !last_name || !position) {
      return NextResponse.json({
        success: false,
        message: 'First name, last name, and position are required'
      }, { status: 400 });
    }

    connection = await getConnection();
    await connection.beginTransaction();

    try {
      // Insert person record
      const [personResult] = await connection.execute(`
        INSERT INTO people (school_id, first_name, last_name, other_name, gender, phone, email)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [schoolId, first_name, last_name, other_name || null, gender || null, phone || null, email || null]);

      const personId = personResult.insertId;

      // Generate staff number if not provided
      const finalStaffNo = staff_no || `STAFF${Date.now()}${Math.random().toString(36).substr(2, 4).toUpperCase()}`;

      // Insert staff record
      const [staffResult] = await connection.execute(`
        INSERT INTO staff (school_id, person_id, staff_no, position, hire_date, status)
        VALUES (?, ?, ?, ?, ?, 'active')
      `, [schoolId, personId, finalStaffNo, position, hire_date || new Date().toISOString().split('T')[0]]);

      await connection.commit();

      // Audit log
      await logAudit({
        schoolId,
        userId: session.userId,
        action: AuditAction.CREATED_STAFF,
        entityType: 'staff',
        entityId: staffResult.insertId,
        details: {
          staffNo: finalStaffNo,
          firstName: first_name,
          lastName: last_name,
          position,
        },
      }).catch(err => console.error('Audit log failed:', err));

      return NextResponse.json({
        success: true,
        message: 'Staff member added successfully',
        data: {
          id: staffResult.insertId,
          staff_no: finalStaffNo,
          person_id: personId
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
      message: 'Failed to create staff member'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
