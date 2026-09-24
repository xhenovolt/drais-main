import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { canAny } from '@/lib/rbac/fallback';

export const CARDS_PERMISSION = 'learners.idcards.manage';
/** Production roles don't hold granular codes yet; the school-admin role is the working grant. */
const CARDS_ROLE_FALLBACK = ['admin'];

export interface CardsSession { userId: number; schoolId: number; isSuperAdmin: boolean }

/** Session + permission gate shared by every ID Card Studio route. */
export async function requireCardsAccess(req: NextRequest): Promise<CardsSession | NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const s: CardsSession = { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
  if (!(await canAny(s, [CARDS_PERMISSION], CARDS_ROLE_FALLBACK))) {
    return NextResponse.json({ error: 'You do not have permission to manage ID cards' }, { status: 403 });
  }
  return s;
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
