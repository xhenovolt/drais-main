import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import {
  getSchoolModuleStatus,
  setSchoolModule,
  isModuleCode,
  MODULE_CATALOG,
} from '@/lib/school-modules';

/**
 * Phase A — School-modules admin API.
 *
 * GET  /api/admin/school-modules       → current school's module status
 * POST /api/admin/school-modules       → toggle a module (super-admin only)
 *                                         body: { module_code, is_enabled, expires_at? }
 *
 * Scope: always the caller's own school. Super-admin cross-school changes
 * happen through the school-selection flow that switches `session.schoolId`.
 */

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const modules = await getSchoolModuleStatus(session.schoolId);
  return NextResponse.json({
    success: true,
    schoolId: session.schoolId,
    catalog: MODULE_CATALOG,
    modules,
  });
}

interface ToggleBody {
  module_code: string;
  is_enabled:  boolean;
  expires_at?: string | null;
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Forbidden — super-admin only' },
      { status: 403 },
    );
  }

  let body: ToggleBody;
  try {
    body = await req.json() as ToggleBody;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!isModuleCode(body.module_code)) {
    return NextResponse.json(
      { error: `Invalid module_code. Expected one of ${MODULE_CATALOG.map(m => m.code).join('|')}` },
      { status: 400 },
    );
  }
  if (typeof body.is_enabled !== 'boolean') {
    return NextResponse.json({ error: 'is_enabled must be boolean' }, { status: 400 });
  }

  let expiresAt: Date | null = null;
  if (body.expires_at !== undefined && body.expires_at !== null) {
    const d = new Date(body.expires_at);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: 'Invalid expires_at' }, { status: 400 });
    }
    expiresAt = d;
  }

  await setSchoolModule({
    schoolId:   session.schoolId,
    moduleCode: body.module_code,
    isEnabled:  body.is_enabled,
    expiresAt,
  });

  return NextResponse.json({ success: true });
}
