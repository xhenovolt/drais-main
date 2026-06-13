/**
 * POST /api/attendance/devices/[sn]/sync-directory
 *
 * Phase 3B — queue a device inventory request so the K40 pushes its
 * current users (DATA QUERY USERINFO). The zk-handler's processUserInfo
 * writes every returned user into device_user_directory and stamps the
 * sync-run linkage. A device_reconciliation_runs row is opened so the
 * UI can show "sync in progress".
 *
 * GET → status of the latest inventory sync for this device.
 *
 * LIMITATION (surfaced honestly to the UI): the K40 ADMS push protocol
 * does not guarantee a full user dump — many firmwares only echo users
 * that were pushed/updated. directory_is_partial is therefore always
 * true; the UI must label the directory "partial — full inventory not
 * confirmed".
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';
import { auditDirectoryAction } from '@/lib/biometric/reconciliation-service';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    // Dedup: existing pending/sent inventory command?
    const existing = await query(
      `SELECT id, status FROM zk_device_commands
        WHERE device_sn = ? AND command = 'DATA QUERY USERINFO' AND status IN ('pending','sent')
        LIMIT 1`,
      [sn],
    );
    let commandId: number;
    if (existing && existing.length > 0) {
      commandId = existing[0].id;
    } else {
      const result = await query(
        `INSERT INTO zk_device_commands
           (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
         VALUES (?, ?, 'DATA QUERY USERINFO', 10, 3, DATE_ADD(NOW(), INTERVAL 1 HOUR), ?)`,
        [access.schoolId, sn, session.userId],
      );
      commandId = (result as any)?.insertId;
    }

    // Open a reconciliation run marker (running) so the UI shows progress.
    const run = await query(
      `INSERT INTO device_reconciliation_runs
         (school_id, device_sn, status, trigger_source, requested_by, directory_is_partial)
       VALUES (?, ?, 'running', 'sync-directory', ?, 1)`,
      [access.schoolId, sn, session.userId],
    );
    const runId = (run as any)?.insertId;

    await auditDirectoryAction(access.schoolId, sn, null, 'sync_directory_queued', session.userId, { commandId, runId });

    return NextResponse.json({
      success: true,
      command_id: commandId,
      run_id: runId,
      directory_is_partial: true,
      message: 'Inventory sync queued — the device will push its users on the next heartbeat. Note: K40 inventory is partial (firmware only echoes pushed/updated users).',
    });
  } catch (err: any) {
    console.error('[sync-directory POST]', err);
    return NextResponse.json({ error: 'Failed to queue inventory sync' }, { status: 500 });
  }
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const cmd = await query(
      `SELECT id, status, sent_at, ack_at, retry_count, created_at
         FROM zk_device_commands
        WHERE device_sn = ? AND command = 'DATA QUERY USERINFO'
        ORDER BY id DESC LIMIT 1`,
      [sn],
    );
    const dirCount = await query(
      `SELECT COUNT(*) AS n FROM device_user_directory WHERE device_sn = ? AND (school_id = ? OR school_id IS NULL)`,
      [sn, access.schoolId],
    );
    return NextResponse.json({
      success: true,
      sync_status: cmd?.[0]?.status ?? 'idle',
      command: cmd?.[0] ?? null,
      directory_count: Number(dirCount?.[0]?.n ?? 0),
      directory_is_partial: true,
    });
  } catch (err: any) {
    console.error('[sync-directory GET]', err);
    return NextResponse.json({ error: 'Failed to read sync status' }, { status: 500 });
  }
}
