import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { listSnapshots } from '@/lib/snapshots/storage';
import type { SnapshotStatus, SnapshotType } from '@/lib/snapshots/types';

const VALID_TYPES: SnapshotType[] = ['theology', 'secular', 'mixed'];
const VALID_STATUSES: SnapshotStatus[] = ['generating', 'ready', 'failed'];

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const typeRaw   = sp.get('type');
  const statusRaw = sp.get('status');
  const termId    = sp.get('termId');
  const yearId    = sp.get('yearId');
  const limitRaw  = sp.get('limit');

  const type   = typeRaw && VALID_TYPES.includes(typeRaw as SnapshotType) ? (typeRaw as SnapshotType) : undefined;
  const status = statusRaw && VALID_STATUSES.includes(statusRaw as SnapshotStatus) ? (statusRaw as SnapshotStatus) : undefined;

  const rows = await listSnapshots({
    schoolId: session.schoolId,
    type,
    status,
    termId: termId ? Number(termId) : undefined,
    yearId: yearId ? Number(yearId) : undefined,
    limit:  limitRaw ? Number(limitRaw) : undefined,
  });

  return NextResponse.json({ success: true, data: rows });
}
