/**
 * GET /api/attendance/devices/[sn]/activity
 *
 * Phase 3G Tabs 6 + 7 — device command queue + directory audit log.
 * One round-trip powers both panels.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { resolveDeviceForSession } from '@/lib/biometric/device-access';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  const access = await resolveDeviceForSession(session, id);
  const sn = access.device?.sn ?? id;
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });

  try {
    const commands = await query(
      `SELECT id, command, status, priority, retry_count, max_retries,
              sent_at, ack_at, error_message, created_at
         FROM zk_device_commands
        WHERE device_sn = ?
        ORDER BY id DESC LIMIT 50`,
      [sn],
    );
    const audit = await query(
      `SELECT id, device_user_pin, action, actor_user_id, detail_json, created_at
         FROM device_directory_audit
        WHERE device_sn = ?
        ORDER BY id DESC LIMIT 50`,
      [sn],
    ).catch(() => []);
    return NextResponse.json({ success: true, commands: commands || [], audit: audit || [] });
  } catch (err: any) {
    console.error('[device activity GET]', err);
    return NextResponse.json({ error: 'Failed to load activity' }, { status: 500 });
  }
}
