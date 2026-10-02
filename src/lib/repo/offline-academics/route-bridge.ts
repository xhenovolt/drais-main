/**
 * @drais/repo — glue between live academics routes and the
 * offline-academics module. Same shape as every other route-bridge.ts
 * in this effort.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import { RepoError } from '../contract/types';
import {
  listOfflineClasses, getOfflineClassDetail,
  createOfflineClass, updateOfflineClass, deleteOfflineClass,
  listOfflineSubjects, createOfflineSubject, updateOfflineSubject, deleteOfflineSubject,
  assignTeacherToSubject, endTeacherAllocation,
  upsertOfflineResult, deleteOfflineResult, listOfflineResultsForClassSubject,
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
  console.error('[offline-academics] unexpected error:', err);
  return NextResponse.json({ success: false, error: { message: 'Unexpected error', code: 'SERVER_ERROR' } }, { status: 500 });
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

export async function handleCreateClass(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const cls = await createOfflineClass(repos, session.schoolId, body);
    return NextResponse.json({ success: true, class: cls }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}

export async function handleUpdateClass(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const cls = await updateOfflineClass(repos, session.schoolId, id, body);
    return NextResponse.json({ success: true, class: cls });
  } catch (err) { return errorResponse(err); }
}

export async function handleDeleteClass(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    await deleteOfflineClass(repos, session.schoolId, id, session.userId);
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
}

export async function handleListSubjects(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const subjects = await listOfflineSubjects(repos, session.schoolId);
  return NextResponse.json({ success: true, subjects });
}

export async function handleCreateSubject(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const subject = await createOfflineSubject(repos, session.schoolId, body);
    return NextResponse.json({ success: true, subject }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}

export async function handleUpdateSubject(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const subject = await updateOfflineSubject(repos, session.schoolId, id, body);
    return NextResponse.json({ success: true, subject });
  } catch (err) { return errorResponse(err); }
}

export async function handleDeleteSubject(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    await deleteOfflineSubject(repos, session.schoolId, id, session.userId);
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
}

export async function handleAssignTeacher(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const allocation = await assignTeacherToSubject(repos, session.schoolId, body);
    return NextResponse.json({ success: true, allocation }, { status: 201 });
  } catch (err) { return errorResponse(err); }
}

export async function handleEndAllocation(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    await endTeacherAllocation(repos, session.schoolId, id);
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
}

export async function handleListResults(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const url = new URL(request.url);
  const classIdRaw = url.searchParams.get('classId');
  const subjectIdRaw = url.searchParams.get('subjectId');
  const termId = url.searchParams.get('termId');
  // Explicit null checks, not just Number.isFinite(Number(raw)) — Number(null)
  // is 0, which IS finite, so a genuinely missing param would otherwise
  // silently pass as classId=0 rather than being refused as missing.
  if (classIdRaw == null || subjectIdRaw == null || !Number.isFinite(Number(classIdRaw)) || !Number.isFinite(Number(subjectIdRaw))) {
    return NextResponse.json({ success: false, error: { message: '?classId and ?subjectId are required', code: 'INVALID_INPUT' } }, { status: 400 });
  }
  const classId = Number(classIdRaw);
  const subjectId = Number(subjectIdRaw);
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const results = await listOfflineResultsForClassSubject(repos, session.schoolId, classId, subjectId, termId ? Number(termId) : null);
  return NextResponse.json({ success: true, results });
}

export async function handleUpsertResult(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const result = await upsertOfflineResult(repos, session.schoolId, body);
    return NextResponse.json({ success: true, result });
  } catch (err) { return errorResponse(err); }
}

export async function handleDeleteResult(request: NextRequest, id: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });
  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    await deleteOfflineResult(repos, session.schoolId, id, session.userId);
    return NextResponse.json({ success: true });
  } catch (err) { return errorResponse(err); }
}
