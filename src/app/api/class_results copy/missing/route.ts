import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

/** Deprecated: use /api/class_results/missing instead. */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  url.pathname = '/api/class_results/missing';
  return NextResponse.redirect(url, { status: 308 });
}
