/**
 * Public maintenance-status probe (Phase 23) — the school app polls this to show
 * a maintenance banner. Read-only, no auth (it only exposes the flag + message).
 */
import { NextResponse } from 'next/server';
import { getMaintenance } from '@/lib/control/platform-settings';

export const runtime = 'nodejs';

export async function GET() {
  const m = await getMaintenance().catch(() => ({ mode: 'off', message: '' }));
  return NextResponse.json({ success: true, mode: m.mode, message: m.message });
}
