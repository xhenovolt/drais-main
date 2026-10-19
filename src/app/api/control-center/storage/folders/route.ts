/**
 * Control Center — DRAIS Cloud Storage folders, usage and the Trash.
 *   GET    ?parent=            → sub-folders                                        storage.view
 *   GET    ?stats=<path>       → what a folder holds (for the delete warning)       storage.view
 *   GET    ?usage=1            → plan, storage, bandwidth, credits, DRAIS file count storage.view
 *   POST   { path }            → create folder                                      storage.upload
 *   POST   { empty_trash: true, older_than_days? }  → empty the Trash               storage.purge
 *   DELETE { path, mode: 'trash'|'forever', confirm }  → delete a folder
 *            'trash' (default) needs storage.delete; 'forever' needs storage.purge AND confirm === the folder path.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import { cloudinaryConfigured, listFolders, folderStats, createFolder, deleteFolder, renameFolder, emptyTrash, usage } from '@/lib/control/cloudinary-admin';

export const runtime = 'nodejs';
export const maxDuration = 60;
const fail = (e: any) => NextResponse.json({ error: e?.message || 'Cloudinary request failed' }, { status: Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500 });

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.view')) return denied('storage.view');
  if (!cloudinaryConfigured()) return NextResponse.json({ error: 'Cloudinary is not configured on this deployment.', configured: false }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  try {
    if (sp.get('usage')) return NextResponse.json({ success: true, usage: await usage(), cloud_name: process.env.CLOUDINARY_CLOUD_NAME });
    if (sp.get('stats')) return NextResponse.json({ success: true, stats: await folderStats(sp.get('stats') || '') });
    return NextResponse.json({ success: true, folders: await listFolders(sp.get('parent') || '') });
  } catch (e) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  try {
    if (b?.empty_trash) {
      if (!controlCan(user, 'storage.purge')) return denied('storage.purge');
      const days = Number(b.older_than_days) > 0 ? Number(b.older_than_days) : undefined;
      const r = await emptyTrash(days);
      await controlAudit(user.id, 'storage_trash_emptied', 'cloudinary:drais-trash', { ...r, older_than_days: days ?? null }, clientIp(req));
      return NextResponse.json({ success: true, ...r });
    }
    if (!controlCan(user, 'storage.upload')) return denied('storage.upload');
    const r = await createFolder(String(b?.path || ''));
    await controlAudit(user.id, 'storage_folder_create', `cloudinary-folder:${b?.path}`, null, clientIp(req));
    return NextResponse.json({ success: true, folder: r });
  } catch (e) { return fail(e); }
}

/** PATCH { from, to } → rename / move a folder.                                       storage.edit */
export async function PATCH(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.edit')) return denied('storage.edit');
  const b = await req.json().catch(() => null);
  try {
    const r = await renameFolder(String(b?.from || ''), String(b?.to || ''));
    await controlAudit(user.id, 'storage_folder_rename', `cloudinary-folder:${b?.from}`, { to: b?.to }, clientIp(req));
    return NextResponse.json({ success: true, result: r });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const mode = b?.mode === 'forever' ? 'forever' : 'trash';
  const path = String(b?.path || '');
  if (mode === 'forever') {
    if (!controlCan(user, 'storage.purge')) return denied('storage.purge');
    if (String(b?.confirm || '') !== path) return NextResponse.json({ error: 'To delete permanently, type the folder path exactly to confirm.' }, { status: 400 });
  } else if (!controlCan(user, 'storage.delete')) return denied('storage.delete');
  try {
    const r = await deleteFolder(path, mode, user.email || String(user.id));
    await controlAudit(user.id, mode === 'forever' ? 'storage_folder_delete_forever' : 'storage_folder_trash', `cloudinary-folder:${path}`, r, clientIp(req));
    return NextResponse.json({ success: true, ...r });
  } catch (e) { return fail(e); }
}
