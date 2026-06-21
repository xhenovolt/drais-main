/**
 * GET /api/platform/v1/schools/{external_id}/staff   (scope: staff:read)
 *
 * Staff directory for one school: name, role/position, status, staff_no,
 * department. Deliberately EXCLUDES salary / bank / NSSF / TIN — sensitive
 * employment PII never leaves DRAIS over the platform API.
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { query } from '@/lib/db';

async function safe<T>(p: Promise<T>, fb: T): Promise<T> { try { return await p; } catch { return fb; } }

export async function GET(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['staff:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  const sc = (await query(
    `SELECT id, name FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
    [external_id],
  )) as any[];
  if (!sc.length) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'School not found' } }), {
      status: 404, headers: { 'Content-Type': 'application/json', 'X-Request-Id': ctx.requestId },
    });
  }
  const schoolId = sc[0].id;

  const rows = await safe(query(
    `SELECT s.staff_no, s.status, s.position,
            TRIM(CONCAT_WS(' ', COALESCE(p.first_name, s.first_name), COALESCE(p.last_name, s.last_name))) AS name,
            r.name AS role_name,
            d.name AS department_name
       FROM staff s
       LEFT JOIN people p   ON p.id = s.person_id
       LEFT JOIN roles r    ON r.id = s.role_id
       LEFT JOIN departments d ON d.id = s.department_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL
      ORDER BY s.status ASC, name ASC
      LIMIT 1000`,
    [schoolId],
  ) as Promise<any[]>, []);

  const data = {
    school:      external_id,
    school_name: sc[0].name,
    count:       rows.length,
    staff: rows.map(r => ({
      name:       r.name || 'Unknown',
      staff_no:   r.staff_no ?? null,
      role:       r.role_name ?? r.position ?? null,
      department: r.department_name ?? null,
      status:     r.status ?? null,
    })),
  };
  await finalizeAudit(ctx, req, 200, { schoolId });
  return ok(data, ctx.requestId, rateLimitHeaders(ctx));
}
