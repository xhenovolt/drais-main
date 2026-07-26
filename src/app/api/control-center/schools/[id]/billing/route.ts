/**
 * Control Center — a school's billing ledger (Phase 11 / E-6).
 *   GET                                   → invoices (+ paid/outstanding/status) + payments
 *   POST { action:'generate_invoice', plan_code? }
 *   POST { action:'record_payment', invoice_id, amount, method?, reference?, note? }
 *   POST { action:'void_invoice', invoice_id }
 * Read = control session; mutations = billing.manage. Audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, clientIp } from '@/lib/control/auth';
import { controlCan } from '@/lib/control/permissions';
import { schoolBilling, generateInvoice, recordPayment, voidInvoice } from '@/lib/control/billing';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json({ success: true, ...(await schoolBilling(Number(id))) });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user.role, 'billing.manage')) return NextResponse.json({ error: 'You do not have permission to manage billing' }, { status: 403 });
  const { id } = await ctx.params;
  const schoolId = Number(id);
  const b = await req.json().catch(() => null);
  const ip = clientIp(req);

  try {
    if (b?.action === 'generate_invoice') {
      const res = await generateInvoice({ schoolId, planCode: b.plan_code ?? null, operatorId: user.id, ip });
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
      return NextResponse.json({ success: true, invoice_id: res.invoiceId });
    }
    if (b?.action === 'record_payment') {
      const res = await recordPayment({
        invoiceId: Number(b.invoice_id), amount: Number(b.amount),
        method: b.method, reference: b.reference, note: b.note, operatorId: user.id, ip,
      });
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
      return NextResponse.json({ success: true, paid_in_full: res.paidInFull, new_end: res.newEnd });
    }
    if (b?.action === 'void_invoice') {
      const res = await voidInvoice(Number(b.invoice_id), user.id, ip);
      if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Billing action failed' }, { status: 500 });
  }
}
