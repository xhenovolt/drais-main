/**
 * GET /api/platform/v1/schools/{external_id}/features   (scope: features:read)
 * PUT /api/platform/v1/schools/{external_id}/features   (scope: features:write)
 *
 * Read or remotely toggle per-school controls from the platform (Jeton):
 *   - module flags (school_modules.is_enabled), validated against MODULE_CODES
 *   - sms_enabled (hard SMS kill-switch, enforced in the comm dispatcher/drain)
 *
 * PUT body: { sms_enabled?: boolean, modules?: { [moduleCode]: boolean } }
 */
import { NextRequest } from 'next/server';
import { requirePlatformAuth, finalizeAudit, ok, rateLimitHeaders } from '@/lib/platform/auth';
import { runMutation } from '@/lib/platform/withMutation';
import { emitPlatformEvent } from '@/lib/platform/events';
import { query } from '@/lib/db';
import { isModuleCode, MODULE_CODES } from '@/lib/school-modules';
import { getCommSettings, updateCommSettings } from '@/lib/comm/settings';

async function resolveSchool(externalId: string) {
  const r = (await query(
    `SELECT id, name, status FROM schools WHERE external_id = ? AND deleted_at IS NULL LIMIT 1`,
    [externalId],
  )) as any[];
  return r[0] ?? null;
}

async function readFeatures(schoolId: number) {
  const mods = (await query(
    `SELECT module_code, is_enabled FROM school_modules WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  const enabled: Record<string, boolean> = {};
  for (const code of MODULE_CODES) enabled[code] = false;       // default-off baseline
  for (const m of mods) if (isModuleCode(m.module_code)) enabled[m.module_code] = m.is_enabled === 1;
  const settings = await getCommSettings(schoolId);
  return { sms_enabled: settings.smsEnabled, modules: enabled };
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['features:read']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  const s = await resolveSchool(external_id);
  if (!s) {
    await finalizeAudit(ctx, req, 404, { errorCode: 'NOT_FOUND' });
    return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'School not found' } }), {
      status: 404, headers: { 'Content-Type': 'application/json', 'X-Request-Id': ctx.requestId },
    });
  }
  const features = await readFeatures(s.id);
  await finalizeAudit(ctx, req, 200, { schoolId: s.id });
  return ok({ school: external_id, school_status: s.status, ...features }, ctx.requestId, rateLimitHeaders(ctx));
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ external_id: string }> }) {
  const auth = await requirePlatformAuth(req, ['features:write']);
  if ('errorResponse' in auth) return auth.errorResponse;
  const { ctx } = auth;
  const { external_id } = await params;

  return runMutation(req, ctx, async ({ json }) => {
    const s = await resolveSchool(external_id);
    if (!s) return { status: 404, body: { code: 'NOT_FOUND', message: 'School not found' }, errorCode: 'NOT_FOUND' };

    const changes: Record<string, unknown> = {};

    if (typeof json?.sms_enabled === 'boolean') {
      await updateCommSettings(s.id, { smsEnabled: json.sms_enabled });
      changes.sms_enabled = json.sms_enabled;
    }

    if (json?.modules && typeof json.modules === 'object') {
      const applied: Record<string, boolean> = {};
      for (const [code, on] of Object.entries(json.modules)) {
        if (!isModuleCode(code)) return { status: 400, body: { code: 'BAD_MODULE', message: `Unknown module: ${code}` }, errorCode: 'BAD_MODULE' };
        const enabled = on ? 1 : 0;
        await query(
          `INSERT INTO school_modules (school_id, module_code, is_enabled, enabled_at)
             VALUES (?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE is_enabled = VALUES(is_enabled), updated_at = NOW()`,
          [s.id, code, enabled],
        );
        applied[code] = !!on;
      }
      changes.modules = applied;
    }

    if (Object.keys(changes).length === 0) {
      return { status: 400, body: { code: 'NO_CHANGES', message: 'Provide sms_enabled and/or modules' }, errorCode: 'NO_CHANGES' };
    }

    await emitPlatformEvent({
      eventType: 'school.updated',
      schoolId:  s.id,
      payload:   { external_id, changes, by: { consumer: ctx.consumer, keyId: ctx.keyId } },
    });

    const features = await readFeatures(s.id);
    return { status: 200, body: { school: external_id, applied: changes, ...features }, schoolId: s.id };
  });
}
