/**
 * Nexus configuration — GET (masked) / PUT (super admin).
 *
 * The provider key is stored here rather than in an environment variable or,
 * worse, in source: it can be rotated from the UI without a deploy, and a key
 * committed to a file would live permanently in three GitHub repositories.
 *
 * GET never returns the key — only whether one is set and a short hint
 * ("xai-…mLscYJ") so an operator can tell which key is installed without the
 * screen becoming a place to read secrets from.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { getNexusConfig, saveNexusConfig, NEXUS_NAME } from '@/lib/nexus/config';
import { logAudit, AuditAction } from '@/lib/audit';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  return NextResponse.json({ success: true, name: NEXUS_NAME, config: await getNexusConfig() });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  // Super admin only. The key is billable and shared platform-wide, so this is
  // deliberately stricter than reading school figures.
  if (!session.isSuperAdmin) {
    return NextResponse.json(
      { error: `Only a super administrator can change ${NEXUS_NAME} settings.`, code: 'FORBIDDEN' },
      { status: 403 },
    );
  }

  let body: any;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }); }

  await saveNexusConfig({
    enabled: body?.enabled === undefined ? undefined : !!body.enabled,
    baseUrl: typeof body?.baseUrl === 'string' ? body.baseUrl : undefined,
    model:   typeof body?.model   === 'string' ? body.model   : undefined,
    apiKey:  typeof body?.apiKey  === 'string' ? body.apiKey  : undefined,
  });

  // The key itself is never written to the audit trail — only that it changed.
  void logAudit({
    schoolId: session.schoolId, userId: session.userId,
    action: AuditAction.SETTINGS_CHANGED, entityType: 'nexus_config',
    details: {
      enabled: body?.enabled, model: body?.model, baseUrl: body?.baseUrl,
      keyChanged: typeof body?.apiKey === 'string' ? (body.apiKey ? 'set' : 'cleared') : 'unchanged',
    },
    ip: req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    userAgent: req.headers.get('user-agent'),
  });

  return NextResponse.json({ success: true, config: await getNexusConfig() });
}
