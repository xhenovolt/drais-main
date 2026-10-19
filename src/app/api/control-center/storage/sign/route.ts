/**
 * POST /api/control-center/storage/sign { folder?, tags?, filename? } → a one-time signature the browser
 * uses to upload ONE file directly to Cloudinary (our functions cannot carry files over ~4.5 MB).
 * POST ?done=1 { public_id, bytes, resource_type } after the upload → audit record.     storage.upload
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { cloudinaryConfigured, signUpload } from '@/lib/control/cloudinary-admin';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.upload')) return denied('storage.upload');
  if (!cloudinaryConfigured()) return NextResponse.json({ error: 'Cloudinary is not configured on this deployment.' }, { status: 503 });
  const b = await req.json().catch(() => ({}));
  if (new URL(req.url).searchParams.get('done')) {
    await controlAudit(user.id, 'storage_upload', `cloudinary:${String(b?.public_id || '')}`, {
      bytes: Number(b?.bytes || 0), resource_type: b?.resource_type ?? null, folder: b?.folder ?? null, filename: b?.filename ?? null,
    }, clientIp(req));
    return NextResponse.json({ success: true });
  }
  try {
    const tags = Array.isArray(b?.tags) ? b.tags : String(b?.tags || '').split(',');
    return NextResponse.json({ success: true, ...signUpload({ folder: b?.folder, tags }) });
  } catch (e: any) { return NextResponse.json({ error: e?.message || 'Could not sign the upload' }, { status: 400 }); }
}
