import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * Deprecated: use /api/class_results/submit instead.
 * This route is kept only to avoid 404s from legacy clients.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const url = new URL(req.url);
  url.pathname = '/api/class_results/submit';
  return NextResponse.redirect(url, { status: 308 });
}
