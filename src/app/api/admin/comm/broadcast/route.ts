/**
 * Bulk-broadcast endpoint. Resolves an audience descriptor to a list
 * of phones, then sends one message per recipient through the
 * communication engine's provider. Each send writes a comm_dispatch_log
 * row with event_type='broadcast.general' and source='manual'.
 *
 * POST /api/admin/comm/broadcast
 *   body: { message, audience, dryRun? }
 *
 *   message:  the body text (school prefix is applied server-side; do
 *             NOT include it manually)
 *   audience: see BroadcastAudience in lib/comm/audience-resolver.ts
 *   dryRun:   if true, only resolves recipients and returns the
 *             preview list — nothing is sent and no log rows are
 *             written. Used by the UI to show the preview before
 *             commit.
 *
 * The route is gated by comm.dispatch.send. Manual broadcasts bypass
 * the school's auto_mode setting (they're explicitly initiated by a
 * human with permission) but still respect quiet hours unless the
 * caller passes force=true.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { applyPrefix, getCommSettings, getProvider, isQuietHours } from '@/lib/comm';
import { resolveBroadcastAudience, type BroadcastAudience } from '@/lib/comm/audience-resolver';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try {
    await requirePermission(session.userId, session.schoolId, 'comm.dispatch.send', session.isSuperAdmin);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });

  const message = String(body.message ?? '').trim();
  const audience = body.audience as BroadcastAudience | undefined;
  const dryRun  = !!body.dryRun;
  const force   = !!body.force;          // override quiet hours

  if (!message) return NextResponse.json({ error: 'message is required' }, { status: 400 });
  if (!audience || typeof audience !== 'object' || !('type' in audience)) {
    return NextResponse.json({ error: 'audience is required' }, { status: 400 });
  }
  if (message.length > 1600) {
    return NextResponse.json({ error: 'Message too long (max 1600 chars)' }, { status: 400 });
  }

  const settings = await getCommSettings(session.schoolId);
  if (!settings.smsEnabled) {
    return NextResponse.json({ error: 'SMS is disabled for this school by the platform administrator.' }, { status: 403 });
  }
  const renderedBody = applyPrefix(message, settings.prefix);

  let recipients;
  try {
    recipients = await resolveBroadcastAudience(session.schoolId, audience);
  } catch (e: any) {
    return NextResponse.json({ error: `Audience resolution failed: ${e?.message}` }, { status: 400 });
  }

  if (dryRun) {
    return NextResponse.json({
      success:        true,
      dryRun:         true,
      previewBody:    renderedBody,
      recipientCount: recipients.length,
      recipients:     recipients.slice(0, 200),   // cap preview list
    });
  }

  if (recipients.length === 0) {
    return NextResponse.json({ error: 'No valid recipients resolved' }, { status: 400 });
  }

  const quiet = isQuietHours(settings);
  const provider = getProvider(settings.defaultProvider, 'sms');

  let sent = 0, failed = 0, queued = 0;

  for (const rec of recipients) {
    if (quiet && !force) {
      // Stage as queued during quiet hours unless the operator passed force=true.
      await query(
        `INSERT INTO comm_dispatch_log
          (school_id, event_type, channel, recipient_phone, recipient_name,
           message_body, status, source, triggered_by_user_id, context_json, error_message)
         VALUES (?, 'broadcast.general', 'sms', ?, ?, ?, 'queued', 'manual', ?, ?, 'quiet hours')`,
        [
          session.schoolId, rec.phone, rec.name, renderedBody,
          session.userId,
          JSON.stringify({ audienceType: audience.type, meta: rec.meta ?? null }),
        ],
      );
      queued += 1;
      continue;
    }

    let result;
    try {
      result = await provider.send({
        to:         rec.phone,
        body:       renderedBody,
        senderName: settings.senderName,
        creds:      { username: settings.providerUsername, apiKey: settings.providerApiKey },
      });
    } catch (e: any) {
      result = { success: false, providerMessageId: null, cost: null, error: e?.message || 'provider threw' };
    }

    await query(
      `INSERT INTO comm_dispatch_log
        (school_id, event_type, channel, recipient_phone, recipient_name,
         message_body, status, provider, provider_message_id, provider_cost,
         error_message, source, triggered_by_user_id, context_json, sent_at)
       VALUES (?, 'broadcast.general', 'sms', ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?,
               CASE WHEN ? = 'sent' THEN NOW() ELSE NULL END)`,
      [
        session.schoolId, rec.phone, rec.name, renderedBody,
        result.success ? 'sent' : 'failed',
        provider.name, result.providerMessageId, result.cost,
        result.error,
        session.userId,
        JSON.stringify({ audienceType: audience.type, meta: rec.meta ?? null }),
        result.success ? 'sent' : 'failed',
      ],
    );

    if (result.success) sent += 1; else failed += 1;
  }

  return NextResponse.json({
    success: true,
    sent, failed, queued,
    total: recipients.length,
  });
}
