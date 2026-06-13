/**
 * GET /api/biometric/unassigned
 *
 * Phase 2M/2N rewrite — the old implementation read the OLD-shape
 * biometric_enrollments (device_slot / status UNASSIGNED|CAPTURED),
 * which migration 002 renamed to biometric_enrollments_legacy. The
 * canonical sources of "biometric data without a confirmed identity"
 * are now:
 *
 *   1. fingerprint_orphans (unclaimed) — a template arrived from a
 *      device for a PIN DRAIS cannot resolve. kind='orphan'.
 *   2. pending_device_users (pending|ambiguous) — a device user echo
 *      that could not be deterministically mapped. kind='pending'.
 *
 * Field names stay compatible with the unassigned page
 * (device_slot = PIN, captured_at, status, source) plus `kind` +
 * `device_name` + `candidates` for the richer UI.
 *
 * Returns: { enrollments: [...], total }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { ensurePendingDeviceUsersSchema } from '@/lib/biometric/pending-device-users';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get('limit') ?? '50', 10) || 50));
  const schoolId = session.schoolId;

  try {
    const entries: any[] = [];

    // 1. Unclaimed orphan templates — captured biometric proof, no identity.
    try {
      const orphans = await query(
        `SELECT fo.id, fo.device_sn, fo.device_user_id, fo.finger_id,
                fo.template_size, fo.captured_at,
                dud.device_name
           FROM fingerprint_orphans fo
           LEFT JOIN device_user_directory dud
             ON dud.device_sn = fo.device_sn
            AND dud.device_user_id = fo.device_user_id
          WHERE (fo.school_id = ? OR fo.school_id IS NULL)
            AND fo.claimed_at IS NULL
          ORDER BY fo.captured_at DESC
          LIMIT ${limit}`,
        [schoolId],
      );
      for (const o of orphans || []) {
        entries.push({
          kind: 'orphan',
          id: Number(o.id),
          device_sn: o.device_sn,
          device_slot: Number(o.device_user_id) || o.device_user_id,
          device_name: o.device_name ?? null,
          status: 'CAPTURED',
          source: 'device template',
          finger_index: Number(o.finger_id) || 0,
          template_size: o.template_size,
          initiated_at: o.captured_at,
          captured_at: o.captured_at,
          updated_at: o.captured_at,
          initiated_by_name: null,
          candidates: null,
        });
      }
    } catch { /* orphans table lazy */ }

    // 2. Pending / ambiguous device users — known to the device, not to DRAIS.
    await ensurePendingDeviceUsersSchema();
    const pending = await query(
      `SELECT id, device_sn, device_user_pin, device_name, status, reason,
              candidates_json, first_seen, last_seen
         FROM pending_device_users
        WHERE school_id = ? AND status IN ('pending','ambiguous')
        ORDER BY last_seen DESC
        LIMIT ${limit}`,
      [schoolId],
    );
    for (const p of pending || []) {
      let candidates = null;
      try { candidates = p.candidates_json ? JSON.parse(p.candidates_json) : null; } catch { /* ignore */ }
      entries.push({
        kind: 'pending',
        id: Number(p.id),
        device_sn: p.device_sn,
        device_slot: Number(p.device_user_pin) || p.device_user_pin,
        device_name: p.device_name ?? null,
        status: p.status === 'ambiguous' ? 'AMBIGUOUS' : 'UNASSIGNED',
        source: p.reason ?? 'device user echo',
        finger_index: null,
        initiated_at: p.first_seen,
        captured_at: null,
        updated_at: p.last_seen,
        initiated_by_name: null,
        candidates,
      });
    }

    entries.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    return NextResponse.json({ enrollments: entries.slice(0, limit), total: entries.length });
  } catch (e: any) {
    return NextResponse.json({ error: `DB error: ${e.message}` }, { status: 500 });
  }
}
