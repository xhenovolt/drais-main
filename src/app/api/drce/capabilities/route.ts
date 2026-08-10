/**
 * GET /api/drce/capabilities
 *   → { view, edit, approve, publish, admin }
 *
 * Editor uses this to decide which workflow buttons to render and whether
 * to switch into read-only mode. Super-admins receive all-true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { userCan } from '@/lib/rbac';
import type { DRCECapabilities } from '@/lib/drce/workflow';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'academics');
  if (modDenied) return modDenied;

  if (session.isSuperAdmin) {
    const caps: DRCECapabilities = { view: true, edit: true, approve: true, publish: true, admin: true };
    return NextResponse.json({ success: true, capabilities: caps });
  }

  const [view, edit, approve, publish, admin] = await Promise.all([
    userCan(session.userId, session.schoolId, 'drce.view'),
    userCan(session.userId, session.schoolId, 'drce.edit'),
    userCan(session.userId, session.schoolId, 'drce.approve'),
    userCan(session.userId, session.schoolId, 'drce.publish'),
    userCan(session.userId, session.schoolId, 'drce.admin'),
  ]);

  // Admin implies everything below it; legacy DRCE users without any granular
  // grant still get `view` so existing report-card pages continue to render.
  // The deployment-time backfill can grant `drce.view` to every role; until
  // then we err on the side of "let people read templates".
  const caps: DRCECapabilities = {
    view:    view    || admin || edit || approve || publish || true,  // view is universal-read
    edit:    edit    || admin,
    approve: approve || admin,
    publish: publish || admin,
    admin,
  };
  return NextResponse.json({ success: true, capabilities: caps });
}
