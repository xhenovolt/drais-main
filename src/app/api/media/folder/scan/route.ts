/** POST /api/media/folder/scan — match files in the configured school photo folder to learners/staff. Changes nothing. */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../../_auth';
import { scanPhotoFolder, localMediaSupported } from '@/lib/media/service';

export async function POST(req: NextRequest) {
  const s = await mediaSession(req, 'system.settings.manage');
  if (s instanceof NextResponse) return s;
  if (!localMediaSupported()) return NextResponse.json({ success: false, error: 'local_media_unavailable' }, { status: 400 });
  const r = await scanPhotoFolder(s.schoolId);
  if (!r.ok) return NextResponse.json({ success: false, error: 'folder_unavailable', reason: r.reason }, { status: 400 });
  return NextResponse.json({ success: true, ...r });
}
