/** POST /api/media/localize { limit? } — copy the next batch of cloud/legacy images onto this machine. Call until remaining = 0. */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { localizeBatch, localMediaSupported } from '@/lib/media/service';

export async function POST(req: NextRequest) {
  const s = await mediaSession(req, 'system.settings.manage');
  if (s instanceof NextResponse) return s;
  if (!localMediaSupported()) return NextResponse.json({ success: false, error: 'local_media_unavailable' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const result = await localizeBatch(s.schoolId, Number(body.limit) || 25);
  return NextResponse.json({ success: true, ...result });
}
