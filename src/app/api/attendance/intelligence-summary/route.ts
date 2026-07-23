/**
 * GET /api/attendance/intelligence-summary
 *
 * One compact roll-up of every attendance-intelligence layer, for the
 * dashboards: health score, device-clock anomalies, attendance gaps,
 * behavioural watch-list + roster review, identity issues, device reputation.
 * Each item carries its own route so the dashboard can link straight to it.
 * All best-effort — a slow/failing layer degrades to null, never 500s.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;

  const safe = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try { return await fn(); } catch { return fallback; }
  };

  const [health, clock, gaps, people, identity, devices] = await Promise.all([
    safe(async () => {
      const { runHealthChecks } = await import('@/lib/attendance/health');
      const r = await runHealthChecks(schoolId);
      return { score: r.score, status: r.status, topRec: r.recommendations[0] || null };
    }, null),
    safe(async () => {
      const { sweepToday } = await import('@/lib/attendance/time-intelligence/engine');
      const today = await sweepToday(schoolId);
      const anomalies = today.filter(t => t.status === 'anomaly').length;
      const worst = today.sort((a, b) => a.confidence - b.confidence)[0];
      return { anomalies, worstConfidence: worst?.confidence ?? null };
    }, null),
    safe(async () => {
      const { detectGaps } = await import('@/lib/attendance/recovery');
      const r = await detectGaps(schoolId);
      return { gaps: r.summary.gaps, watch: r.summary.watch };
    }, null),
    safe(async () => {
      const { query } = await import('@/lib/db');
      const { profilePerson } = await import('@/lib/attendance/person-intelligence');
      const rows = (await query(
        `SELECT r.person_id, r.attendance_date AS date, r.status FROM attendance_records r
          WHERE r.school_id = ? AND r.role_type = 'staff' AND r.attendance_date >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
          ORDER BY r.person_id, r.attendance_date ASC`,
        [schoolId],
      )) as any[];
      const by = new Map<number, any[]>();
      for (const r of rows) { if (!by.has(r.person_id)) by.set(r.person_id, []); by.get(r.person_id)!.push({ date: String(r.date).slice(0, 10), status: r.status }); }
      let watch = 0, roster = 0;
      for (const days of by.values()) { const p = profilePerson(days); if (p.watch) watch++; if (p.rosterReview) roster++; }
      return { watch, roster };
    }, null),
    safe(async () => {
      const { query } = await import('@/lib/db');
      const dup = (await query(
        `SELECT COUNT(*) n FROM (SELECT 1 FROM biometric_enrollments WHERE school_id = ? AND status IN ('active','pending_capture') GROUP BY role_type, role_ref_id HAVING COUNT(*) > 1) x`,
        [schoolId],
      )) as any[];
      const unk = (await query(
        `SELECT COUNT(DISTINCT device_user_id) n FROM attendance_raw_events WHERE school_id = ? AND (matched = 0 OR person_id IS NULL) AND punch_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)`,
        [schoolId],
      )) as any[];
      return { duplicates: Number(dup[0]?.n || 0), unknowns: Number(unk[0]?.n || 0) };
    }, null),
    safe(async () => {
      const { loadDeviceReputations } = await import('@/lib/attendance/device-intelligence-loader');
      const d = await loadDeviceReputations(schoolId);
      const fleet = d.length ? Math.round(d.reduce((a, x) => a + x.reputation.overall, 0) / d.length) : null;
      const needMaint = d.filter(x => x.reputation.band === 'poor').length;
      return { fleet, needMaint, count: d.length };
    }, null),
  ]);

  return NextResponse.json({ success: true, health, clock, gaps, people, identity, devices });
}
