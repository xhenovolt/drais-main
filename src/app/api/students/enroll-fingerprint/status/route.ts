import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

/**
 * GET /api/students/enroll-fingerprint/status?command_id=123
 *
 * Polls the status of an ENROLL command.
 * Used by the "Waiting Room" UI to show real-time progress.
 *
 * Returns:
 *   - pending:      Command queued, waiting for device heartbeat
 *   - sent:         Device fetched the command — finger capture mode active
 *   - acknowledged: Device confirmed enrollment success
 *   - expired:      Command timed out
 *   - failed:       Command failed
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const commandId = url.searchParams.get('command_id');

  if (!commandId) {
    return NextResponse.json({ error: 'command_id is required' }, { status: 400 });
  }

  try {
    const rows = await query(
      `SELECT
         c.id, c.status, c.command, c.device_sn, c.sent_at, c.ack_at,
         c.error_message, c.created_at, c.expires_at,
         d.device_name
       FROM zk_device_commands c
       LEFT JOIN devices d ON c.device_sn = d.sn
       WHERE c.id = ?
       LIMIT 1`,
      [commandId],
    );

    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }

    const cmd = rows[0];

    return NextResponse.json({
      success: true,
      data: {
        id: cmd.id,
        status: cmd.status,
        device_sn: cmd.device_sn,
        device_name: cmd.device_name,
        sent_at: cmd.sent_at,
        ack_at: cmd.ack_at,
        error_message: cmd.error_message,
        created_at: cmd.created_at,
        expires_at: cmd.expires_at,
      },
    });
  } catch (err: any) {
    console.error('[enroll-status] Error:', err);
    return NextResponse.json({ error: 'Failed to check command status' }, { status: 500 });
  }
}
