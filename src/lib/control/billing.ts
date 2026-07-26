/**
 * Control Center — billing ledger (Phase 11 / E-6).
 *
 * Turns declarative pricing into transactional truth: invoices per billing
 * cycle, payments against them, and reconciliation that (a) marks an invoice
 * paid and (b) extends the school's `subscription_end_date` — so ACCESS is
 * driven by PAYMENT, not a manually-picked date. The existing session gate then
 * auto-suspends a school whose paid-through date has passed.
 *
 * Pure money maths (`outstanding`, `deriveInvoiceStatus`, `computePeriod`) are
 * unit-tested. Every mutation is audited.
 */
import { query, getConnection } from '@/lib/db';
import { controlAudit } from '@/lib/control/auth';
import { getPlanByCode, billingCycleDays } from '@/lib/control/subscriptions';

export type InvoiceStatus = 'issued' | 'paid' | 'overdue' | 'void';

/* ── PURE money maths ─────────────────────────────────────────────────── */

/** PURE: amount still owed (never negative). */
export function outstanding(amount: number, paid: number): number {
  return Math.max(0, Math.round((Number(amount) || 0) - (Number(paid) || 0)));
}

/** PURE: an invoice's live status from its numbers (void wins; then paid; then overdue vs issued). */
export function deriveInvoiceStatus(args: { amount: number; paid: number; dueDate: string | null; voided?: boolean; now?: Date }): InvoiceStatus {
  if (args.voided) return 'void';
  if (outstanding(args.amount, args.paid) <= 0 && Number(args.amount) > 0) return 'paid';
  if (Number(args.amount) === 0) return 'paid'; // free plan → nothing to pay
  const now = args.now ?? new Date();
  if (args.dueDate && new Date(args.dueDate + 'T23:59:59').getTime() < now.getTime()) return 'overdue';
  return 'issued';
}

/** PURE: the [start, end] a cycle covers, starting at `fromISO` (YYYY-MM-DD). */
export function computePeriod(cycleDays: number, fromISO: string): { start: string; end: string | null } {
  if (cycleDays <= 0) return { start: fromISO, end: null }; // one_time
  const end = new Date(Date.parse(fromISO + 'T00:00:00Z') + cycleDays * 86_400_000).toISOString().slice(0, 10);
  return { start: fromISO, end };
}

/* ── schema ───────────────────────────────────────────────────────────── */

let ensured: Promise<void> | null = null;
export function ensureBillingSchema(): Promise<void> {
  if (ensured) return ensured;
  ensured = (async () => {
    await query(
      `CREATE TABLE IF NOT EXISTS platform_invoices (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         school_id BIGINT NOT NULL,
         plan_code VARCHAR(40) DEFAULT NULL,
         period_start DATE DEFAULT NULL,
         period_end DATE DEFAULT NULL,
         amount DECIMAL(14,2) NOT NULL DEFAULT 0,
         currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
         due_date DATE DEFAULT NULL,
         voided TINYINT NOT NULL DEFAULT 0,
         paid_at DATETIME DEFAULT NULL,
         note VARCHAR(255) DEFAULT NULL,
         created_by BIGINT DEFAULT NULL,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_school (school_id, created_at)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    await query(
      `CREATE TABLE IF NOT EXISTS platform_payments (
         id BIGINT PRIMARY KEY AUTO_INCREMENT,
         invoice_id BIGINT NOT NULL,
         school_id BIGINT NOT NULL,
         amount DECIMAL(14,2) NOT NULL DEFAULT 0,
         currency VARCHAR(8) NOT NULL DEFAULT 'UGX',
         method VARCHAR(32) DEFAULT NULL,
         reference VARCHAR(120) DEFAULT NULL,
         note VARCHAR(255) DEFAULT NULL,
         recorded_by BIGINT DEFAULT NULL,
         received_at DATETIME DEFAULT CURRENT_TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         KEY idx_invoice (invoice_id), KEY idx_school (school_id)
       ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`, []);
    // Gateway transaction id for idempotent webhook reconciliation (additive).
    await query(`ALTER TABLE platform_payments ADD COLUMN provider_ref VARCHAR(120) DEFAULT NULL`, []).catch(() => {});
    await query(`ALTER TABLE platform_payments ADD KEY idx_provider_ref (provider_ref)`, []).catch(() => {});
  })();
  return ensured;
}

/** Has a gateway transaction already been recorded? (webhook idempotency) */
export async function paymentExistsByProviderRef(providerRef: string): Promise<boolean> {
  await ensureBillingSchema();
  const r = (await query(`SELECT 1 FROM platform_payments WHERE provider_ref = ? LIMIT 1`, [providerRef]).catch(() => [])) as any[];
  return r.length > 0;
}

/* ── reads ────────────────────────────────────────────────────────────── */

const paidFor = async (invoiceId: number): Promise<number> => {
  const r = (await query(`SELECT COALESCE(SUM(amount),0) n FROM platform_payments WHERE invoice_id = ?`, [invoiceId]).catch(() => [{ n: 0 }])) as any[];
  return Number(r[0]?.n || 0);
};

/** Invoices for a school with computed paid/outstanding/status + their payments. */
export async function schoolBilling(schoolId: number) {
  await ensureBillingSchema();
  const invoices = (await query(
    `SELECT i.*, COALESCE((SELECT SUM(p.amount) FROM platform_payments p WHERE p.invoice_id = i.id), 0) AS paid
       FROM platform_invoices i WHERE i.school_id = ? ORDER BY i.id DESC`, [schoolId],
  ).catch(() => [])) as any[];
  const payments = (await query(
    `SELECT id, invoice_id, amount, currency, method, reference, note, received_at
       FROM platform_payments WHERE school_id = ? ORDER BY id DESC LIMIT 100`, [schoolId],
  ).catch(() => [])) as any[];
  const withStatus = invoices.map((i) => ({
    ...i,
    paid: Number(i.paid || 0),
    outstanding: outstanding(Number(i.amount), Number(i.paid || 0)),
    status: deriveInvoiceStatus({ amount: Number(i.amount), paid: Number(i.paid || 0), dueDate: i.due_date ? String(i.due_date).slice(0, 10) : null, voided: !!Number(i.voided) }),
  }));
  const totalOutstanding = withStatus.filter((i) => i.status !== 'void').reduce((a, b) => a + b.outstanding, 0);
  return { invoices: withStatus, payments, totalOutstanding };
}

/* ── mutations ────────────────────────────────────────────────────────── */

/** Generate the next invoice for a school on its (or the given) plan. */
export async function generateInvoice(args: {
  schoolId: number; planCode?: string | null; operatorId: number; ip?: string | null;
}): Promise<{ ok: boolean; reason?: string; invoiceId?: number }> {
  await ensureBillingSchema();
  const srow = (await query(`SELECT subscription_plan, subscription_end_date FROM schools WHERE id = ? LIMIT 1`, [args.schoolId]).catch(() => [])) as any[];
  const code = args.planCode || srow[0]?.subscription_plan;
  if (!code) return { ok: false, reason: 'School has no plan — assign one first' };
  const plan = await getPlanByCode(code);
  if (!plan) return { ok: false, reason: 'Plan not found' };

  // Bill from the later of today or the current paid-through date (stacks cleanly).
  const cur = srow[0]?.subscription_end_date ? new Date(srow[0].subscription_end_date) : null;
  const startFrom = cur && cur.getTime() > Date.now() ? cur : new Date();
  const startISO = startFrom.toISOString().slice(0, 10);
  const { start, end } = computePeriod(billingCycleDays(plan.billing_cycle), startISO);

  const res = (await query(
    `INSERT INTO platform_invoices (school_id, plan_code, period_start, period_end, amount, currency, due_date, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [args.schoolId, code, start, end, plan.price, plan.currency, start, args.operatorId],
  )) as any;
  const invoiceId = Number(res?.insertId || 0);
  await controlAudit(args.operatorId, 'invoice_generated', `schools:${args.schoolId}`,
    { invoice_id: invoiceId, plan: code, amount: plan.price, currency: plan.currency, period_end: end }, args.ip ?? null);
  return { ok: true, invoiceId };
}

/** Record a payment against an invoice; reconcile → extend access when fully paid. */
export async function recordPayment(args: {
  invoiceId: number; amount: number; method?: string; reference?: string; note?: string;
  operatorId: number | null; providerRef?: string | null; ip?: string | null;
}): Promise<{ ok: boolean; reason?: string; paidInFull?: boolean; newEnd?: string | null }> {
  await ensureBillingSchema();
  const inv = (await query(`SELECT * FROM platform_invoices WHERE id = ? LIMIT 1`, [args.invoiceId]).catch(() => [])) as any[];
  if (!inv[0]) return { ok: false, reason: 'Invoice not found' };
  if (Number(inv[0].voided) === 1) return { ok: false, reason: 'Invoice is void' };
  const amount = Math.round(Number(args.amount) || 0);
  if (amount <= 0) return { ok: false, reason: 'Payment amount must be positive' };

  await query(
    `INSERT INTO platform_payments (invoice_id, school_id, amount, currency, method, reference, note, recorded_by, provider_ref)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [args.invoiceId, inv[0].school_id, amount, inv[0].currency, (args.method || 'manual').slice(0, 32),
     (args.reference || '').slice(0, 120) || null, (args.note || '').slice(0, 255) || null, args.operatorId,
     (args.providerRef || '').slice(0, 120) || null],
  );

  const paid = await paidFor(args.invoiceId);
  const paidInFull = outstanding(Number(inv[0].amount), paid) <= 0;
  let newEnd: string | null = null;
  if (paidInFull) {
    // Reconcile: mark paid + extend the school's access to the invoice period end.
    await query(`UPDATE platform_invoices SET paid_at = NOW() WHERE id = ?`, [args.invoiceId]).catch(() => {});
    newEnd = inv[0].period_end ? String(inv[0].period_end).slice(0, 10) : null;
    if (newEnd) {
      await query(
        `UPDATE schools SET subscription_status = 'active',
                subscription_end_date = GREATEST(COALESCE(subscription_end_date, '1970-01-01'), ?),
                updated_at = NOW() WHERE id = ?`,
        [newEnd, inv[0].school_id],
      ).catch(() => {});
    }
  }
  await controlAudit(args.operatorId, 'payment_recorded', `schools:${inv[0].school_id}`,
    { invoice_id: args.invoiceId, amount, method: args.method, reference: args.reference, paid_in_full: paidInFull, new_end: newEnd }, args.ip ?? null);
  return { ok: true, paidInFull, newEnd };
}

/** Void an invoice (does not delete its payment history). */
export async function voidInvoice(invoiceId: number, operatorId: number, ip?: string | null): Promise<{ ok: boolean; reason?: string }> {
  await ensureBillingSchema();
  const r = (await query(`UPDATE platform_invoices SET voided = 1 WHERE id = ? AND paid_at IS NULL`, [invoiceId]).catch(() => ({}))) as any;
  if (!Number(r?.affectedRows)) return { ok: false, reason: 'Only an unpaid invoice can be voided' };
  await controlAudit(operatorId, 'invoice_voided', `invoices:${invoiceId}`, null, ip ?? null);
  return { ok: true };
}
