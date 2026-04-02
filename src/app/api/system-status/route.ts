import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * GET /api/system-status
 * Returns health of: Database, Cloudinary, Devices
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const checks: Record<string, any> = {};

    // 1. Database check
    const dbStart = Date.now();
    try {
      const conn = await getConnection();
      try {
        const [rows]: any = await conn.execute('SELECT 1 AS ok');
        checks.database = { status: 'connected', latency: Date.now() - dbStart };
      } finally {
        await conn.end();
      }
    } catch (e: any) {
      checks.database = { status: 'failed', error: e.message, latency: Date.now() - dbStart };
    }

    // 2. Cloudinary check
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/image/upload`, {
        method: 'HEAD',
      }).catch(() => null);
      checks.cloudinary = {
        status: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not_configured',
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME ? '***' + process.env.CLOUDINARY_CLOUD_NAME.slice(-4) : null,
      };
    } catch {
      checks.cloudinary = { status: 'error' };
    }

    // 3. Devices — count online devices (heartbeat within 5 min)
    try {
      const conn = await getConnection();
      try {
        const [rows]: any = await conn.execute(
          `SELECT 
            COUNT(*) AS total,
            SUM(CASE WHEN last_heartbeat >= NOW() - INTERVAL 5 MINUTE THEN 1 ELSE 0 END) AS online
           FROM devices WHERE school_id = ?`,
          [schoolId]
        );
        const r = rows[0] || {};
        checks.devices = {
          status: 'ok',
          total: Number(r.total) || 0,
          online: Number(r.online) || 0,
        };
      } finally {
        await conn.end();
      }
    } catch (e: any) {
      checks.devices = { status: 'error', error: e.message };
    }

    // 4. Last heartbeat from any device
    try {
      const conn = await getConnection();
      try {
        const [rows]: any = await conn.execute(
          `SELECT last_heartbeat FROM devices WHERE school_id = ? ORDER BY last_heartbeat DESC LIMIT 1`,
          [schoolId]
        );
        checks.lastHeartbeat = rows[0]?.last_heartbeat || null;
      } finally {
        await conn.end();
      }
    } catch {
      checks.lastHeartbeat = null;
    }

    return NextResponse.json({ success: true, checks, timestamp: new Date().toISOString() });
  } catch (error: any) {
    console.error('[system-status]', error);
    return NextResponse.json({ error: 'Failed to check system status' }, { status: 500 });
  }
}
