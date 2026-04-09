/**
 * POST /api/attendance/zk/devices/actions
 *
 * Unified device action dispatcher.
 * All ADMS commands go through this endpoint.
 *
 * Supported actions:
 *   - delete_user   → DATA DELETE USER PIN=X
 *   - clear_users   → CLEAR DATA USER
 *   - restart       → C:REBOOT
 *   - clear_logs    → C:CLEAR LOG
 *   - get_info      → C:INFO
 *   - sync_time     → C:SETTIME {timestamp}
 *
 * Body: { device_sn: string, action: string, params?: { pin?: string } }
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

// Action definitions: command template, priority, retries, expiry hours
const ACTIONS: Record<string, {
  buildCommand: (params?: Record<string, string>) => string | null;
  priority: number;
  maxRetries: number;
  expiresInHours: number;
  requiresParam?: string;
  confirmRequired?: boolean;
  label: string;
}> = {
  delete_user: {
    label: 'Delete User from Device',
    buildCommand: (p) => p?.pin ? `DATA DELETE USER PIN=${p.pin}` : null,
    priority: 15,
    maxRetries: 3,
    expiresInHours: 1,
    requiresParam: 'pin',
  },
  clear_users: {
    label: 'Clear All Users',
    buildCommand: () => 'CLEAR DATA USER',
    priority: 100,
    maxRetries: 1,
    expiresInHours: 1,
    confirmRequired: true,
  },
  restart: {
    label: 'Restart Device',
    buildCommand: () => 'C:REBOOT',
    priority: 50,
    maxRetries: 1,
    expiresInHours: 0.5,
  },
  clear_logs: {
    label: 'Clear Attendance Logs',
    buildCommand: () => 'C:CLEAR LOG',
    priority: 20,
    maxRetries: 2,
    expiresInHours: 1,
  },
  get_info: {
    label: 'Get Device Info',
    buildCommand: () => 'C:INFO',
    priority: 10,
    maxRetries: 3,
    expiresInHours: 0.5,
  },
  sync_time: {
    label: 'Sync Device Time',
    buildCommand: () => {
      const now = new Date();
      const ts = now.getFullYear() + '-'
        + String(now.getMonth() + 1).padStart(2, '0') + '-'
        + String(now.getDate()).padStart(2, '0') + ' '
        + String(now.getHours()).padStart(2, '0') + ':'
        + String(now.getMinutes()).padStart(2, '0') + ':'
        + String(now.getSeconds()).padStart(2, '0');
      return `C:SET TIME ${ts}`;
    },
    priority: 30,
    maxRetries: 2,
    expiresInHours: 0.5,
  },
};

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: { device_sn?: string; action?: string; params?: Record<string, string> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { device_sn, action, params } = body;

  if (!device_sn || !action) {
    return NextResponse.json({ error: 'device_sn and action are required' }, { status: 400 });
  }

  // Validate action
  const actionDef = ACTIONS[action];
  if (!actionDef) {
    return NextResponse.json(
      { error: `Unknown action: ${action}. Valid: ${Object.keys(ACTIONS).join(', ')}` },
      { status: 400 },
    );
  }

  // Check required params
  if (actionDef.requiresParam && !params?.[actionDef.requiresParam]) {
    return NextResponse.json(
      { error: `Action "${action}" requires param: ${actionDef.requiresParam}` },
      { status: 400 },
    );
  }

  try {
    // Verify device exists and check online status
    const device = await query(
      `SELECT id, sn, school_id, is_online, last_seen,
              TIMESTAMPDIFF(SECOND, last_seen, NOW()) AS seconds_ago
       FROM devices
       WHERE sn = ? AND deleted_at IS NULL`,
      [device_sn],
    );

    if (!device || device.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const dev = device[0];
    const isOnline = dev.seconds_ago !== null && dev.seconds_ago <= 120;

    if (!isOnline) {
      return NextResponse.json(
        {
          error: 'Device is offline',
          message: `Device has not sent a heartbeat in ${dev.seconds_ago ? Math.floor(dev.seconds_ago / 60) + ' minutes' : 'unknown time'}. Command cannot be delivered.`,
          offline: true,
        },
        { status: 409 },
      );
    }

    // Build the command string
    const commandStr = actionDef.buildCommand(params);
    if (!commandStr) {
      return NextResponse.json({ error: 'Failed to build command — missing parameters' }, { status: 400 });
    }

    const schoolId = dev.school_id || session.schoolId;
    const expiresAt = new Date(Date.now() + actionDef.expiresInHours * 3600000)
      .toISOString().slice(0, 19).replace('T', ' ');

    // Queue the command
    const result = await query(
      `INSERT INTO zk_device_commands
         (school_id, device_sn, command, priority, max_retries, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, device_sn, commandStr, actionDef.priority, actionDef.maxRetries, expiresAt, session.userId],
    );

    const commandId = (result as any)?.insertId || 0;

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.CREATED_STAFF,
      entityType: 'device_action',
      entityId: commandId,
      details: { device_sn, action, command: commandStr, params },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({
      success: true,
      message: `${actionDef.label} queued — will execute on next heartbeat (~60s)`,
      command_id: commandId,
      action,
      command: commandStr,
    });
  } catch (err) {
    console.error('[Device Action] Error:', err);
    return NextResponse.json({ error: 'Failed to queue action' }, { status: 500 });
  }
}
