/**
 * GET /api/attendance/allowance-report?date=YYYY-MM-DD[&format=csv]
 *
 * The JIPRA allowance-eligibility report: every active staff member for
 * one school-local day with arrival/departure (12-hour), designation,
 * department, arrival status (EARLY / ON TIME / LATE / ABSENT) and the
 * allowance decision — derived from the engine's persisted verdicts and
 * the school's OWN attendance rules. Read-only.
 *
 * format=csv returns the payment-processing file:
 *   Date, Employee Name, Designation, Department, Arrival Time,
 *   Departure Time, Attendance Status, Allowance Eligibility
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { buildAllowanceReport } from '@/lib/attendance/allowance';

export const runtime = 'nodejs';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

function humanDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[(m || 1) - 1]} ${y}`;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const url = new URL(req.url);
  const date = url.searchParams.get('date') || new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 });
  }

  const report = await buildAllowanceReport(session.schoolId, date);

  if (url.searchParams.get('format') === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const STATUS_LABEL: Record<string, string> = {
      EARLY: 'EARLY', ON_TIME: 'ON TIME', LATE: 'LATE', ABSENT: 'ABSENT',
    };
    const lines = [
      ['Date', 'Employee Name', 'Designation', 'Department', 'Arrival Time',
        'Departure Time', 'Attendance Status', 'Allowance Eligibility'].map(esc).join(','),
      ...report.rows.map(r => [
        humanDate(report.date),
        r.name,
        r.designation ?? '',
        r.department ?? '',
        r.arrival ?? '—',
        r.departure ?? (r.checkoutMissing && r.arrivalStatus !== 'ABSENT' ? 'MISSING CHECKOUT' : '—'),
        STATUS_LABEL[r.arrivalStatus] ?? r.arrivalStatus,
        r.allowance ? 'YES' : 'NO',
      ].map(esc).join(',')),
    ];
    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="allowance-eligibility-${report.date}.csv"`,
      },
    });
  }

  return NextResponse.json({ success: true, ...report });
}
