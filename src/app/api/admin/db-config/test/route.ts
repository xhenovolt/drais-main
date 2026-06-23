/**
 * POST /api/admin/db-config/test — try a connection with given creds (or the
 * current ones) WITHOUT persisting. Body: { mode: 'online'|'local', ...creds }.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { testConfig, EDITABLE_KEYS } from '@/lib/db/runtime-config';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) return NextResponse.json({ error: 'Super-admin only' }, { status: 403 });

  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'local' ? 'local' : 'online';
  const overrides: Record<string, string> = {};
  for (const k of EDITABLE_KEYS) if (typeof body?.[k] === 'string') overrides[k] = body[k];

  const result = await testConfig(mode, overrides);
  return NextResponse.json(result, { status: result.ok ? 200 : 200 });
}
