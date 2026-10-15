/**
 * Control Center → Compose SMS.
 *   GET  → active provider, limits, today's usage and recent sends (sms.send or sms.limits)
 *   POST { numbers, message, sender_id? } → send through the ACTIVE provider (sms.send)
 *   PUT  { limits } → change test / compose limits (sms.limits — super admins)
 * Every send and limit change is audited (action sms_compose / sms_limits_updated).
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/control/db';
import { controlAudit, clientIp } from '@/lib/control/auth';
import { requireControl } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import {
  activeProvider, composeAllowance, parseRecipients, sendThroughActiveProvider, setSmsLimits,
} from '@/lib/control/sms-limits';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  const g = await requireControl(req, ['sms.send', 'sms.limits']);
  if (g.res) return g.res;
  const user = g.user;
  const [provider, allowance, recent] = await Promise.all([
    activeProvider(),
    composeAllowance(user),
    query(
      `SELECT a.id, a.metadata, a.created_at, u.name AS by_name FROM control_audit_logs a
         LEFT JOIN control_users u ON u.id = a.user_id
        WHERE a.action = 'sms_compose' ${controlCan(user, 'sms.limits') ? '' : 'AND a.user_id = ?'}
        ORDER BY a.id DESC LIMIT 20`,
      controlCan(user, 'sms.limits') ? [] : [user.id],
    ).catch(() => []) as Promise<any[]>,
  ]);
  return NextResponse.json({
    success: true, provider, ...allowance,
    recent: recent.map((r) => { let m: any = {}; try { m = JSON.parse(r.metadata || '{}'); } catch { /* ignore */ } return { id: r.id, at: r.created_at, by: r.by_name, ...m }; }),
    can: { send: controlCan(user, 'sms.send'), limits: controlCan(user, 'sms.limits') },
  });
}

export async function POST(req: NextRequest) {
  const g = await requireControl(req, 'sms.send');
  if (g.res) return g.res;
  const user = g.user;
  const b = await req.json().catch(() => ({}));
  const message = String(b?.message || '').trim();
  const { valid, invalid } = parseRecipients(String(b?.numbers || ''));
  const { limits, remainingToday } = await composeAllowance(user);

  if (!message) return NextResponse.json({ error: 'Write a message' }, { status: 400 });
  if (message.length > limits.maxMessageLength) return NextResponse.json({ error: `Message is longer than the ${limits.maxMessageLength}-character limit` }, { status: 400 });
  if (!valid.length) return NextResponse.json({ error: 'Add at least one valid phone number', invalid }, { status: 400 });
  if (valid.length > limits.composeMaxRecipients) return NextResponse.json({ error: `At most ${limits.composeMaxRecipients} recipients per send — you added ${valid.length}` }, { status: 400 });
  if (remainingToday != null && valid.length > remainingToday) {
    return NextResponse.json({ error: `Daily limit: ${remainingToday} more message${remainingToday === 1 ? '' : 's'} today (limit ${limits.composePerDay})` }, { status: 429 });
  }

  const senderId = b?.sender_id ? String(b.sender_id).trim().slice(0, 11) || null : null;
  const { provider, results } = await sendThroughActiveProvider(valid, message, senderId);
  const sent = results.filter((r) => r.ok).length;
  await controlAudit(user.id, 'sms_compose', 'sms', {
    sent, failed: results.length - sent, recipients: results.length,
    provider: provider?.name ?? null, message_length: message.length, preview: message.slice(0, 80),
    numbers: valid.slice(0, 20), errors: [...new Set(results.filter((r) => !r.ok).map((r) => r.error))].slice(0, 3),
  }, clientIp(req));
  return NextResponse.json({ success: sent > 0, sent, failed: results.length - sent, invalid, provider, results }, { status: sent > 0 || !results.length ? 200 : 502 });
}

export async function PUT(req: NextRequest) {
  const g = await requireControl(req, 'sms.limits');
  if (g.res) return g.res;
  const b = await req.json().catch(() => ({}));
  const limits = await setSmsLimits(b?.limits ?? b);
  await controlAudit(g.user.id, 'sms_limits_updated', 'sms', limits as any, clientIp(req));
  return NextResponse.json({ success: true, limits });
}
