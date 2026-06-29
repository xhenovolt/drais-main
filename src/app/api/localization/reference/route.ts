export const runtime = 'nodejs';

import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Reference-data Arabic labels (Batch 6). Lets a school set Arabic names for
 * classes/subjects/streams/departments/terms/programs from the UI so Arabic
 * reports show Arabic structure — without the founder.
 *
 * GET   ?type=classes       — list { id, name, name_ar }
 * PATCH { type, id, name_ar } — set one Arabic label
 *
 * Table names come ONLY from this allow-list (never from user input).
 */
const TABLES: Record<string, { table: string; soft: boolean }> = {
  classes:     { table: 'classes',     soft: true },
  subjects:    { table: 'subjects',    soft: true },
  streams:     { table: 'streams',     soft: true },
  departments: { table: 'departments', soft: true },
  terms:       { table: 'terms',       soft: true },
  programs:    { table: 'programs',    soft: false },
};

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const type = req.nextUrl.searchParams.get('type') || '';
  const cfg = TABLES[type];
  if (!cfg) return NextResponse.json({ error: 'Unknown type' }, { status: 400 });

  const conn = await getConnection();
  try {
    const softFilter = cfg.soft ? 'AND deleted_at IS NULL' : '';
    const [rows]: any = await conn.execute(
      `SELECT id, name, name_ar FROM ${cfg.table} WHERE school_id = ? ${softFilter} ORDER BY name ASC`,
      [session.schoolId],
    );
    return NextResponse.json({ success: true, type, rows });
  } catch (e: any) {
    console.error('[localization/reference GET]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const cfg = TABLES[body.type];
  if (!cfg) return NextResponse.json({ error: 'Unknown type' }, { status: 400 });
  const id = Number(body.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  const nameAr = String(body.name_ar ?? '').trim();

  const conn = await getConnection();
  try {
    await conn.execute(
      `UPDATE ${cfg.table} SET name_ar = ? WHERE id = ? AND school_id = ?`,
      [nameAr === '' ? null : nameAr, id, session.schoolId],
    );
    return NextResponse.json({ success: true });
  } catch (e: any) {
    console.error('[localization/reference PATCH]', e);
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  } finally {
    await conn.end();
  }
}
