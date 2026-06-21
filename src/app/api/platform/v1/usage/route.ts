import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try { return await p; } catch { return fallback; }
}

export async function GET(req: NextRequest) {
  const auth = await requirePlatformAuth(req, ['usage:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;

  const url = new URL(req.url);
  const externalId = url.searchParams.get('school');
  const sinceDays  = Math.min(90, Math.max(1, parseInt(url.searchParams.get('since_days') ?? '30', 10) || 30));

  let schoolId: number | null = null;
  if (externalId) {
    const r = (await query(
      `SELECT id FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
      [externalId],
    )) as any[];
    schoolId = r[0]?.id ?? null;
    if (!schoolId) {
      await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
      return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'School not found' } }), {
        status: 404, headers: { 'Content-Type': 'application/json', 'X-Request-Id': ctx.requestId },
      });
    }
  }

  const scopeClause = schoolId ? `AND school_id = ?` : '';
  const baseParams  = schoolId ? [schoolId] : [];

  // DB footprint — row counts across curated high-volume, school-scoped tables.
  // Each query is wrapped in safe() so a table lacking school_id contributes 0.
  const FOOTPRINT_TABLES = [
    'students', 'staff', 'enrollments', 'attendance_records', 'attendance_raw_events',
    'comm_dispatch_log', 'notification_outbox', 'fee_payments', 'documents', 'results',
  ];
  const footprintCounts = await Promise.all(FOOTPRINT_TABLES.map(t =>
    safe(query(`SELECT COUNT(*) AS c FROM ${t} WHERE 1=1 ${scopeClause}`, baseParams) as Promise<any[]>, [{ c: -1 }])
      .then(r => ({ table: t, rows: Number(r[0]?.c ?? -1) })),
  ));
  const dbFootprint: Record<string, number> = {};
  let dbRowsTotal = 0;
  for (const f of footprintCounts) {
    if (f.rows >= 0) { dbFootprint[f.table] = f.rows; dbRowsTotal += f.rows; }
  }

  const [learnerCount, staffCount, smsSent, smsLastDay, activeSessions, storageRow, docStorage] = await Promise.all([
    safe(query(
      `SELECT COUNT(*) AS c FROM students WHERE deleted_at IS NULL ${scopeClause}`,
      baseParams,
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      `SELECT COUNT(*) AS c FROM staff WHERE deleted_at IS NULL ${scopeClause}`,
      baseParams,
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      `SELECT COUNT(*) AS c FROM comm_dispatch_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY) ${scopeClause}`,
      [sinceDays, ...baseParams],
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      `SELECT COUNT(*) AS c FROM comm_dispatch_log
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY) ${scopeClause}`,
      baseParams,
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      `SELECT COUNT(*) AS c FROM sessions
        WHERE is_active = TRUE AND expires_at > NOW() ${scopeClause}`,
      baseParams,
    ) as Promise<any[]>, [{ c: 0 }]),
    safe(query(
      schoolId
        ? `SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM platform_api_audit WHERE school_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`
        : `SELECT COALESCE(SUM(payload_bytes),0) AS bytes FROM platform_api_audit WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`,
      schoolId ? [schoolId, sinceDays] : [sinceDays],
    ) as Promise<any[]>, [{ bytes: 0 }]),
    // Cloudinary/file storage: documents carry file_size + school_id.
    safe(query(
      `SELECT COALESCE(SUM(file_size),0) AS bytes, COUNT(*) AS files
         FROM documents WHERE deleted_at IS NULL ${scopeClause}`,
      baseParams,
    ) as Promise<any[]>, [{ bytes: 0, files: 0 }]),
  ]);

  const storageBytes = Number(docStorage[0]?.bytes ?? 0);
  const data = {
    school:           externalId ?? 'platform',
    window_days:      sinceDays,
    learners:         Number(learnerCount[0]?.c ?? 0),
    staff:            Number(staffCount[0]?.c ?? 0),
    sms_sent:         Number(smsSent[0]?.c ?? 0),
    sms_sent_24h:     Number(smsLastDay[0]?.c ?? 0),
    active_sessions:  Number(activeSessions[0]?.c ?? 0),
    api_payload_bytes: Number(storageRow[0]?.bytes ?? 0),
    storage: {
      file_bytes: storageBytes,
      file_mb:    Math.round((storageBytes / (1024 * 1024)) * 100) / 100,
      file_count: Number(docStorage[0]?.files ?? 0),
    },
    db_footprint: {
      total_rows: dbRowsTotal,
      by_table:   dbFootprint,
    },
  };
  await finalizeAudit(ctx, req, 200, { schoolId });
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
