/**
 * POST /api/attendance/devices/[sn]/push-missing
 *
 * Phase 3E/3J — queue DRAIS people onto a device. Accepts a list of
 * canonical enrollment ids (the "missing from device" rows from the
 * reconciliation report). For each, queues a DATA UPDATE USERINFO
 * command so the device registers the user, stamps capture_status =
 * command_queued, and refreshes the device_user_directory intent.
 *
 * Bulk-safe: a `preview: true` body returns what WOULD be queued
 * (counts, conflicts, skips) without writing.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import { captureDeviceUserDirectory } from '@/lib/biometric/device-directory';
import { setCaptureStatusByPin } from '@/lib/biometric/enrollment-service';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';

export const runtime = 'nodejs';

function zkSafeName(name: string): string {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '').replace(/[\t\r\n]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, 24) || 'Unknown';
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const schoolId = access.schoolId;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const enrollmentIds: number[] = Array.isArray(body?.enrollment_ids) ? body.enrollment_ids.map(Number).filter(Boolean) : [];
  const preview = body?.preview === true;
  if (enrollmentIds.length === 0) {
    return NextResponse.json({ error: 'enrollment_ids[] required' }, { status: 400 });
  }

  try {
    const rows = (await query(
      `SELECT be.id, be.pin_value, be.person_id, be.role_type,
              TRIM(CONCAT_WS(' ', p.first_name, p.last_name)) AS name
         FROM biometric_enrollments be
         LEFT JOIN people p ON p.id = be.person_id
        WHERE be.school_id = ? AND be.id IN (${enrollmentIds.map(() => '?').join(',')})
          AND be.status IN ('active','pending_capture')`,
      [schoolId, ...enrollmentIds],
    )) as Array<{ id: number; pin_value: number; person_id: number; role_type: string; name: string | null }>;

    const toQueue: typeof rows = [];
    const skipped: Array<{ id: number; reason: string }> = [];
    for (const r of rows) {
      if (!r.name) { skipped.push({ id: r.id, reason: 'no name' }); continue; }
      toQueue.push(r);
    }

    if (preview) {
      return NextResponse.json({
        success: true, preview: true,
        will_queue: toQueue.length, skipped: skipped.length, skips: skipped,
        commands: toQueue.map(r => ({ pin: r.pin_value, name: zkSafeName(r.name!), role: r.role_type })),
      });
    }

    let queued = 0;
    for (const r of toQueue) {
      const safeName = zkSafeName(r.name!);
      const cmd = `DATA UPDATE USERINFO PIN=${r.pin_value}\tName=${safeName}\tPri=0\tPasswd=\tCard=\tGrp=0\tTZ=0000000100000000`;
      // Dedup pending command for this PIN.
      const existing = await query(
        `SELECT id FROM zk_device_commands WHERE device_sn = ? AND command LIKE ? AND status IN ('pending','sent') LIMIT 1`,
        [sn, `DATA UPDATE USERINFO PIN=${r.pin_value}\t%`],
      );
      if (!existing || existing.length === 0) {
        await query(
          `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
           VALUES (?, ?, ?, 5, 5, DATE_ADD(NOW(), INTERVAL 24 HOUR), ?)`,
          [schoolId, sn, cmd, session.userId],
        );
      }
      await setCaptureStatusByPin(schoolId, Number(r.pin_value), 'command_queued');
      await captureDeviceUserDirectory(sn, String(r.pin_value), safeName, schoolId);
      queued++;
    }

    await auditDirectoryAction(schoolId, sn, null, 'push-missing', session.userId,
      { queued, skipped: skipped.length, enrollment_ids: enrollmentIds });

    return NextResponse.json({
      success: true, queued, skipped: skipped.length,
      message: `Queued ${queued} ${queued === 1 ? 'person' : 'people'} to device. They register on the next heartbeat; fingerprint capture still happens at the device.`,
    });
  } catch (err: any) {
    console.error('[push-missing POST]', err);
    return NextResponse.json({ error: err.message || 'Failed to queue' }, { status: 500 });
  }
}
