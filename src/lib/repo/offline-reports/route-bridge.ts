/**
 * @drais/repo — glue between live report routes and the offline-reports
 * module. Same shape as offline-students/offline-staff's route-bridge.ts.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { listOfflineSnapshots, getOfflineSnapshot } from './index';

async function requireSession(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return null;
  return session;
}

export async function handleList(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const snapshots = await listOfflineSnapshots(repos, session.schoolId);
  return NextResponse.json({ success: true, snapshots });
}

export async function handleGet(request: NextRequest, snapshotId: string): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const detail = await getOfflineSnapshot(repos, session.schoolId, snapshotId);
  if (!detail) return NextResponse.json({ success: false, error: { message: 'Report snapshot not found', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, snapshot: detail });
}
