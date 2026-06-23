/**
 * GET  /api/admin/db-config  — current DB config (secrets masked) + allowLocal.
 * POST /api/admin/db-config  — apply + persist new DB credentials (live).
 *
 * Super-admin only — changing DB credentials is the highest-trust operation.
 * Editing happens from a working session; if the DB is unreachable at boot the
 * desktop diagnostic screen / drais.env file remain the fallback.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { readConfig, applyConfig, EDITABLE_KEYS } from '@/lib/db/runtime-config';
import { isLocalAllowed, getDbMode } from '@/lib/db/db-mode';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 });
  return NextResponse.json({ success: true, mode: getDbMode(), allowLocal: isLocalAllowed(), ...readConfig() });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const values: Record<string, string> = {};
  for (const k of EDITABLE_KEYS) if (typeof body?.[k] === 'string') values[k] = body[k];
  if (!Object.keys(values).length) return NextResponse.json({ error: 'No fields to update' }, { status: 400 });

  try {
    const result = await applyConfig(values);
    return NextResponse.json({ success: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to apply' }, { status: 500 });
  }
}
