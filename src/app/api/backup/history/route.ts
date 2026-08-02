/**
 * GET /api/backup/history — this school's backup history (search/filter/
 * pagination handled client-side over the returned page for now — table
 * counts are small enough per school that a dedicated server-side search
 * isn't warranted yet).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listBackups } from '@/lib/backup/orchestrator';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));
  const { records, total } = await listBackups(session.schoolId, { page, limit });
  return NextResponse.json({ success: true, records, pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) } });
}
