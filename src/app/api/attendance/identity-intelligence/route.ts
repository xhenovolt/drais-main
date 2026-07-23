/**
 * GET /api/attendance/identity-intelligence — device-identity health:
 * duplicate mappings, unknown PINs, stale enrollments → scored + prioritised
 * suggestions (Phase 8). Read-only; changes go through Identity Matching.
 * ?banner=1 → high-severity count only.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import {
  classifyIssues, scoreIdentityHealth, type DuplicateGroup, type UnknownPin, type StaleEnrollment,
} from '@/lib/attendance/identity-intelligence';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { schoolId } = session;
  const list = (sql: string, params: any[] = [schoolId]) => query(sql, params).catch(() => []) as Promise<any[]>;

  try {
    // Duplicates: one person → multiple active PINs.
    const dupRows = (await list(
      `SELECT be.role_type, be.role_ref_id,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
              be.pin_value,
              DATEDIFF(NOW(), be.last_seen_on_device_at) AS last_seen_days,
              DATEDIFF(NOW(), be.enrolled_at) AS enrolled_days
         FROM biometric_enrollments be
         LEFT JOIN people p ON p.id = be.person_id
        WHERE be.school_id = ? AND be.status IN ('active','pending_capture')
          AND (be.role_type, be.role_ref_id) IN (
            SELECT role_type, role_ref_id FROM biometric_enrollments
             WHERE school_id = ? AND status IN ('active','pending_capture')
             GROUP BY role_type, role_ref_id HAVING COUNT(*) > 1)
        ORDER BY be.role_type, be.role_ref_id`,
      [schoolId, schoolId],
    )) as any[];
    const dupMap = new Map<string, DuplicateGroup>();
    for (const r of dupRows) {
      const key = `${r.role_type}:${r.role_ref_id}`;
      if (!dupMap.has(key)) dupMap.set(key, { role_type: r.role_type, role_ref_id: Number(r.role_ref_id), name: r.name || null, enrollments: [] });
      dupMap.get(key)!.enrollments.push({
        pin: Number(r.pin_value),
        last_seen_days: r.last_seen_days == null ? null : Number(r.last_seen_days),
        enrolled_days: r.enrolled_days == null ? null : Number(r.enrolled_days),
      });
    }
    const duplicates = [...dupMap.values()];

    // Unknown PINs: unmatched punches, with the device directory name if any.
    const unkRows = (await list(
      `SELECT ar.device_sn, CAST(ar.device_user_id AS CHAR) AS pin,
              COUNT(*) AS events,
              DATEDIFF(NOW(), MAX(ar.punch_at)) AS last_event_days,
              MAX(dud.device_name) AS suggested_name
         FROM attendance_raw_events ar
         LEFT JOIN device_user_directory dud
           ON dud.school_id = ar.school_id AND dud.device_sn = ar.device_sn
          AND dud.device_user_id = CAST(ar.device_user_id AS CHAR)
        WHERE ar.school_id = ? AND (ar.matched = 0 OR ar.person_id IS NULL)
        GROUP BY ar.device_sn, pin
        ORDER BY events DESC LIMIT 40`,
    )) as any[];
    const unknowns: UnknownPin[] = unkRows.map(r => ({
      device_sn: r.device_sn, pin: String(r.pin), events: Number(r.events),
      last_event_days: r.last_event_days == null ? null : Number(r.last_event_days),
      suggested_name: r.suggested_name || null,
    }));

    // Stale: enrolled but not seen on device in 30+ days (and we have sighting data).
    const staleRows = (await list(
      `SELECT be.pin_value, be.role_type,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name,
              DATEDIFF(NOW(), be.last_seen_on_device_at) AS last_seen_days
         FROM biometric_enrollments be
         LEFT JOIN people p ON p.id = be.person_id
        WHERE be.school_id = ? AND be.status = 'active'
          AND be.last_seen_on_device_at IS NOT NULL
          AND be.last_seen_on_device_at < DATE_SUB(NOW(), INTERVAL 30 DAY)
        ORDER BY last_seen_days DESC LIMIT 25`,
    )) as any[];
    const stales: StaleEnrollment[] = staleRows.map(r => ({
      pin: Number(r.pin_value), name: r.name || null, role_type: r.role_type,
      last_seen_days: Number(r.last_seen_days),
    }));

    const totalRows = (await list(`SELECT COUNT(*) n FROM biometric_enrollments WHERE school_id = ? AND status IN ('active','pending_capture')`)) as any[];
    const input = { duplicates, unknowns, stales, totalEnrollments: Number(totalRows[0]?.n || 0) };
    const issues = classifyIssues(input);
    const health = scoreIdentityHealth(input);

    if (new URL(req.url).searchParams.get('banner')) {
      return NextResponse.json({ success: true, high: issues.filter(i => i.severity === 'high').length, score: health.score });
    }
    return NextResponse.json({ success: true, health, issues, counts: { duplicates: duplicates.length, unknowns: unknowns.length, stales: stales.length } });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed' }, { status: 500 });
  }
}
