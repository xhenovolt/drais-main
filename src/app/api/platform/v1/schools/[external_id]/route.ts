import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { runMutation } from '@/lib/platform/withMutation';
import { query } from '@/lib/db';
import { emitPlatformEvent } from '@/lib/platform/events';

async function loadSchool(externalId: string) {
  const rows = (await query(
    `SELECT id, external_id, name, email, phone, status, subscription_status, subscription_plan,
            trial_start_date, trial_end_date, subscription_start_date, subscription_end_date,
            created_at, updated_at
       FROM schools
      WHERE external_id = ? AND deleted_at IS NULL
      LIMIT 1`,
    [externalId],
  )) as any[];
  return rows[0] ?? null;
}

function publicShape(r: any) {
  return {
    external_id:             r.external_id,
    name:                    r.name,
    email:                   r.email,
    phone:                   r.phone,
    status:                  r.status,
    subscription_status:     r.subscription_status,
    subscription_plan:       r.subscription_plan,
    trial_start_date:        r.trial_start_date,
    trial_end_date:          r.trial_end_date,
    subscription_start_date: r.subscription_start_date,
    subscription_end_date:   r.subscription_end_date,
    created_at:              r.created_at,
    updated_at:              r.updated_at,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['schools:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;
  const row = await loadSchool(external_id);
  if (!row) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound('School not found'), ctx.requestId, rateLimitHeaders(ctx));
  }
  await finalizeAudit(ctx, req, 200, { schoolId: row.id });
  return ok(publicShape(row), ctx.requestId, rateLimitHeaders(ctx));
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['schools:write']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  return runMutation(req, ctx, async ({ json }) => {
    const row = await loadSchool(external_id);
    if (!row) {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'School not found' }, errorCode: 'NOT_FOUND' };
    }
    const allowed: Record<string, string> = { name: 'name', email: 'email', phone: 'phone' };
    const fields: string[] = [];
    const values: any[]    = [];
    for (const [k, col] of Object.entries(allowed)) {
      if (json?.[k] !== undefined) { fields.push(`${col} = ?`); values.push(json[k]); }
    }
    if (!fields.length) {
      return { status: 400, body: { code: 'BAD_REQUEST', message: 'No mutable fields provided' }, errorCode: 'BAD_REQUEST', schoolId: row.id };
    }
    values.push(row.id);
    await query(`UPDATE schools SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const updated = await loadSchool(external_id);
    await emitPlatformEvent({
      eventType: 'school.updated',
      schoolId:  row.id,
      payload:   { external_id, changes: json, by: { consumer: ctx.consumer, keyId: ctx.keyId } },
    });
    return { status: 200, body: publicShape(updated), schoolId: row.id };
  });
}
