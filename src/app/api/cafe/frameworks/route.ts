/**
 * GET  /api/cafe/frameworks?active_only=1  → list frameworks for the caller's school
 * POST /api/cafe/frameworks                → create a framework (cafe.manage)
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { listFrameworks, createFramework } from '@/lib/cafe/frameworks';
import type { FrameworkInput } from '@/lib/cafe/types';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.view', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const active = req.nextUrl.searchParams.get('active_only') !== '0';
  const frameworks = await listFrameworks({ schoolId: session.schoolId, activeOnly: active });
  return NextResponse.json({ success: true, frameworks });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'cafe.manage', session.isSuperAdmin);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 403 });
  }
  const body = (await req.json().catch(() => null)) as FrameworkInput | null;
  if (!body) return NextResponse.json({ error: 'Invalid body' }, { status: 400 });
  try {
    const id = await createFramework({ schoolId: session.schoolId, createdBy: session.userId ?? null, input: body });
    return NextResponse.json({ success: true, id }, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    return NextResponse.json({ error: (e as Error).message }, { status: code === 'ER_DUP_ENTRY' ? 409 : 400 });
  }
}
