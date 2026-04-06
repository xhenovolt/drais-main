import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

/**
 * relay-status API
 *
 * The relay agent connects via WebSocket (handled by custom server or
 * a separate WS process). This REST endpoint provides status and
 * a way to queue commands that the relay will pick up.
 *
 * Architecture:
 *   Browser → POST /api/relay-status (queue command)
 *   Relay Agent → polls GET /api/relay-status?poll=1 (fetch pending commands)
 *   Relay Agent → POST /api/relay-status (report results)
 *
 * This HTTP-polling approach works with Next.js serverless (no WebSocket needed).
 * The relay agent polls every 2s for pending commands.
 */

/**
 * GET /api/relay-status
 *
 * ?poll=1&device_sn=xxx&relay_key=xxx  → Relay agent polling for pending commands
 * ?device_sn=xxx                       → UI checking relay + command status
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const poll = url.searchParams.get('poll');
  const deviceSn = url.searchParams.get('device_sn');
  const relayKey = url.searchParams.get('relay_key');

  // ── Relay Agent Poll Mode ───────────────────────────────────────────────
  if (poll === '1' && deviceSn && relayKey) {
    // Validate relay key
    const validKey = process.env.RELAY_KEY || 'DRAIS-355DF9C35EB60899009C01DD948EAD14';
    if (relayKey !== validKey) {
      return NextResponse.json({ error: 'Invalid relay key' }, { status: 403 });
    }

    // Update relay heartbeat
    await query(
      `INSERT INTO relay_agents (device_sn, last_seen, status)
       VALUES (?, NOW(), 'online')
       ON DUPLICATE KEY UPDATE last_seen = NOW(), status = 'online'`,
      [deviceSn],
    ).catch(() => {});

    // Fetch pending relay commands
    const pending = await query(
      `SELECT id, action, params, created_at
       FROM relay_commands
       WHERE device_sn = ? AND status = 'pending'
       ORDER BY created_at ASC
       LIMIT 5`,
      [deviceSn],
    );

    // Mark as sent
    if (pending?.length) {
      const ids = pending.map((r: any) => r.id);
      await query(
        `UPDATE relay_commands SET status = 'sent', sent_at = NOW()
         WHERE id IN (${ids.map(() => '?').join(',')})`,
        ids,
      );
    }

    return NextResponse.json({
      commands: (pending || []).map((r: any) => ({
        id: r.id,
        action: r.action,
        params: typeof r.params === 'string' ? JSON.parse(r.params) : r.params,
      })),
    });
  }

  // ── UI Status Check ─────────────────────────────────────────────────────
  // Check relay agent status and recent command results
  let relayStatus = null;
  if (deviceSn) {
    const rows = await query(
      `SELECT device_sn, last_seen, status,
              TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago
       FROM relay_agents WHERE device_sn = ? LIMIT 1`,
      [deviceSn],
    ).catch(() => null);
    relayStatus = rows?.[0] || null;
  }

  let recentResults: any[] = [];
  if (deviceSn) {
    recentResults = await query(
      `SELECT id, action, status, result, error_message, created_at, completed_at
       FROM relay_commands
       WHERE device_sn = ?
       ORDER BY created_at DESC
       LIMIT 20`,
      [deviceSn],
    ).catch(() => []) || [];
  }

  return NextResponse.json({
    relayStatus,
    relayOnline: relayStatus && relayStatus.seconds_ago != null && relayStatus.seconds_ago < 15,
    recentResults,
  });
}

/**
 * POST /api/relay-status
 *
 * From UI: { device_sn, action, params } → Queue command for relay
 * From Relay: { relay_key, device_sn, results: [{ id, success, data, error }] } → Report results
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // ── Relay Agent Reporting Results ───────────────────────────────────────
  if (body.relay_key && body.results) {
    const validKey = process.env.RELAY_KEY || 'DRAIS-355DF9C35EB60899009C01DD948EAD14';
    if (body.relay_key !== validKey) {
      return NextResponse.json({ error: 'Invalid relay key' }, { status: 403 });
    }

    for (const r of body.results) {
      await query(
        `UPDATE relay_commands
         SET status = ?, result = ?, error_message = ?, completed_at = NOW()
         WHERE id = ?`,
        [
          r.success ? 'completed' : 'failed',
          r.data ? JSON.stringify(r.data) : null,
          r.error || null,
          r.id,
        ],
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, processed: body.results.length });
  }

  // ── Relay Agent User Sync — remove phantom zk_user_mapping entries ──────
  // Relay sends this on connect and periodically with the live device user list.
  // Any mapping for this device whose UID is no longer on the device is deleted.
  // Users with empty names are flagged as "unlinked" and returned so the agent can log them.
  if (body.relay_key && body.user_sync !== undefined) {
    const validKey = process.env.RELAY_KEY || 'DRAIS-355DF9C35EB60899009C01DD948EAD14';
    if (body.relay_key !== validKey) {
      return NextResponse.json({ error: 'Invalid relay key' }, { status: 403 });
    }

    const deviceSn: string = body.device_sn;
    const deviceUsers: Array<{ uid: number; name?: string; userId?: string }> = body.user_sync;

    // Safety: never delete everything when device returns empty (could be a read error)
    if (!deviceSn || deviceUsers.length === 0) {
      return NextResponse.json({ success: true, deleted: 0, broken: [], note: 'skipped — empty list' });
    }

    const liveUids = deviceUsers.map((u) => String(u.uid));
    const placeholders = liveUids.map(() => '?').join(',');
    const deleteResult = await query(
      `DELETE FROM zk_user_mapping
       WHERE device_sn = ? AND CAST(device_user_id AS UNSIGNED) NOT IN (${placeholders})`,
      [deviceSn, ...liveUids],
    ).catch(() => null);

    const deleted = (deleteResult as any)?.affectedRows ?? 0;
    if (deleted > 0) {
      console.log(`[relay-status] Removed ${deleted} phantom zk_user_mapping entries for device ${deviceSn}`);
    }

    // ── Detect broken users: on device but have no name (anonymous fingerprint) ──
    // These are slots that were enrolled without identity binding.
    // Also cross-check UIDs that exist on device but have no mapping in the DB.
    const emptyNameUsers = deviceUsers.filter(u => !u.name || u.name.trim() === '');

    let unlinkedUids: number[] = [];
    if (liveUids.length > 0) {
      const mappedRows = await query(
        `SELECT CAST(device_user_id AS UNSIGNED) AS uid FROM zk_user_mapping
         WHERE device_sn = ? AND CAST(device_user_id AS UNSIGNED) IN (${placeholders})`,
        [deviceSn, ...liveUids],
      ).catch(() => []) as Array<{ uid: number }>;
      const mappedUidSet = new Set((mappedRows || []).map(r => Number(r.uid)));
      unlinkedUids = deviceUsers
        .map(u => u.uid)
        .filter(uid => !mappedUidSet.has(uid));
    }

    const broken = [
      ...emptyNameUsers.map(u => ({ uid: u.uid, reason: 'empty_name' })),
      ...unlinkedUids
        .filter(uid => !emptyNameUsers.some(u => u.uid === uid))
        .map(uid => ({ uid, reason: 'unmapped' })),
    ];

    if (broken.length > 0) {
      console.warn(`[relay-status] Device ${deviceSn}: ${broken.length} broken user(s) detected:`,
        broken.map(b => `uid=${b.uid}(${b.reason})`).join(', '));
    }

    return NextResponse.json({ success: true, synced: deviceUsers.length, deleted, broken });
  }

  // ── UI Queuing Command ─────────────────────────────────────────────────
  const { device_sn, action, params } = body;
  if (!device_sn || !action) {
    return NextResponse.json({ error: 'device_sn and action are required' }, { status: 400 });
  }

  const result = await query(
    `INSERT INTO relay_commands (device_sn, action, params, status, created_at)
     VALUES (?, ?, ?, 'pending', NOW())`,
    [device_sn, action, params ? JSON.stringify(params) : null],
  );

  return NextResponse.json({
    success: true,
    commandId: (result as any)?.insertId,
    message: `Command "${action}" queued for relay agent`,
  });
}
