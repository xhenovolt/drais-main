/**
 * GET /api/dvcf/documents/[id]/versions
 * Returns the document's version history (most recent first), school-scoped.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listVersions } from '@/lib/drce/versions';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const docId = Number((await params).id);
  if (!Number.isFinite(docId)) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }
  const versions = await listVersions(docId, session.schoolId, 50);
  return NextResponse.json({ success: true, versions });
}
