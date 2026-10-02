/**
 * @drais/repo — the glue between the new offline-attendance routes and the
 * offline-attendance module. Same shape as offline-students/route-bridge.ts:
 * the only file the route.ts files import. Auth is the already-offline-aware
 * getSessionSchoolId() (sub-effort 10) — a logged-in offline session already
 * carries the correct schoolId.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getSqliteDb } from '../sqlite/singleton';
import { createSqliteRepos } from '../sqlite';
import {
  listOfflineAttendanceForDate, getOfflinePersonAttendance,
  recordOfflinePunch, overrideOfflineAttendanceStatus, deleteOfflineManualPunch,
} from './index';
import { RepoError } from '../contract/types';

async function requireSession(request: NextRequest) {
  return getSessionSchoolId(request);
}

function errorResponse(err: unknown): NextResponse {
  if (err instanceof RepoError) {
    const status = err.code === 'NOT_FOUND' ? 404 : 400;
    return NextResponse.json({ success: false, error: { message: err.message, code: err.code } }, { status });
  }
  console.error('[offline-attendance] unexpected error:', err);
  return NextResponse.json({ success: false, error: { message: 'Unexpected error', code: 'SERVER_ERROR' } }, { status: 500 });
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ROLE_RE = /^(student|staff)$/;
const STATUS_RE = /^(present|late|absent|half_day|early_leave|holiday|weekend)$/;

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function handleForDate(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date') ?? todayIso();
  if (!DATE_RE.test(date)) {
    return NextResponse.json({ success: false, error: { message: 'date must be YYYY-MM-DD', code: 'INVALID_INPUT' } }, { status: 400 });
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const { rows, summary } = await listOfflineAttendanceForDate(repos, session.schoolId, date);
  return NextResponse.json({ success: true, rows, summary });
}

export async function handleForPerson(request: NextRequest, personId: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const url = new URL(request.url);
  const today = todayIso();
  const from = url.searchParams.get('from') ?? today;
  const to = url.searchParams.get('to') ?? today;
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
    return NextResponse.json({ success: false, error: { message: 'from/to must be YYYY-MM-DD', code: 'INVALID_INPUT' } }, { status: 400 });
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  const history = await getOfflinePersonAttendance(repos, session.schoolId, personId, from, to);
  if (!history) return NextResponse.json({ success: false, error: { message: 'Person not found', code: 'NOT_FOUND' } }, { status: 404 });
  return NextResponse.json({ success: true, history });
}

export async function handleRecordPunch(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const personId = Number(body?.personId);
  const roleType = body?.roleType;
  if (!Number.isFinite(personId) || !ROLE_RE.test(roleType)) {
    return NextResponse.json({ success: false, error: { message: 'personId (number) and roleType (student|staff) are required', code: 'INVALID_INPUT' } }, { status: 400 });
  }
  const punchAt = body?.punchAt ? new Date(body.punchAt) : new Date();
  if (Number.isNaN(punchAt.getTime())) {
    return NextResponse.json({ success: false, error: { message: 'punchAt is not a valid date', code: 'INVALID_INPUT' } }, { status: 400 });
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const row = await recordOfflinePunch(repos, session.schoolId, personId, roleType, punchAt);
    return NextResponse.json({ success: true, row }, { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleOverrideStatus(request: NextRequest): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  let body: any = {};
  try { body = await request.json(); } catch { /* empty */ }
  const personId = Number(body?.personId);
  const roleType = body?.roleType;
  const date = body?.date;
  const status = body?.status;
  if (!Number.isFinite(personId) || !ROLE_RE.test(roleType) || !DATE_RE.test(date) || !STATUS_RE.test(status)) {
    return NextResponse.json({ success: false, error: { message: 'personId, roleType, date (YYYY-MM-DD) and a valid status are required', code: 'INVALID_INPUT' } }, { status: 400 });
  }

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const row = await overrideOfflineAttendanceStatus(repos, session.schoolId, personId, roleType, date, status);
    return NextResponse.json({ success: true, row });
  } catch (err) {
    return errorResponse(err);
  }
}

export async function handleDeleteManualPunch(request: NextRequest, rawEventId: number): Promise<NextResponse> {
  const session = await requireSession(request);
  if (!session) return NextResponse.json({ success: false, error: { message: 'Not authenticated' } }, { status: 401 });

  const url = new URL(request.url);
  const personIdRaw = url.searchParams.get('personId');
  const roleType = url.searchParams.get('roleType');
  // Explicit null check, not just Number.isFinite(Number(raw)) — Number(null)
  // is 0, which IS finite, so a genuinely missing ?personId would otherwise
  // silently pass as personId=0 (caught the same way in offline-academics'
  // handleListResults, same session).
  if (personIdRaw == null || !Number.isFinite(Number(personIdRaw)) || !ROLE_RE.test(roleType ?? '')) {
    return NextResponse.json({ success: false, error: { message: '?personId and ?roleType (student|staff) are required', code: 'INVALID_INPUT' } }, { status: 400 });
  }
  const personId = Number(personIdRaw);

  const db = getSqliteDb();
  const repos = createSqliteRepos(db);
  try {
    const row = await deleteOfflineManualPunch(repos, session.schoolId, personId, roleType as 'student' | 'staff', rawEventId);
    return NextResponse.json({ success: true, row });
  } catch (err) {
    return errorResponse(err);
  }
}
