/**
 * GET /api/finance/currency  — this school's currency + supported list
 * PUT /api/finance/currency  — { currency } change the school's display currency
 *
 * Display-only: amounts are never converted; only the currency shown changes.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { query } from '@/lib/db';
import { SUPPORTED_CURRENCIES, getCurrencyConfig, DEFAULT_CURRENCY } from '@/lib/currency';
import { checkModule } from '@/lib/auth/requireModule';

export async function GET(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  const rows = (await query(`SELECT currency FROM schools WHERE id = ? LIMIT 1`, [session.schoolId])) as any[];
  const code = rows[0]?.currency || DEFAULT_CURRENCY;
  return NextResponse.json({ success: true, currency: code, config: getCurrencyConfig(code), supported: SUPPORTED_CURRENCIES });
}

export async function PUT(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const modDenied = await checkModule(session.schoolId, 'finance');
  if (modDenied) return modDenied;
  try { await requirePermission(session.userId, session.schoolId, 'finance.fees.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => null);
  const code = String(body?.currency ?? '').trim().toUpperCase();
  if (!/^[A-Z]{3,5}$/.test(code)) {
    return NextResponse.json({ error: 'currency must be a 3–5 letter code (e.g. UGX, USD, KES)' }, { status: 400 });
  }
  await query(`UPDATE schools SET currency = ?, updated_at = NOW() WHERE id = ?`, [code, session.schoolId]);
  return NextResponse.json({ success: true, currency: code, config: getCurrencyConfig(code) });
}
