/**
 * @drais/repo — glue between live staff routes and the offline-staff
 * module. Same shape as offline-students/route-bridge.ts: the only file
 * the new route.ts files import. Auth is the already-offline-aware
 * getSessionSchoolId() (sub-effort 10).
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { RepoError } from '../contract/types';
import {
  listOfflineStaff, getOfflineStaff, createOfflineStaff,
  updateOfflineStaff, deleteOfflineStaff, restoreOfflineStaff,
} from './index';

async function requireSession(request: NextRequest) {
  const session = await getSessionSchoolId(request);
  if (!session) return null;
  return session;
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof RepoError) {
    const status = err.code === 'NOT_FOUND' ? 404 : err.code === 'DUPLICATE' ? 409 : 400;
    return NextResponse.json({ success: false, error: { message: err.message, code: err.code } }, { status });
  }
  console.error('[offline-staff] unexpected error:', err);
  return NextResponse.json({ success: false, error: { message: 'Unexpected error', code: 'SERVER_ERROR' } }, { status: 500 });
}

export async function handleList(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const url = new URL(request.url);
  const search = url.searchParams.get('search') ?? undefined;
  const includeDeleted = url.searchParams.get('includeDeleted') === '1';

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const staff = await listOfflineStaff(repos, session.schoolId, { search, includeDeleted });
    return NextResponse.json({ success: true, staff });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleCreate(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const staff = await createOfflineStaff(repos, session.schoolId, body, db);
    return NextResponse.json({ success: true, staff }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleGet(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const staff = await getOfflineStaff(repos, session.schoolId, id);
  if (!staff) return NextResponse.json({ success: false, error: { message: 'Staff member not found', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, staff });
}

export async function handleUpdate(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const staff = await updateOfflineStaff(repos, session.schoolId, id, body);
    return NextResponse.json({ success: true, staff });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleDelete(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    await deleteOfflineStaff(repos, session.schoolId, id, session.userId, body?.reason ?? null);
    return NextResponse.json({ success: true });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleRestore(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const staff = await restoreOfflineStaff(repos, session.schoolId, id, session.userId);
    return NextResponse.json({ success: true, staff });
  } catch (err) {
    return errorResponse(err);
  }
}
