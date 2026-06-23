/**
 * POST /api/admin/comm/test-sms — send a one-off test SMS using THIS school's
 * saved Africa's Talking credentials + sender ID, to verify delivery end-to-end.
 * Body: { phone }
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSessionSchoolId } from '@/lib/auth';
import { requirePermission } from '@/lib/rbac';
import { getCommSettings } from '@/lib/comm';
import { sendSMS, normalizePhoneNumber } from '@/lib/africastalking';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  try { await requirePermission(session.userId, session.schoolId, 'comm.settings.manage', session.isSuperAdmin); }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 403 }); }

  const body = await req.json().catch(() => ({}));
  const phone = normalizePhoneNumber(String(body?.phone || '').trim());
  if (!phone) return NextResponse.json({ error: 'A valid phone number is required' }, { status: 400 });

  const s = await getCommSettings(session.schoolId);
  const result = await sendSMS(
    phone,
    'DRAIS test message — your SMS setup is working.',
    undefined,
    s.senderName || undefined,
    { username: s.providerUsername, apiKey: s.providerApiKey },
  );

  // Return the real provider result so the admin can see exactly what happened.
  return NextResponse.json(
    result.success
      ? { success: true, message: `Test SMS sent to ${phone}.` }
      : { success: false, error: result.error || 'Send failed', detail: (result as any).detail ?? null },
    { status: result.success ? 200 : 200 },
  );
}
