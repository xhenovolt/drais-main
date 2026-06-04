/**
 * PATCH /api/admin/device-alerts/[id]/ack
 *
 * Acknowledge an alert. Stamps acknowledged_at + acknowledged_by,
 * writes a DEVICE_ALERT_ACKNOWLEDGED audit_logs row (the Phase 2
 * AuditAction the enum already declares).
 *
 * Idempotent: re-acking an already-acked alert is a no-op (200 OK
 * with updated=0).
 *
 * Auth: ownership-guarded against alert.school_id. NULL school_id
 * (cross-tenant alerts) require super-admin.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { query } from '@/lib/db';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const { id: idRaw } = await ctx.params;
  const id = Number(idRaw);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const rows = (await query(
    `SELECT id, school_id, device_sn, code, severity, acknowledged_at
       FROM device_alerts WHERE id = ? LIMIT 1`,
    [id],
  )) as Array<{
    id: number; school_id: number | null;
    device_sn: string; code: string; severity: string;
    acknowledged_at: string | null;
  }>;
  if (rows.length === 0) {
    return NextResponse.json({ error: 'Alert not found' }, { status: 404 });
  }
  const alert = rows[0];

  if (alert.school_id === null && !session.isSuperAdmin) {
    return NextResponse.json(
      { error: 'Cross-tenant alerts require super-admin' },
      { status: 403 },
    );
  }
  if (alert.school_id !== null && alert.school_id !== session.schoolId && !session.isSuperAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (alert.acknowledged_at) {
    return NextResponse.json({ success: true, updated: 0, alreadyAcked: true });
  }

  const result = (await query(
    `UPDATE device_alerts
        SET acknowledged_at = CURRENT_TIMESTAMP,
            acknowledged_by = ?
      WHERE id = ?
        AND acknowledged_at IS NULL`,
    [session.userId, id],
  )) as { affectedRows?: number };

  if (Number(result?.affectedRows ?? 0) > 0) {
    await logAudit({
      schoolId: alert.school_id ?? session.schoolId,
      userId: session.userId,
      action: AuditAction.DEVICE_ALERT_ACKNOWLEDGED,
      entityType: 'device_alert',
      entityId: String(id),
      details: {
        alertId: id,
        deviceSn: alert.device_sn,
        code: alert.code,
        severity: alert.severity,
      },
      ip: req.headers.get('x-forwarded-for') ?? null,
      userAgent: req.headers.get('user-agent') ?? null,
    });
  }

  return NextResponse.json({
    success: true,
    updated: Number(result?.affectedRows ?? 0),
  });
}
