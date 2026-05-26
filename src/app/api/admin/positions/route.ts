import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listPositions, type PositionCategory } from '@/lib/positions';
import { query } from '@/lib/db';
import { requirePermission } from '@/lib/rbac';

const VALID_CATEGORIES: PositionCategory[] = [
  'academic', 'admin', 'finance', 'support', 'spiritual',
];

/**
 * GET /api/admin/positions — list positions available to the caller's
 * school (global catalog + school-authored customs). Used by the staff
 * form's position dropdown.
 *
 * Query params:
 *   category?       filter to one of academic|admin|finance|support|spiritual
 *   active_only=0   include inactive rows (default: active only)
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const sp = req.nextUrl.searchParams;
  const categoryRaw = sp.get('category');
  const activeOnlyRaw = sp.get('active_only');

  let category: PositionCategory | undefined;
  if (categoryRaw !== null) {
    if (!VALID_CATEGORIES.includes(categoryRaw as PositionCategory)) {
      return NextResponse.json(
        { error: `Invalid category. Expected one of ${VALID_CATEGORIES.join('|')}` },
        { status: 400 },
      );
    }
    category = categoryRaw as PositionCategory;
  }

  const positions = await listPositions({
    schoolId:   session.schoolId,
    activeOnly: activeOnlyRaw !== '0',
    category,
  });
  return NextResponse.json({ success: true, positions });
}

/**
 * POST /api/admin/positions — create a school-scoped custom position.
 * Catalog rows (school_id IS NULL) are seed-only and not editable here.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'staff.positions.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });

  const name = String(body.name ?? '').trim();
  const code = String(body.code ?? '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
  const category = body.category as PositionCategory;
  if (!name || !code) return NextResponse.json({ error: 'name and code required' }, { status: 400 });
  if (!VALID_CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  try {
    const r = (await query(
      `INSERT INTO positions
         (school_id, code, name, category, is_teaching, default_role_id, is_active, display_order)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        session.schoolId,
        code,
        name,
        category,
        body.is_teaching ? 1 : 0,
        body.default_role_id ?? null,
        Number(body.display_order ?? 100),
      ],
    )) as { insertId?: number };
    return NextResponse.json({ success: true, id: r.insertId }, { status: 201 });
  } catch (e: any) {
    if (e?.code === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Code already exists' }, { status: 409 });
    }
    return NextResponse.json({ error: 'Failed to create position' }, { status: 500 });
  }
}

/**
 * PUT /api/admin/positions — edit a school-scoped custom position.
 * Catalog rows (school_id IS NULL) are immutable; this rejects them.
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'staff.positions.manage', session.isSuperAdmin);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body?.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  if (body.category && !VALID_CATEGORIES.includes(body.category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  // Block edits to global catalog rows
  const guard = (await query(
    `SELECT school_id FROM positions WHERE id = ?`,
    [body.id],
  )) as Array<{ school_id: number | null }>;
  if (!guard.length) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (guard[0].school_id === null) {
    return NextResponse.json({ error: 'Global catalog positions are not editable' }, { status: 403 });
  }
  if (guard[0].school_id !== session.schoolId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const r = (await query(
    `UPDATE positions SET
       name           = COALESCE(?, name),
       category       = COALESCE(?, category),
       is_teaching    = COALESCE(?, is_teaching),
       display_order  = COALESCE(?, display_order),
       is_active      = COALESCE(?, is_active)
     WHERE id = ? AND school_id = ?`,
    [
      body.name ?? null,
      body.category ?? null,
      body.is_teaching == null ? null : (body.is_teaching ? 1 : 0),
      body.display_order == null ? null : Number(body.display_order),
      body.is_active == null ? null : (body.is_active ? 1 : 0),
      body.id, session.schoolId,
    ],
  )) as unknown as { affectedRows: number };
  if (r.affectedRows === 0) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ success: true });
}
