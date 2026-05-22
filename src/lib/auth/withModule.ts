/**
 * Module-guard HOF for API route handlers.
 *
 * Usage:
 *   export const GET = withModule('tahfiz', async (req) => { ... });
 *
 * Returns 403 MODULE_DISABLED if the calling school does not have the
 * module enabled. Super-admin does NOT bypass — module gates model
 * subscription intent, not access level.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule, type ModuleCode } from './requireModule';

type RouteHandler = (
  req: NextRequest,
  ctx?: unknown,
) => Promise<NextResponse> | NextResponse;

export function withModule(code: ModuleCode, handler: RouteHandler): RouteHandler {
  return async (req: NextRequest, ctx?: unknown) => {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const denied = await checkModule(session.schoolId, code);
    if (denied) return denied;
    return handler(req, ctx);
  };
}
