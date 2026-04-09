import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/commands
 * List device commands with filters.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const deviceSn = url.searchParams.get('device_sn');
  const status = url.searchParams.get('status');
  const page = Math.max(1, parseInt(url.searchParams.get('page', 10) || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit', 10) || '50', 10)));
  const offset = (page - 1) * limit;

  try {
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (deviceSn) {
      conditions.push('c.device_sn = ?');
      params.push(deviceSn);
    }
    if (status) {
      conditions.push('c.status = ?');
      params.push(status);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) AS total FROM zk_device_commands c WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.total || 0);

    const rows = await query(
      `SELECT
         c.id, c.device_sn, c.command, c.status, c.priority,
         c.sent_at, c.ack_at, c.retry_count, c.max_retries,
         c.error_message, c.created_by, c.created_at, c.expires_at,
         d.device_name, d.location AS device_location
       FROM zk_device_commands c
       LEFT JOIN devices d ON c.device_sn = d.sn
       WHERE ${where}
       ORDER BY c.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('[ZK Commands GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load commands' }, { status: 500 });
  }
}

/**
 * POST /api/attendance/zk/commands
 * Queue a new command for a device.
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { device_sn, command, priority, expires_in_hours } = body;

    if (!device_sn || !command) {
      return NextResponse.json(
        { error: 'device_sn and command are required' },
        { status: 400 },
      );
    }

    // Validate command format (basic safety check)
    const commandStr = String(command).trim();
    if (commandStr.length > 2000) {
      return NextResponse.json({ error: 'Command too long (max 2000 chars)' }, { status: 400 });
    }

    // Verify device exists (devices are school-agnostic)
    const device = await query(
      'SELECT id FROM devices WHERE sn = ? AND deleted_at IS NULL',
      [device_sn],
    );
    if (!device || device.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    const expiresAt = expires_in_hours
      ? new Date(Date.now() + expires_in_hours * 3600000).toISOString().slice(0, 19).replace('T', ' ')
      : null;

    const result = await query(
      `INSERT INTO zk_device_commands (school_id, device_sn, command, priority, expires_at, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [session.schoolId, device_sn, commandStr, priority || 0, expiresAt, session.userId],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.CREATED_STAFF, // closest
      entityType: 'zk_command',
      entityId: (result as any)?.insertId || 0,
      details: { device_sn, command: commandStr.substring(0, 100), priority },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({
      success: true,
      message: 'Command queued',
      id: (result as any)?.insertId,
    });
  } catch (err) {
    console.error('[ZK Commands POST] Error:', err);
    return NextResponse.json({ error: 'Failed to queue command' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/zk/commands
 * Cancel a pending command.
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Command ID required' }, { status: 400 });
  }

  try {
    const existing = await query(
      'SELECT id, status FROM zk_device_commands WHERE id = ?',
      [id],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Command not found' }, { status: 404 });
    }
    if (existing[0].status !== 'pending') {
      return NextResponse.json(
        { error: `Cannot cancel command with status "${existing[0].status}"` },
        { status: 400 },
      );
    }

    await query(
      `UPDATE zk_device_commands SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [id],
    );

    return NextResponse.json({ success: true, message: 'Command cancelled' });
  } catch (err) {
    console.error('[ZK Commands DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to cancel command' }, { status: 500 });
  }
}
