/**
 * @drais/repo — the actual glue between live student routes and the
 * offline-students module. Same shape as offline-auth/route-bridge.ts:
 * the only file the new route.ts files import, adapting pure/tested logic
 * to NextRequest/NextResponse. Auth is the already-built, already-offline-
 * aware getSessionSchoolId() (sub-effort 10) — a logged-in offline session
 * already carries the correct schoolId, no separate lookup needed here.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { RepoError } from '../contract/types';
import {
  listOfflineStudents, getOfflineStudent, createOfflineStudent,
  updateOfflineStudent, deleteOfflineStudent, restoreOfflineStudent,
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
  console.error('[offline-students] unexpected error:', err);
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
    const students = await listOfflineStudents(repos, session.schoolId, { search, includeDeleted });
    return NextResponse.json({ success: true, students });
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
    const student = await createOfflineStudent(repos, session.schoolId, body);
    return NextResponse.json({ success: true, student }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleGet(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const student = await getOfflineStudent(repos, session.schoolId, id);
  if (!student) return NextResponse.json({ success: false, error: { message: 'Student not found', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, student });
}

export async function handleUpdate(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const student = await updateOfflineStudent(repos, session.schoolId, id, body);
    return NextResponse.json({ success: true, student });
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
    await deleteOfflineStudent(repos, session.schoolId, id, session.userId, body?.reason ?? null);
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
    const student = await restoreOfflineStudent(repos, session.schoolId, id, session.userId);
    return NextResponse.json({ success: true, student });
  } catch (err) {
    return errorResponse(err);
  }
}
