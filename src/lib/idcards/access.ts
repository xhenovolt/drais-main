import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { userCan } from '@/lib/rbac';

export const CARDS_PERMISSION = 'learners.idcards.manage';

export interface CardsSession { userId: number; schoolId: number; isSuperAdmin: boolean }

/** Session + permission gate shared by every ID Card Studio route. */
export async function requireCardsAccess(req: NextRequest): Promise<CardsSession | NextResponse> {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin && !(await userCan(session.userId, session.schoolId, CARDS_PERMISSION))) {
    return NextResponse.json({ error: 'You do not have permission to manage ID cards' }, { status: 403 });
  }
  return { userId: session.userId, schoolId: session.schoolId, isSuperAdmin: !!session.isSuperAdmin };
}

export const isResponse = (v: unknown): v is NextResponse => v instanceof NextResponse;
