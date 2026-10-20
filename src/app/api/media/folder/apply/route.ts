/** POST /api/media/folder/apply { pairs: [{ personId, file }] } — link confirmed folder files to people. */
import { NextRequest, NextResponse } from 'next/server';
import { mediaSession } from '../../_auth';
import { applyFolderAssignments, localMediaSupported } from '@/lib/media/service';
import { logAudit } from '@/lib/audit';

export async function POST(req: NextRequest) {
  const s = await mediaSession(req, 'system.settings.manage');
  if (s instanceof NextResponse) return s;
  if (!localMediaSupported()) return NextResponse.json({ success: false, error: 'local_media_unavailable' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const pairs = (Array.isArray(body.pairs) ? body.pairs : [])
    .map((p: { personId?: unknown; file?: unknown }) => ({ personId: Number(p?.personId), file: String(p?.file ?? '') }))
    .filter((p: { personId: number; file: string }) => Number.isInteger(p.personId) && p.personId > 0 && p.file);
  if (!pairs.length) return NextResponse.json({ success: false, error: 'no_pairs' }, { status: 400 });
  try {
    const r = await applyFolderAssignments(s.schoolId, pairs.slice(0, 5000));
    await logAudit({ schoolId: s.schoolId, userId: s.userId, action: 'MEDIA_FOLDER_LINKED', entityType: 'media_settings', entityId: s.schoolId, details: { applied: r.applied, skipped: r.skipped.length } }).catch(() => {});
    return NextResponse.json({ success: true, ...r });
  } catch (e) {
    return NextResponse.json({ success: false, error: (e as Error).message }, { status: 400 });
  }
}
