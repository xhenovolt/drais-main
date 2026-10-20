/** GET/PUT /api/media/config — this machine's media settings for the session's school. */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../_auth';
import { getSchoolConfig, setSchoolConfig, type MediaPolicy, type FolderKey } from '@/lib/media/store';
import { localMediaSupported, effectivePolicy } from '@/lib/media/service';
import { validatePhotoFolder } from '@/lib/media/safe-path';
import { logAudit } from '@/lib/audit';

const POLICIES: MediaPolicy[] = ['cloud', 'local-first', 'local-only'];
const KEYS: FolderKey[] = ['admission_no', 'staff_no', 'person_id'];

export async function GET(req: NextRequest) {
  const s = await mediaSession(req, 'system.school.view');
  if (s instanceof NextResponse) return s;
  return NextResponse.json({ success: true, config: getSchoolConfig(s.schoolId), policy: effectivePolicy(s.schoolId), localSupported: localMediaSupported() });
}

export async function PUT(req: NextRequest) {
  const s = await mediaSession(req, 'system.settings.manage');
  if (s instanceof NextResponse) return s;
  if (!localMediaSupported()) return NextResponse.json({ success: false, error: 'local_media_unavailable' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if ('policy' in body) {
    if (body.policy !== null && !POLICIES.includes(body.policy)) return NextResponse.json({ success: false, error: 'invalid_policy' }, { status: 400 });
    patch.policy = body.policy;
  }
  if ('folderKey' in body) {
    if (!KEYS.includes(body.folderKey)) return NextResponse.json({ success: false, error: 'invalid_key' }, { status: 400 });
    patch.folderKey = body.folderKey;
  }
  if ('photoFolder' in body) {
    if (body.photoFolder === null || body.photoFolder === '') patch.photoFolder = null;
    else {
      const v = validatePhotoFolder(String(body.photoFolder));
      if (!v.ok) return NextResponse.json({ success: false, error: 'invalid_folder', reason: v.reason }, { status: 400 });
      patch.photoFolder = v.real;
    }
  }
  const config = await setSchoolConfig(s.schoolId, patch);
  await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'MEDIA_SETTINGS_UPDATED', entityType: 'media_settings', entityId: s.schoolId, details: patch }).catch(() => {});
  return NextResponse.json({ success: true, config, policy: effectivePolicy(s.schoolId) });
}
