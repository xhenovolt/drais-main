import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { checkModule } from '@/lib/auth/requireModule';
import { canAny } from '@/lib/rbac/fallback';

export type LessonNeed = 'view' | 'correct' | 'configure';

// Granular code, then the coarse code roles actually hold in production, then the admin role.
const GATES: Record<LessonNeed, { codes: string[]; roles: string[] }> = {
  view: { codes: ['attendance.lessons.view', 'attendance.view'], roles: ['admin'] },
  correct: { codes: ['attendance.lessons.correct', 'attendance.manage'], roles: ['admin'] },
  configure: { codes: ['attendance.lessons.configure'], roles: ['admin'] },
};

export interface LessonSession {
  userId: number; schoolId: number; isSuperAdmin: boolean; staffId: number | null;
  /** may see every teacher's lessons (configure-level) */
  seesAll: boolean;
}

export async function requireLessonAccess(req: NextRequest, need: LessonNeed): Promise<LessonSession | NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const base = { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
  const denied = await checkModule(session.schoolId, 'attendance');
  if (denied) return denied;
  const g = GATES[need];
  if (!(await canAny(base, g.codes, g.roles))) {
    return NextResponse.json({ error: `You do not have permission to ${need} lesson attendance` }, { status: 403 });
  }
  const seesAll = need === 'configure' || await canAny(base, GATES.configure.codes, GATES.configure.roles);
  return { ...base, staffId: session.staffId ?? null, seesAll };
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
