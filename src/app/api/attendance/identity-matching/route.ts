/**
 * Identity reconciliation API — device users ↔ DRAIS people.
 *
 *   POST { action:'run', device_sn }            pull directory + match →
 *                                               tiered suggestion report
 *   POST { action:'confirm', device_sn, pin, role_type, ref_id }
 *   POST { action:'confirm_auto', device_sn }   bulk-confirm the auto tier
 *   POST { action:'reject', device_sn, pin }
 *   GET  ?device_sn=…                           pending suggestions (page
 *                                               reload persistence)
 *
 * The biometric device is NEVER modified. All guards live in
 * device-user-sync.ts and are re-checked at confirm time.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import {
  runDeviceUserMatching, confirmMatch, rejectPin,
} from '@/lib/biometric/identity/device-user-sync';

export const runtime = 'nodejs';

async function resolveLanIp(deviceSn: string, schoolId: number): Promise<string | null> {
  const rows = (await query(
    `SELECT lan_ip FROM devices WHERE sn = ? AND school_id = ? LIMIT 1`,
    [deviceSn, schoolId],
  )) as Array<{ lan_ip: string | null }>;
  return rows[0]?.lan_ip ?? null;
}

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const sn = new URL(req.url).searchParams.get('device_sn');
  if (!sn) return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });
  const rows = await query(
    `SELECT device_pin, device_name, device_priv, device_card,
            candidate_role, candidate_ref_id, candidate_name, candidate_position,
            confidence, tier, contested, match_rank, status
       FROM biometric_match_suggestions
      WHERE school_id = ? AND device_sn = ? AND status IN ('pending','confirmed')
      ORDER BY device_pin + 0 ASC, match_rank ASC`,
    [session.schoolId, sn],
  );
  return NextResponse.json({ success: true, data: rows });
}

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const action = String(body?.action || '');
  const deviceSn = String(body?.device_sn || '');
  if (!deviceSn) return NextResponse.json({ error: 'device_sn is required' }, { status: 400 });

  try {
    switch (action) {
      case 'run': {
        const lanIp = body.device_ip ? String(body.device_ip) : await resolveLanIp(deviceSn, session.schoolId);
        const report = await runDeviceUserMatching({
          schoolId: session.schoolId, deviceSn, lanIp,
          port: body.device_port ? parseInt(body.device_port, 10) : undefined,
          actorUserId: session.userId ?? null,
        });
        return NextResponse.json({ success: true, report });
      }

      case 'confirm': {
        const pin = String(body.pin || '');
        const roleType = body.role_type === 'student' ? 'student' : 'staff';
        const refId = parseInt(body.ref_id, 10);
        if (!pin || !Number.isFinite(refId)) {
          return NextResponse.json({ error: 'pin and ref_id are required' }, { status: 400 });
        }
        const res = await confirmMatch({
          schoolId: session.schoolId, deviceSn, pin, roleType, refId,
          actorUserId: session.userId ?? null,
        });
        if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 409 });
        return NextResponse.json({ success: true, enrollmentId: res.enrollmentId });
      }

      case 'confirm_auto': {
        // Bulk-confirm the auto tier (rank-0, uncontested, still pending).
        const rows = (await query(
          `SELECT device_pin, candidate_role, candidate_ref_id
             FROM biometric_match_suggestions
            WHERE school_id = ? AND device_sn = ? AND status = 'pending'
              AND tier = 'auto' AND contested = 0 AND match_rank = 0
              AND candidate_ref_id IS NOT NULL`,
          [session.schoolId, deviceSn],
        )) as Array<{ device_pin: string; candidate_role: 'staff' | 'student'; candidate_ref_id: number }>;
        let confirmed = 0; const failures: Array<{ pin: string; reason: string }> = [];
        for (const r of rows) {
          const res = await confirmMatch({
            schoolId: session.schoolId, deviceSn, pin: r.device_pin,
            roleType: r.candidate_role, refId: r.candidate_ref_id,
            actorUserId: session.userId ?? null,
          });
          if (res.ok) confirmed++;
          else failures.push({ pin: r.device_pin, reason: res.reason || 'failed' });
        }
        return NextResponse.json({ success: true, confirmed, failed: failures.length, failures });
      }

      case 'reject': {
        const pin = String(body.pin || '');
        if (!pin) return NextResponse.json({ error: 'pin is required' }, { status: 400 });
        await rejectPin({ schoolId: session.schoolId, deviceSn, pin, actorUserId: session.userId ?? null });
        return NextResponse.json({ success: true });
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
    }
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
  }
}
