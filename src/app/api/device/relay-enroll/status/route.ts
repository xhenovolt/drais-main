/**
 * GET /api/device/relay-enroll/status?command_id=xxx
 * ──────────────────────────────────────────────────
 * Polls the status of a relay_command queued by /api/device/relay-enroll.
 *
 * Status lifecycle:
 *   pending   → queued, waiting for relay agent to pick up
 *   sent      → relay agent executing CMD_STARTENROLL on device
 *   completed → device acknowledged — now in finger scan mode
 *   failed    → relay agent reported an error
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const commandId = new URL(req.url).searchParams.get('command_id');
  if (!commandId) {
    return NextResponse.json({ error: 'command_id is required' }, { status: 400 });
  }

  const rows = await query(
    `SELECT id, device_sn, action, params, status, result, error_message,
            created_at, sent_at, completed_at
     FROM relay_commands WHERE id = ? LIMIT 1`,
    [commandId],
  );

  if (!rows?.length) {
    return NextResponse.json({ error: 'Command not found' }, { status: 404 });
  }

  const cmd = rows[0];

  // Also check if relay agent is currently online for this device
  const agentRows = await query(
    `SELECT TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS sec_ago
     FROM relay_agents WHERE device_sn = ? LIMIT 1`,
    [cmd.device_sn],
  ).catch(() => null);
  const secAgo = agentRows?.[0]?.sec_ago;
  const relayOnline = secAgo != null && Number(secAgo) < 60;

  return NextResponse.json({
    success: true,
    data: {
      id: cmd.id,
      device_sn: cmd.device_sn,
      action: cmd.action,
      status: cmd.status,
      result: typeof cmd.result === 'string' ? JSON.parse(cmd.result).catch?.() ?? cmd.result : cmd.result,
      error_message: cmd.error_message,
      created_at: cmd.created_at,
      sent_at: cmd.sent_at,
      completed_at: cmd.completed_at,
      relay_online: relayOnline,
    },
  });
}
