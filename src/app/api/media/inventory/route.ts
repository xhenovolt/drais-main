/** GET /api/media/inventory — every learner/staff photo and the school logo, with where each image currently resolves. */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { inventory } from '@/lib/media/service';
import { getSchoolConfig, mediaRoot } from '@/lib/media/store';

export async function GET(req: NextRequest) {
  const s = await mediaSession(req, 'system.school.view');
  if (s instanceof NextResponse) return s;
  const inv = await inventory(s.schoolId);
  return NextResponse.json({
    success: true, ...inv,
    config: getSchoolConfig(s.schoolId),
    // Shown to administrators so they know where DRAIS keeps local copies on this computer.
    storage: inv.localSupported ? mediaRoot() : null,
  });
}
