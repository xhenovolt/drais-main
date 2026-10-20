/** GET /api/media/mode — what the client needs to build image URLs: is local media in effect for this school? */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { effectivePolicy, localMediaSupported } from '@/lib/media/service';
import { getDbMode } from '@/lib/db/db-mode';

export async function GET(req: NextRequest) {
  const s = await mediaSession(req);
  if (s instanceof NextResponse) return s;
  const policy = effectivePolicy(s.schoolId);
  return NextResponse.json({ success: true, policy, local: policy !== 'cloud', localSupported: localMediaSupported(), dbMode: getDbMode() });
}
