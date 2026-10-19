/**
 * GET /api/control-center/storage/download?public_id=&resource_type=&type=&format=
 * Audits the download, then redirects to a short-lived attachment URL on Cloudinary.        storage.download
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { downloadUrl, asResourceType, asDeliveryType } from '@/lib/control/cloudinary-admin';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.download')) return denied('storage.download');
  const sp = new URL(req.url).searchParams;
  const publicId = sp.get('public_id') || '';
  if (!publicId) return NextResponse.json({ error: 'public_id is required' }, { status: 400 });
  const rt = asResourceType(sp.get('resource_type')); const type = asDeliveryType(sp.get('type'));
  try {
    const url = await downloadUrl(publicId, rt, type);
    await controlAudit(user.id, 'storage_download', `cloudinary:${publicId}`, { resource_type: rt, type }, clientIp(req));
    return NextResponse.redirect(url);
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Download failed' }, { status: 500 }); }
}
