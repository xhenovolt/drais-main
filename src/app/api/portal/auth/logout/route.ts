import { NextRequest, NextResponse } from 'next/server';
import { getParentSession, destroyParentSession, PARENT_COOKIE_NAME } from '@/lib/portal/session';

export async function POST(req: NextRequest) {
  const session = await getParentSession(req);
  if (session) await destroyParentSession(session.sessionToken);
  const out = NextResponse.json({ success: true });
  out.cookies.set(PARENT_COOKIE_NAME, '', { path: '/', maxAge: 0 });
  return out;
}
