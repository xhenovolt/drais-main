import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { activateSmsProvider, deleteSmsProvider, getSmsProviderForTest, refreshSmsProviderBalance, setSmsProviderEnabled, updateSmsProvider } from '@/lib/control/sms-providers';
import { sendWithAdapter } from '@/lib/sms/providers';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const id = Number((await context.params).id);
  const body = await req.json().catch(() => ({}));
  if (body.action === 'check_balance') {
    if (!controlCan(user.role, 'sms.balance.view')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    return NextResponse.json(await refreshSmsProviderBalance(id));
  }
  if (body.action === 'activate') {
    if (!controlCan(user.role, 'sms.provider.activate')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    const result = await activateSmsProvider(id, user.id);
    await controlAudit(user.id, 'sms_provider_activate', `sms_provider:${id}`, { ok: result.ok, error: result.ok ? null : result.error }, clientIp(req)).catch(() => {});
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (body.action === 'enable' || body.action === 'disable') {
    if (!controlCan(user.role, 'sms.provider.update')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
    const result = await setSmsProviderEnabled(id, body.action === 'enable', user.id);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (!controlCan(user.role, 'sms.provider.update')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const result = await updateSmsProvider(id, { displayName: body.display_name, providerType: body.provider_type, config: body.config }, user.id);
  await controlAudit(user.id, 'sms_provider_update', `sms_provider:${id}`, { ok: result.ok, error: result.ok ? null : result.error }, clientIp(req)).catch(() => {});
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.provider.test')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const id = Number((await context.params).id);
  const body = await req.json().catch(() => ({}));
  const phone = String(body.phone || '').trim();
  const message = String(body.message || '').trim();
  if (!phone || !message || message.length > 160) return NextResponse.json({ error: 'Phone and a 1-160 character message are required' }, { status: 400 });
  const recent = await query(`SELECT COUNT(*) AS count FROM control_audit_logs WHERE user_id = ? AND action = 'sms_provider_test' AND created_at >= DATE_SUB(NOW(), INTERVAL 10 MINUTE)`, [user.id]).catch(() => [{ count: 0 }]) as any[];
  if (Number(recent[0]?.count || 0) >= 1) return NextResponse.json({ error: 'Only one provider test is allowed per operator every 10 minutes' }, { status: 429 });
  const provider = await getSmsProviderForTest(id);
  if (!provider) return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
  const result = await sendWithAdapter(provider.providerType, phone, message, provider.config);
  await query(`UPDATE sms_provider_configs SET last_success_at = CASE WHEN ? = 1 THEN NOW() ELSE last_success_at END, last_failure_at = CASE WHEN ? = 1 THEN last_failure_at ELSE NOW() END, last_provider_message_id = ? WHERE id = ?`, [result.success ? 1 : 0, result.success ? 1 : 0, result.messageId || null, id]).catch(() => {});
  await controlAudit(user.id, 'sms_provider_test', `sms_provider:${id}`, { result: result.success ? 'provider_accepted' : 'provider_rejected', provider_message_id: result.messageId || null, recipient: phone }, clientIp(req)).catch(() => {});
  return NextResponse.json({ success: result.success, accepted_by_provider: result.success, provider_message_id: result.messageId || null, delivery_status: result.status || null, cost: result.cost || null, error: result.error || null }, { status: result.success ? 200 : 502 });
}

export async function DELETE(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'sms.provider.delete')) return NextResponse.json({ error: 'Permission denied' }, { status: 403 });
  const id = Number((await context.params).id);
  const result = await deleteSmsProvider(id);
  await controlAudit(user.id, 'sms_provider_delete', `sms_provider:${id}`, { ok: result.ok, error: result.ok ? null : result.error }, clientIp(req)).catch(() => {});
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
