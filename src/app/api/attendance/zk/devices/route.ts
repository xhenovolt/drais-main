import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * GET /api/attendance/zk/devices
 * List all ZK devices with status and stats.
 */
export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const devices = await query(
      `SELECT
         d.id, d.sn AS serial_number, d.device_name, d.model_name AS model, d.firmware_version,
         d.location, d.ip_address, d.status, d.push_version, d.school_id, d.role_label,
         d.last_seen AS last_heartbeat, d.last_activity, d.created_at AS registered_at,
         CASE
           WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
           WHEN d.last_seen > DATE_SUB(NOW(), INTERVAL 5 MINUTE) THEN 'delayed'
           ELSE 'offline'
         END AS connection_status,
         (SELECT COUNT(*) FROM zk_attendance_logs al
          WHERE al.device_sn = d.sn AND DATE(al.check_time) = CURDATE()) AS today_punches,
         (SELECT COUNT(*) FROM zk_device_commands c
          WHERE c.device_sn = d.sn AND c.status = 'pending') AS pending_commands,
         d.device_user_count        AS device_user_count,
         d.device_user_count_at     AS device_user_count_at,
         d.device_user_count_source AS device_user_count_source,
         d.lan_ip                   AS lan_ip,
         -- DEVICE-CONFIRMED count: from the latest COMPLETED inventory
         -- poll (the device's own answer), NOT any DRAIS-side table.
         (SELECT r.users_returned_count FROM device_inventory_runs r
           WHERE r.device_sn = d.sn AND r.status = 'completed'
           ORDER BY r.id DESC LIMIT 1) AS device_confirmed_users,
         (SELECT r.completed_at FROM device_inventory_runs r
           WHERE r.device_sn = d.sn AND r.status = 'completed'
           ORDER BY r.id DESC LIMIT 1) AS inventory_synced_at,
         -- Latest run status (any) drives the inventory badge.
         (SELECT r.status FROM device_inventory_runs r
           WHERE r.device_sn = d.sn ORDER BY r.id DESC LIMIT 1) AS inventory_status,
         (SELECT r.method FROM device_inventory_runs r
           WHERE r.device_sn = d.sn ORDER BY r.id DESC LIMIT 1) AS inventory_method,
         -- DRAIS-side expectation: active canonical enrollments for THIS
         -- device school (school-scoped — no legacy NULL-mapping bleed).
         (SELECT COUNT(*) FROM biometric_enrollments be
           WHERE be.school_id = d.school_id
             AND be.status IN ('active','pending_capture')) AS mapped_users,
         -- Template deployment readiness (Phase 4 — devices as deployment
         -- targets): how many of this school's stored fingerprint
         -- templates are actually loaded on THIS device vs. how many
         -- should be. Reuses template_distributions (Phase 5's Push
         -- Templates feature) rather than a separate counter.
         (SELECT COUNT(*) FROM biometric_templates bt
           JOIN biometric_enrollments be2 ON be2.id = bt.enrollment_id
          WHERE be2.school_id = d.school_id
            AND be2.status IN ('active','pending_capture')) AS templates_total,
         (SELECT COUNT(*) FROM template_distributions td
           JOIN biometric_templates bt2 ON bt2.id = td.template_id
           JOIN biometric_enrollments be3 ON be3.id = bt2.enrollment_id
          WHERE be3.school_id = d.school_id AND td.device_sn = d.sn
            AND td.status = 'loaded') AS templates_loaded,
         (SELECT COUNT(*) FROM template_distributions td
           JOIN biometric_templates bt3 ON bt3.id = td.template_id
           JOIN biometric_enrollments be4 ON be4.id = bt3.enrollment_id
          WHERE be4.school_id = d.school_id AND td.device_sn = d.sn
            AND td.status = 'failed') AS templates_failed,
         ss.sync_status
       FROM devices d
       LEFT JOIN device_sync_state ss ON ss.device_sn = d.sn
       WHERE d.deleted_at IS NULL AND d.school_id = ?
       ORDER BY d.last_seen DESC`,
      [session.schoolId],
    );

    // Staleness flag (default 24h) computed in JS so the UI gets a clear
    // boolean without trusting a possibly-old count.
    const STALE_MS = 24 * 60 * 60 * 1000;
    for (const dv of devices as any[]) {
      dv.inventory_is_stale = dv.inventory_synced_at
        ? (Date.now() - new Date(dv.inventory_synced_at).getTime()) > STALE_MS
        : null;
      // never_synced when no run exists at all.
      if (!dv.inventory_status) dv.inventory_status = 'never_synced';

      // Template synchronization status: 'attention' if anything failed,
      // 'syncing' if some templates are still queued, else 'healthy'
      // (including the trivial case of nothing to deploy at all).
      const failed = Number(dv.templates_failed || 0);
      const loaded = Number(dv.templates_loaded || 0);
      const total = Number(dv.templates_total || 0);
      dv.template_sync_status = failed > 0 ? 'attention' : loaded < total ? 'syncing' : 'healthy';
    }

    // Fallback: if no registered devices, discover from recent ADMS traffic —
    // scoped to THIS school's logs only (never any other tenant's devices).
    let discovered: any[] = [];
    if (devices.length === 0) {
      discovered = await query(
        `SELECT
           device_sn AS serial_number,
           MAX(check_time) AS last_heartbeat,
           COUNT(*) AS today_punches,
           'discovered' AS status,
           CASE
             WHEN MAX(check_time) > DATE_SUB(NOW(), INTERVAL 2 MINUTE) THEN 'online'
             ELSE 'offline'
           END AS connection_status
         FROM zk_attendance_logs
         WHERE check_time > DATE_SUB(NOW(), INTERVAL 7 DAY) AND school_id = ?
         GROUP BY device_sn
         ORDER BY last_heartbeat DESC`,
        [session.schoolId],
      );
    }

    // Debug: last heartbeat info — scoped to this school's own devices.
    const lastHeartbeat = await query(
      `SELECT h.sn, h.ip, h.push_version, h.created_at
       FROM device_heartbeats h
       JOIN devices d ON d.sn = h.sn AND d.school_id = ?
       ORDER BY h.created_at DESC LIMIT 5`,
      [session.schoolId],
    );

    return NextResponse.json({ success: true, data: devices, discovered, debug: { lastHeartbeats: lastHeartbeat } });
  } catch (err) {
    console.error('[ZK Devices GET] Error:', err);
    return NextResponse.json({ error: 'Failed to load devices' }, { status: 500 });
  }
}

/**
 * PUT /api/attendance/zk/devices
 * Update device metadata (name, location, model, status).
 */
export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { id, device_name, location, model, status, role_label } = body;

    if (!id) {
      return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Verify device exists AND belongs to this school (tenant isolation).
    const existing = await query(
      'SELECT id FROM devices WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await query(
      `UPDATE devices SET
         device_name = COALESCE(?, device_name),
         location = COALESCE(?, location),
         model_name = COALESCE(?, model_name),
         status = COALESCE(?, status),
         role_label = COALESCE(?, role_label),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND school_id = ?`,
      [device_name || null, location || null, model || null, status || null, role_label || null, id, session.schoolId],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.UPDATED_STAFF, // closest available
      entityType: 'device',
      entityId: id,
      details: { device_name, location, model, status, role_label },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({ success: true, message: 'Device updated' });
  } catch (err) {
    console.error('[ZK Devices PUT] Error:', err);
    return NextResponse.json({ error: 'Failed to update device' }, { status: 500 });
  }
}

/**
 * DELETE /api/attendance/zk/devices
 * Remove a device from the registry (doesn't delete logs).
 */
export async function DELETE(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Device ID required' }, { status: 400 });
  }

  try {
    const existing = await query(
      'SELECT sn FROM devices WHERE id = ? AND school_id = ? AND deleted_at IS NULL',
      [id, session.schoolId],
    );
    if (!existing || existing.length === 0) {
      return NextResponse.json({ error: 'Device not found' }, { status: 404 });
    }

    await query(
      `UPDATE devices SET deleted_at = NOW(), status = 'inactive', is_online = FALSE WHERE id = ? AND school_id = ?`,
      [id, session.schoolId],
    );

    await logAudit({
      schoolId: session.schoolId,
      userId: session.userId,
      action: AuditAction.DELETED_STAFF, // closest available
      entityType: 'device',
      entityId: Number(id),
      details: { serial_number: existing[0].sn, soft_delete: true },
      ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
    });

    return NextResponse.json({ success: true, message: 'Device removed (will auto-recover on next heartbeat)' });
  } catch (err) {
    console.error('[ZK Devices DELETE] Error:', err);
    return NextResponse.json({ error: 'Failed to delete device' }, { status: 500 });
  }
}
