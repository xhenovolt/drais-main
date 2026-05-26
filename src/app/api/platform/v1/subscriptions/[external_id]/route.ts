import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, fail, Errors, rateLimitHeaders } from '@/lib/platform/auth';
import { runMutation } from '@/lib/platform/withMutation';
import { query } from '@/lib/db';
import { emitPlatformEvent } from '@/lib/platform/events';

const ALLOWED_STATUS = ['active', 'inactive', 'trial', 'expired'];
const ALLOWED_PLANS  = ['none', 'trial', 'monthly', 'yearly'];

async function loadSchool(externalId: string) {
  const rows = (await query(
    `SELECT id, external_id, subscription_status, subscription_plan,
            trial_start_date, trial_end_date, subscription_start_date, subscription_end_date
       FROM schools
      WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
    [externalId],
  )) as any[];
  return rows[0] ?? null;
}

function shape(r: any) {
  return {
    external_id:             r.external_id,
    subscription_status:     r.subscription_status,
    subscription_plan:       r.subscription_plan,
    trial_start_date:        r.trial_start_date,
    trial_end_date:          r.trial_end_date,
    subscription_start_date: r.subscription_start_date,
    subscription_end_date:   r.subscription_end_date,
  };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['subscriptions:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;
  const row = await loadSchool(external_id);
  if (!row) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return fail(404, Errors.notFound('School not found'), ctx.requestId, rateLimitHeaders(ctx));
  }
  await finalizeAudit(ctx, req, 200, { schoolId: row.id });
  return ok(shape(row), ctx.requestId, rateLimitHeaders(ctx));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['subscriptions:write']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  return runMutation(req, ctx, async ({ json }) => {
    const row = await loadSchool(external_id);
    if (!row) {
      return { status: 404, body: { code: 'NOT_FOUND', message: 'School not found' }, errorCode: 'NOT_FOUND' };
    }
    if (json?.subscription_status && !ALLOWED_STATUS.includes(json.subscription_status)) {
      return { status: 400, body: { code: 'BAD_REQUEST', message: `subscription_status must be one of ${ALLOWED_STATUS.join(',')}` }, errorCode: 'BAD_REQUEST', schoolId: row.id };
    }
    if (json?.subscription_plan && !ALLOWED_PLANS.includes(json.subscription_plan)) {
      return { status: 400, body: { code: 'BAD_REQUEST', message: `subscription_plan must be one of ${ALLOWED_PLANS.join(',')}` }, errorCode: 'BAD_REQUEST', schoolId: row.id };
    }
    const map: Record<string, string> = {
      subscription_status:     'subscription_status',
      subscription_plan:       'subscription_plan',
      trial_start_date:        'trial_start_date',
      trial_end_date:          'trial_end_date',
      subscription_start_date: 'subscription_start_date',
      subscription_end_date:   'subscription_end_date',
    };
    const fields: string[] = [];
    const values: any[]    = [];
    for (const [k, col] of Object.entries(map)) {
      if (json?.[k] !== undefined) { fields.push(`${col} = ?`); values.push(json[k]); }
    }
    if (!fields.length) {
      return { status: 400, body: { code: 'BAD_REQUEST', message: 'No mutable fields provided' }, errorCode: 'BAD_REQUEST', schoolId: row.id };
    }
    values.push(row.id);
    await query(`UPDATE schools SET ${fields.join(', ')}, updated_at = NOW() WHERE id = ?`, values);
    const updated = await loadSchool(external_id);
    await emitPlatformEvent({
      eventType: 'subscription.changed',
      schoolId:  row.id,
      payload:   { external_id, previous: shape(row), current: shape(updated), by: { consumer: ctx.consumer, keyId: ctx.keyId } },
    });
    return { status: 200, body: shape(updated), schoolId: row.id };
  });
}
