/**
 * POST /api/attendance/devices/[sn]/provision-staff
 * ─────────────────────────────────────────────────
 * JIPRA remediation tool: the school has NO students, yet device PINs are
 * mapped as learners. This forcefully re-owns the biometric identities to
 * STAFF without anyone re-scanning a finger.
 *
 * It works off device_user_directory (populated by "Sync directory" over
 * local TCP — the proven LAN read), so PIN handling is exactly what the
 * rest of reconciliation uses. For each real device user:
 *   • create a staff record from the on-device name, and
 *   • reassign that PIN's enrollment student → staff IN PLACE (keeps the
 *     on-device fingerprint template + the DRAIS template link), or map a
 *     fresh staff enrollment if the PIN wasn't enrolled.
 * Then every REMAINING student enrollment for the school is unmapped.
 *
 * Fingerprints are NOT re-captured — the template already lives on the
 * device; we only change who DRAIS thinks the PIN is.
 *
 * Guardrails: super-admin, school-scoped, dry_run preview. Blank/unnamed
 * device users are skipped (left unmapped) per operator choice.
 *
 * Body: { dry_run?: boolean }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import {
  upsertEnrollment, reassignEnrollment, unmapEnrollment,
} from '@/lib/biometric/enrollment-service';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';

export const runtime = 'nodejs';

/** Blank / non-name (all digits, IP-ish, or no letters) → skip. */
function usableName(raw: string | null): { first: string; last: string } | null {
  const name = (raw || '').trim();
  if (!name || !/[A-Za-z]/.test(name)) return null;
  const parts = name.replace(/\s+/g, ' ').split(' ');
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!session.isSuperAdmin) {
    return NextResponse.json({ error: 'Only an administrator can provision device users as staff.' }, { status: 403 });
  }
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const schoolId = access.schoolId;

  let body: any = {};
  try { body = await req.json(); } catch { /* default dry_run false */ }
  const dryRun = body?.dry_run === true;

  try {
    // Device's current users (echoed by the last directory sync).
    const directory = (await query(
      `SELECT device_user_id AS pin, device_name
         FROM device_user_directory
        WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)
          AND has_recent_echo = 1
        ORDER BY CAST(device_user_id AS UNSIGNED)`,
      [sn, schoolId],
    )) as Array<{ pin: string; device_name: string | null }>;

    if (directory.length === 0) {
      return NextResponse.json({
        error: 'The device directory is empty. Click "Sync directory" first (device must be on the LAN) so DRAIS knows who is on the device, then retry.',
      }, { status: 409 });
    }

    // Current enrollment at each PIN (any status) for fast lookup.
    const enrollRows = (await query(
      `SELECT id, pin_value, role_type, role_ref_id, status
         FROM biometric_enrollments WHERE school_id = ?`,
      [schoolId],
    )) as Array<{ id: number; pin_value: number; role_type: string; role_ref_id: number; status: string }>;
    const enrollByPin = new Map<number, typeof enrollRows[number]>();
    for (const e of enrollRows) enrollByPin.set(Number(e.pin_value), e);

    const plan: Array<{ pin: string; name: string; current: string; action: string }> = [];
    const summary = { converted: 0, createdStaff: 0, mappedFresh: 0, alreadyStaff: 0, skippedBlank: 0, unmappedRemainingStudents: 0 };

    // ── Pass 1: device users → staff ─────────────────────────────────
    for (const d of directory) {
      const pinNum = Number(d.pin);
      const nm = usableName(d.device_name);
      const existing = Number.isFinite(pinNum) ? enrollByPin.get(pinNum) : undefined;
      const currentDesc = existing ? `${existing.role_type} #${existing.role_ref_id} (${existing.status})` : 'unmapped';

      if (!Number.isFinite(pinNum) || pinNum <= 0) { continue; }
      if (existing && existing.role_type === 'staff') {
        summary.alreadyStaff++;
        plan.push({ pin: d.pin, name: d.device_name || '', current: currentDesc, action: 'skip (already staff)' });
        continue;
      }
      if (!nm) {
        summary.skippedBlank++;
        plan.push({ pin: d.pin, name: d.device_name || '(blank)', current: currentDesc, action: 'skip (no usable name)' });
        continue;
      }

      const action = existing ? 'reassign student→staff' : 'create staff + map';
      plan.push({ pin: d.pin, name: `${nm.first} ${nm.last}`.trim(), current: currentDesc, action });
      if (dryRun) continue;

      // Create the staff record.
      const personRes = (await query(
        `INSERT INTO people (school_id, first_name, last_name, created_at) VALUES (?, ?, ?, NOW())`,
        [schoolId, nm.first, nm.last],
      )) as any;
      const staffRes = (await query(
        `INSERT INTO staff (school_id, person_id, status, created_at) VALUES (?, ?, 'active', NOW())`,
        [schoolId, personRes.insertId],
      )) as any;
      const staffId = staffRes.insertId as number;
      summary.createdStaff++;

      if (existing) {
        // Reassign in place — keeps the enrollment id, so the device
        // template linkage survives; future scans resolve to staff.
        const r = await reassignEnrollment({
          schoolId, enrollmentId: existing.id, newRoleType: 'staff', newRoleRefId: staffId,
          reason: 'JIPRA: device user re-owned from student to staff', actorUserId: session.userId,
        });
        if (r.ok) summary.converted++;
      } else {
        const up = await upsertEnrollment({
          schoolId, roleType: 'staff', roleRefId: staffId, pin: pinNum, deviceSn: sn,
          source: 'provision_staff', enrolledBy: session.userId,
        });
        if (up.ok) summary.mappedFresh++;
      }
      // Re-own the enrollment so it points at the new staff; mark done.
      enrollByPin.delete(pinNum);
    }

    // ── Pass 2: unmap EVERY remaining student enrollment (school-wide) ─
    const remainingStudents = (await query(
      `SELECT id FROM biometric_enrollments
        WHERE school_id = ? AND role_type = 'student'
          AND status IN ('active','pending_capture','suspended')`,
      [schoolId],
    )) as Array<{ id: number }>;
    summary.unmappedRemainingStudents = remainingStudents.length;
    if (!dryRun) {
      for (const s of remainingStudents) {
        await unmapEnrollment({ schoolId, enrollmentId: s.id, reason: 'JIPRA: no students — student mappings cleared', actorUserId: session.userId });
      }
    }

    if (!dryRun) {
      await auditDirectoryAction(schoolId, sn, null, 'provision-staff', session.userId, summary as any);
    }

    return NextResponse.json({
      success: true,
      dry_run: dryRun,
      device_sn: sn,
      device_user_count: directory.length,
      summary,
      plan: plan.slice(0, 500),
      message: dryRun
        ? `Preview: ${plan.filter(p => p.action.startsWith('reassign') || p.action.startsWith('create')).length} device users → staff, ${summary.skippedBlank} skipped (blank), ${summary.alreadyStaff} already staff. ${summary.unmappedRemainingStudents} student mapping(s) would be unmapped. Nothing written yet.`
        : `Done. ${summary.converted + summary.mappedFresh} device users are now staff (${summary.createdStaff} staff created); ${summary.unmappedRemainingStudents} student mapping(s) unmapped; ${summary.skippedBlank} skipped. Fingerprints on the device were reused — no re-scan needed.`,
    });
  } catch (err: any) {
    console.error('[provision-staff]', err);
    return NextResponse.json({ error: err.message || 'Provisioning failed' }, { status: 500 });
  }
}
