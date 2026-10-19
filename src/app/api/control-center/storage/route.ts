/**
 * Control Center — DRAIS Cloud Storage files (scope enforced in lib/control/cloudinary-admin.ts).
 *   GET    ?folder=&q=&type=image|video|raw|all&sort=&dir=&cursor=   → files (+ sub-folders)      storage.view
 *   PATCH  { action, public_id, resource_type, type, ... }
 *            rename { to }  ·  label { name }  ·  move { folder }  ·  tags { tags }                storage.edit
 *            trash  { items }  ·  restore { items }                                              storage.delete
 *   DELETE { items: [{ public_id, resource_type, type }] }  → PERMANENT                          storage.purge
 * Uploads are signed by ./sign and go straight from the browser to Cloudinary. Every change is audited.
 */
import { NextRequest, NextResponse } from 'next/server';
import { getControlSession, controlAudit, clientIp } from '@/lib/control/auth';
import { denied } from '@/lib/control/guard';
import { controlCan } from '@/lib/control/permissions';
import {
  cloudinaryConfigured, listFiles, listFolders, renameFile, setDisplayName, moveFile, setTags, trashFiles, restoreFiles,
  deleteFilesForever, asResourceType, asDeliveryType, UNFILED, type FileRef, type SortKey,
} from '@/lib/control/cloudinary-admin';

export const runtime = 'nodejs';

const fail = (e: any) => NextResponse.json({ error: e?.message || 'Cloudinary request failed' }, { status: Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500 });
const refs = (list: unknown): FileRef[] => (Array.isArray(list) ? list : []).filter((i: any) => i?.public_id).slice(0, 500)
  .map((i: any) => ({ public_id: String(i.public_id), resource_type: asResourceType(i.resource_type), type: asDeliveryType(i.type) }));

export async function GET(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.view')) return denied('storage.view');
  if (!cloudinaryConfigured()) return NextResponse.json({ error: 'Cloudinary is not configured on this deployment.', configured: false }, { status: 503 });
  const sp = new URL(req.url).searchParams;
  const folder = sp.get('folder') || '';
  const q = sp.get('q') || '';
  const typeParam = sp.get('type') || 'all';
  const sort = (['created_at', 'bytes', 'public_id'].includes(sp.get('sort') || '') ? sp.get('sort') : 'created_at') as SortKey;
  try {
    const [list, folders] = await Promise.all([
      listFiles({ folder, query: q, resourceType: typeParam === 'all' ? 'all' : asResourceType(typeParam), cursor: sp.get('cursor'), sort, dir: sp.get('dir') === 'asc' ? 'asc' : 'desc' }),
      q || folder === UNFILED ? Promise.resolve([]) : listFolders(folder),
    ]);
    return NextResponse.json({ success: true, folder, query: q, ...list, folders });
  } catch (e) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const b = await req.json().catch(() => null);
  const action = String(b?.action || '');
  const ip = clientIp(req);
  try {
    if (action === 'trash' || action === 'restore') {
      if (!controlCan(user, 'storage.delete')) return denied('storage.delete');
      const items = refs(b?.items);
      if (!items.length) return NextResponse.json({ error: 'items is required' }, { status: 400 });
      const result = action === 'trash' ? await trashFiles(items, user.email || String(user.id)) : await restoreFiles(items);
      await controlAudit(user.id, `storage_${action}`, 'cloudinary', { count: items.length, items: items.slice(0, 50), result }, ip);
      return NextResponse.json({ success: true, result });
    }
    if (!controlCan(user, 'storage.edit')) return denied('storage.edit');
    const publicId = String(b?.public_id || '');
    if (!publicId) return NextResponse.json({ error: 'public_id is required' }, { status: 400 });
    const rt = asResourceType(b?.resource_type); const type = asDeliveryType(b?.type);
    let file;
    if (action === 'rename') file = await renameFile(publicId, String(b.to || ''), rt, type);
    else if (action === 'label') file = await setDisplayName(publicId, String(b.name || ''), rt, type);
    else if (action === 'move') file = await moveFile(publicId, String(b.folder ?? ''), rt, type);
    else if (action === 'tags') file = await setTags(publicId, Array.isArray(b.tags) ? b.tags : String(b.tags || '').split(','), rt, type);
    else return NextResponse.json({ error: "action must be rename, label, move, tags, trash or restore" }, { status: 400 });
    await controlAudit(user.id, `storage_${action}`, `cloudinary:${publicId}`, { resource_type: rt, type, to: b.to ?? null, name: b.name ?? null, folder: b.folder ?? null, tags: b.tags ?? null }, ip);
    return NextResponse.json({ success: true, file });
  } catch (e) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const user = await getControlSession(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!controlCan(user, 'storage.purge')) return denied('storage.purge');
  const b = await req.json().catch(() => null);
  const items = refs(b?.items);
  if (!items.length) return NextResponse.json({ error: 'items is required' }, { status: 400 });
  try {
    const result = await deleteFilesForever(items);
    await controlAudit(user.id, 'storage_delete_forever', 'cloudinary', { count: items.length, items: items.slice(0, 50), result }, clientIp(req));
    return NextResponse.json({ success: true, result });
  } catch (e) { return fail(e); }
}
