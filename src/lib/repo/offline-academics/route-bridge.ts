/**
 * @drais/repo — glue between live academics routes and the
 * offline-academics module. Same shape as every other route-bridge.ts
 * in this effort.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { listOfflineClasses, getOfflineClassDetail } from './index';

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
  const classes = await listOfflineClasses(repos, session.schoolId);
  return NextResponse.json({ success: true, classes });
}

export async function handleGet(request: NextRequest, classId: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const detail = await getOfflineClassDetail(repos, session.schoolId, classId);
  if (!detail) return NextResponse.json({ success: false, error: { message: 'Class not found', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, class: detail });
}
