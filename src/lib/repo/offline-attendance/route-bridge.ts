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
import { listOfflineAttendanceForDate, getOfflinePersonAttendance } from './index';

async function requireSession(request: NextRequest) {
  return getSessionSchoolId(request);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
