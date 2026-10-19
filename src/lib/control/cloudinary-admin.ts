/**
 * Control Center — DRAIS Cloud Storage (Cloudinary). SERVER ONLY.
 *
 * Credentials: the platform's CLOUDINARY_* env vars. The Cloudinary account is SHARED with other
 * Xhenvolt products (bookto, sidra, sirius, xhaira, …), so the Control Center manages DRAIS's own
 * storage only, and every operation is checked against that scope here, on the server:
 *   drais/…           learner/staff photos, logos, ID-card assets, DRCE images, …
 *   drais-backups/…   platform backups
 *   drais-trash/…     the Trash (files "deleted" from the Control Center, restorable)
 *   "Unfiled"         files whose public_id starts with drais/ but have no folder (older uploads)
 *
 * The account uses DYNAMIC folders: a file's folder is `asset_folder` (what the Media Library shows).
 * Trash = moving a file's asset_folder to drais-trash/<original folder>, recording the original in its
 * context (`trashed_from`, `trashed_at`) and the `drais-trash` tag. Restore moves it back; only
 * "delete forever" / "empty trash" removes files permanently. public_ids never change, so every
 * stored URL in DRAIS keeps working while a file sits in the Trash.
 *
 * The Admin API is rate-limited (500 calls/hour on this plan); listings are one call each.
 */
import { v2 as cloudinary } from 'cloudinary';

export type ResourceType = 'image' | 'video' | 'raw';
export const RESOURCE_TYPES: ResourceType[] = ['image', 'video', 'raw'];
const DELIVERY_TYPES = ['upload', 'private', 'authenticated'] as const;
export type DeliveryType = typeof DELIVERY_TYPES[number];

export const DRAIS_ROOTS = ['drais', 'drais-backups', 'drais-trash'] as const;
export const TRASH_ROOT = 'drais-trash';
export const UNFILED = '__unfiled__';

export function cloudinaryConfigured(): boolean {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}
function configure() {
  if (!cloudinaryConfigured()) throw httpError('Cloudinary is not configured (CLOUDINARY_CLOUD_NAME / CLOUDINARY_API_KEY / CLOUDINARY_API_SECRET).', 503);
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME, api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET, secure: true,
  });
}
function httpError(msg: string, status: number) { const e = new Error(msg) as Error & { status?: number }; e.status = status; return e; }
/** Cloudinary errors arrive as { error: { message, http_code } } — make them ordinary Errors. */
function wrap(e: any): Error {
  if (e instanceof Error && (e as any).status) return e;
  return httpError(e?.error?.message || e?.message || 'Cloudinary request failed', e?.error?.http_code || e?.http_code || 500);
}
export const asResourceType = (v: unknown): ResourceType => (RESOURCE_TYPES.includes(v as ResourceType) ? (v as ResourceType) : 'image');
export const asDeliveryType = (v: unknown): DeliveryType => (DELIVERY_TYPES.includes(v as DeliveryType) ? (v as DeliveryType) : 'upload');

/** Folder paths: trimmed, no leading/trailing or double slashes, no "."/"..", no quotes. */
export function cleanFolder(v: unknown): string {
  const s = String(v ?? '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').replace(/\/{2,}/g, '/');
  if (s.split('/').some((p) => p === '..' || p === '.')) throw httpError('Invalid folder path', 400);
  if (/["\n\r*]/.test(s)) throw httpError('Invalid folder path', 400);
  return s;
}
/** PURE: is this folder inside DRAIS's storage? */
export function inDraisScope(folder: string): boolean {
  return DRAIS_ROOTS.some((r) => folder === r || folder.startsWith(`${r}/`));
}
/** A folder the caller may touch; '' (the account root) is NOT DRAIS's. */
export function draisFolder(v: unknown): string {
  const f = cleanFolder(v);
  if (!inDraisScope(f)) throw httpError(`"${f || '/'}" is outside DRAIS storage — only ${DRAIS_ROOTS.join(', ')} can be managed here.`, 403);
  return f;
}
/** Search expression matching every DRAIS file (each root + the unfiled drais/ ids). */
const SCOPE_EXPR = `(${DRAIS_ROOTS.map((r) => `asset_folder="${r}" OR asset_folder:${r}/*`).join(' OR ')} OR (asset_folder="" AND public_id:drais/*))`;
const folderExpr = (f: string) => `(asset_folder="${f}" OR asset_folder:${f}/*)`;

export interface StoredFile {
  asset_id: string; public_id: string; display_name: string | null; folder: string;
  resource_type: ResourceType; type: string; format: string | null; bytes: number;
  width: number | null; height: number | null; created_at: string; secure_url: string;
  thumbnail_url: string | null; tags: string[]; trashed_from: string | null; trashed_at: string | null;
}
const toFile = (r: any): StoredFile => {
  const ctx = r.context?.custom ?? r.context ?? {};
  return {
    asset_id: r.asset_id, public_id: r.public_id, display_name: r.display_name ?? r.filename ?? null,
    folder: r.asset_folder ?? r.folder ?? '', resource_type: r.resource_type, type: r.type,
    format: r.format ?? null, bytes: Number(r.bytes || 0), width: r.width ?? null, height: r.height ?? null,
    created_at: r.created_at, secure_url: r.secure_url, tags: Array.isArray(r.tags) ? r.tags : [],
    trashed_from: typeof ctx.trashed_from === 'string' ? ctx.trashed_from : null,
    trashed_at: typeof ctx.trashed_at === 'string' ? ctx.trashed_at : null,
    thumbnail_url: r.resource_type === 'image' || r.resource_type === 'video'
      ? cloudinary.url(r.public_id, {
          resource_type: r.resource_type, type: r.type, secure: true, sign_url: r.type !== 'upload',
          transformation: [{ width: 240, height: 180, crop: 'fill', quality: 'auto' }], format: 'jpg',
        })
      : null,
  };
};
/** PURE: a file (as the API returned it) belongs to DRAIS storage. */
export function fileInScope(f: { folder: string; public_id: string }): boolean {
  return inDraisScope(f.folder) || (!f.folder && f.public_id.startsWith('drais/'));
}
async function scopedResource(publicId: string, rt: ResourceType, type: DeliveryType): Promise<StoredFile> {
  configure();
  let f: StoredFile;
  try { f = toFile(await cloudinary.api.resource(publicId, { resource_type: rt, type, tags: true, context: true } as any)); }
  catch (e) { throw wrap(e); }
  if (!fileInScope(f)) throw httpError('That file is outside DRAIS storage.', 403);
  return f;
}

/** Search words → expression (no leading wildcards: Cloudinary forbids them). */
const words = (s: string) => s.replace(/[^\p{L}\p{N}_\-.\s]/gu, ' ').trim().split(/\s+/).filter(Boolean).slice(0, 6);

export type SortKey = 'created_at' | 'bytes' | 'public_id';
export async function listFiles(opts: {
  folder?: string; query?: string; resourceType?: ResourceType | 'all'; cursor?: string | null; max?: number;
  sort?: SortKey; dir?: 'asc' | 'desc';
}): Promise<{ files: StoredFile[]; total: number; next_cursor: string | null }> {
  configure();
  const parts: string[] = [];
  const q = words(opts.query || '');
  const folder = opts.folder === UNFILED ? UNFILED : cleanFolder(opts.folder);
  if (folder === UNFILED) parts.push('(asset_folder="" AND public_id:drais/*)');
  else if (folder) { draisFolder(folder); parts.push(q.length ? folderExpr(folder) : `asset_folder="${folder}"`); }
  else parts.push(SCOPE_EXPR);
  if (q.length) parts.push(q.map((w) => `(filename:${w}* OR display_name:${w}* OR "${w}" OR tags:"${w}" OR public_id:${w}*)`).join(' AND '));
  if (opts.resourceType && opts.resourceType !== 'all') parts.push(`resource_type:${opts.resourceType}`);
  try {
    let s = cloudinary.search.expression(parts.join(' AND ')).sort_by(opts.sort || 'created_at', opts.dir || 'desc')
      .max_results(Math.min(Math.max(opts.max ?? 50, 1), 100)).with_field('tags').with_field('context');
    if (opts.cursor) s = s.next_cursor(opts.cursor);
    const r = await s.execute();
    const files = (r.resources || []).map(toFile).filter(fileInScope);
    return { files, total: Number(r.total_count || 0), next_cursor: r.next_cursor || null };
  } catch (e) { throw wrap(e); }
}

/** Sub-folders of a DRAIS folder; at the top level, the DRAIS roots that exist (+ Unfiled). */
export async function listFolders(parent?: string): Promise<Array<{ name: string; path: string }>> {
  configure();
  const p = cleanFolder(parent);
  try {
    if (!p) {
      // The SDK's typings expect a callback first; root_folders(options) is the documented (and tested) promise form.
      const r = await (cloudinary.api.root_folders as any)({ max_results: 500 });
      return (r.folders || []).filter((f: any) => (DRAIS_ROOTS as readonly string[]).includes(f.path)).map((f: any) => ({ name: f.name, path: f.path }));
    }
    draisFolder(p);
    const r = await cloudinary.api.sub_folders(p, { max_results: 500 });
    return (r.folders || []).map((f: any) => ({ name: f.name, path: f.path })).sort((a: any, b: any) => a.name.localeCompare(b.name));
  } catch (e) { throw wrap(e); }
}

/** What a folder holds (for the delete warning): files in it and below, and sub-folders. */
export async function folderStats(path: string) {
  configure();
  const f = draisFolder(path);
  try {
    // (Aggregations are not available on this plan — a plain count is.)
    const r = await cloudinary.search.expression(folderExpr(f)).max_results(1).execute();
    const sub = await cloudinary.api.sub_folders(f, { max_results: 500 }).catch(() => ({ folders: [] }));
    return { path: f, files: Number(r.total_count || 0), subfolders: (sub.folders || []).length };
  } catch (e) { throw wrap(e); }
}

export async function usage() {
  configure();
  try {
    const u = await cloudinary.api.usage();
    const drais = await cloudinary.search.expression(SCOPE_EXPR).max_results(1).execute().catch(() => null);
    return {
      plan: u.plan, account_resources: u.resources, drais_files: drais ? Number(drais.total_count || 0) : null,
      storage_bytes: u.storage?.usage ?? 0, bandwidth_bytes: u.bandwidth?.usage ?? 0,
      credits_used: u.credits?.usage ?? null, credits_limit: u.credits?.limit ?? null, credits_percent: u.credits?.used_percent ?? null,
      rate_limit_remaining: (u as any).rate_limit_remaining ?? null,
    };
  } catch (e) { throw wrap(e); }
}

export async function renameFile(fromId: string, toId: string, rt: ResourceType, type: DeliveryType): Promise<StoredFile> {
  await scopedResource(fromId, rt, type);
  const to = String(toId || '').trim().replace(/^\/+/, '');
  if (!to || to.includes('..') || /["\n\r]/.test(to)) throw httpError('A valid new name is required', 400);
  if (!to.startsWith('drais')) throw httpError('A DRAIS file keeps a public id that starts with "drais".', 400);
  try { return toFile(await cloudinary.uploader.rename(fromId, to, { resource_type: rt, type, overwrite: false, invalidate: true })); }
  catch (e) { throw wrap(e); }
}

/** Rename only the label shown in the Media Library (keeps the public id, so stored URLs keep working). */
export async function setDisplayName(publicId: string, name: string, rt: ResourceType, type: DeliveryType) {
  await scopedResource(publicId, rt, type);
  const n = String(name || '').trim().slice(0, 255);
  if (!n) throw httpError('A name is required', 400);
  try { return toFile(await cloudinary.api.update(publicId, { resource_type: rt, type, display_name: n } as any)); }
  catch (e) { throw wrap(e); }
}

/** Move to another DRAIS folder (dynamic folders: asset_folder changes, the public id and URLs do not). */
export async function moveFile(publicId: string, folder: string, rt: ResourceType, type: DeliveryType) {
  await scopedResource(publicId, rt, type);
  const to = draisFolder(folder);
  if (to === TRASH_ROOT || to.startsWith(`${TRASH_ROOT}/`)) throw httpError('Use "Move to Trash" to put a file in the Trash.', 400);
  try { return toFile(await cloudinary.api.update(publicId, { resource_type: rt, type, asset_folder: to } as any)); }
  catch (e) { throw wrap(e); }
}

export async function setTags(publicId: string, tags: string[], rt: ResourceType, type: DeliveryType) {
  await scopedResource(publicId, rt, type);
  const clean = [...new Set(tags.map((t) => String(t).trim()).filter(Boolean))].slice(0, 50);
  try { return toFile(await cloudinary.api.update(publicId, { resource_type: rt, type, tags: clean.join(',') } as any)); }
  catch (e) { throw wrap(e); }
}

export interface FileRef { public_id: string; resource_type: ResourceType; type: DeliveryType }

/** Move files to the Trash (restorable). Returns public_id → 'trashed' | error message. */
export async function trashFiles(items: FileRef[], by: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const it of items) {
    try {
      const f = await scopedResource(it.public_id, it.resource_type, it.type);
      if (f.folder === TRASH_ROOT || f.folder.startsWith(`${TRASH_ROOT}/`)) { out[it.public_id] = 'already in trash'; continue; }
      const from = f.folder || '';
      const tags = [...new Set([...f.tags, 'drais-trash'])].join(',');
      await cloudinary.api.update(it.public_id, {
        resource_type: it.resource_type, type: it.type,
        asset_folder: from ? `${TRASH_ROOT}/${from}` : TRASH_ROOT,
        context: `trashed_from=${from.replace(/[|=]/g, '_')}|trashed_at=${new Date().toISOString()}|trashed_by=${by.replace(/[|=]/g, '_')}`,
        tags,
      } as any);
      out[it.public_id] = 'trashed';
    } catch (e: any) { out[it.public_id] = wrap(e).message; }
  }
  return out;
}

/** Put trashed files back where they came from. */
export async function restoreFiles(items: FileRef[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const it of items) {
    try {
      const f = await scopedResource(it.public_id, it.resource_type, it.type);
      if (!(f.folder === TRASH_ROOT || f.folder.startsWith(`${TRASH_ROOT}/`))) { out[it.public_id] = 'not in trash'; continue; }
      const back = f.trashed_from ?? f.folder.replace(new RegExp(`^${TRASH_ROOT}/?`), '');
      await cloudinary.api.update(it.public_id, {
        resource_type: it.resource_type, type: it.type, asset_folder: back,
        context: 'trashed_from=|trashed_at=|trashed_by=',
        tags: f.tags.filter((tg) => tg !== 'drais-trash').join(','),
      } as any);
      out[it.public_id] = 'restored';
    } catch (e: any) { out[it.public_id] = wrap(e).message; }
  }
  return out;
}

/** PERMANENT delete (in scope only), batched by type. Returns public_id → 'deleted' | 'not_found' | error. */
export async function deleteFilesForever(items: FileRef[]): Promise<Record<string, string>> {
  configure();
  const out: Record<string, string> = {};
  const ok: FileRef[] = [];
  for (const it of items) {
    try { await scopedResource(it.public_id, it.resource_type, it.type); ok.push(it); }
    catch (e: any) { out[it.public_id] = wrap(e).message; }
  }
  const groups = new Map<string, string[]>();
  for (const it of ok) { const k = `${it.resource_type}|${it.type}`; groups.set(k, [...(groups.get(k) || []), it.public_id]); }
  try {
    for (const [k, ids] of groups) {
      const [resource_type, type] = k.split('|');
      for (let i = 0; i < ids.length; i += 100) {
        const r = await cloudinary.api.delete_resources(ids.slice(i, i + 100), { resource_type, type, invalidate: true } as any);
        Object.assign(out, r.deleted || {});
      }
    }
  } catch (e) { throw wrap(e); }
  return out;
}

/** Every file in a folder and below (for folder delete / empty trash). Capped to keep the API budget. */
async function allFilesUnder(folder: string, cap = 2000): Promise<FileRef[]> {
  const out: FileRef[] = [];
  let cursor: string | undefined;
  do {
    let s = cloudinary.search.expression(folderExpr(folder)).max_results(500);
    if (cursor) s = s.next_cursor(cursor);
    const r = await s.execute();
    for (const x of r.resources || []) out.push({ public_id: x.public_id, resource_type: x.resource_type, type: x.type });
    cursor = r.next_cursor;
  } while (cursor && out.length < cap);
  return out;
}

export async function createFolder(path: string) {
  configure();
  const p = draisFolder(path);
  if ((DRAIS_ROOTS as readonly string[]).includes(p) && p !== TRASH_ROOT) {
    // roots already exist; creating them again is harmless
  }
  try { return await cloudinary.api.create_folder(p); } catch (e) { throw wrap(e); }
}

/** Rename / move a folder inside DRAIS storage (files keep their public ids, so stored URLs keep working). */
export async function renameFolder(from: string, to: string) {
  configure();
  const a = draisFolder(from); const b = draisFolder(to);
  if ((DRAIS_ROOTS as readonly string[]).includes(a)) throw httpError(`"${a}" is a DRAIS root folder and cannot be renamed.`, 400);
  if (b === TRASH_ROOT || b.startsWith(`${TRASH_ROOT}/`)) throw httpError('Use "Move to Trash" to put a folder in the Trash.', 400);
  try { return await (cloudinary.api as any).rename_folder(a, b); } catch (e) { throw wrap(e); }
}

/**
 * Delete a folder. mode 'trash' (default) moves everything inside to the Trash first; 'forever'
 * permanently deletes everything inside. Sub-folders go deepest first. The three DRAIS roots
 * themselves can never be deleted.
 */
export async function deleteFolder(path: string, mode: 'trash' | 'forever', by: string) {
  configure();
  const p = draisFolder(path);
  if ((DRAIS_ROOTS as readonly string[]).includes(p)) throw httpError(`"${p}" is a DRAIS root folder and cannot be deleted.`, 400);
  const files = await allFilesUnder(p);
  let moved = 0, deleted = 0;
  if (files.length) {
    if (mode === 'forever') deleted = Object.values(await deleteFilesForever(files)).filter((v) => v === 'deleted').length;
    else moved = Object.values(await trashFiles(files, by)).filter((v) => v === 'trashed').length;
  }
  // Folders: collect the tree, delete deepest first (Cloudinary only deletes empty folders).
  const tree: string[] = [];
  const walk = async (f: string) => {
    const r = await cloudinary.api.sub_folders(f, { max_results: 500 }).catch(() => ({ folders: [] }));
    for (const s of r.folders || []) await walk(s.path);
    tree.push(f);
  };
  await walk(p);
  const failed: string[] = [];
  for (const f of tree) { try { await cloudinary.api.delete_folder(f); } catch (e: any) { failed.push(`${f}: ${wrap(e).message}`); } }
  return { folder: p, files: files.length, moved_to_trash: moved, deleted_forever: deleted, folders_deleted: tree.length - failed.length, failed };
}

/** Permanently delete everything in the Trash (older than N days, or all). */
export async function emptyTrash(olderThanDays?: number) {
  configure();
  let files = await allFilesUnder(TRASH_ROOT, 5000);
  if (olderThanDays && olderThanDays > 0) {
    const cutoff = Date.now() - olderThanDays * 86_400_000;
    const keep = new Set<string>();
    // trashed_at lives in context; fetch it via search fields
    const r = await cloudinary.search.expression(folderExpr(TRASH_ROOT)).with_field('context').max_results(500).execute();
    for (const x of r.resources || []) { const at = Date.parse(x.context?.trashed_at ?? x.context?.custom?.trashed_at ?? ''); if (Number.isFinite(at) && at > cutoff) keep.add(x.public_id); }
    files = files.filter((f) => !keep.has(f.public_id));
  }
  const res = files.length ? await deleteFilesForever(files) : {};
  return { deleted: Object.values(res).filter((v) => v === 'deleted').length, considered: files.length };
}

/**
 * A short-lived URL that downloads the original as an attachment. Files go browser ↔ Cloudinary directly:
 * a Vercel function cannot carry more than ~4.5 MB in either direction.
 */
export async function downloadUrl(publicId: string, rt: ResourceType, type: DeliveryType): Promise<string> {
  const f = await scopedResource(publicId, rt, type);
  if (type === 'upload') {
    return cloudinary.url(publicId, { resource_type: rt, type, secure: true, flags: 'attachment', ...(f.format && rt !== 'raw' ? { format: f.format } : {}) });
  }
  return cloudinary.utils.private_download_url(publicId, rt === 'raw' ? '' : (f.format || ''), {
    resource_type: rt, type, attachment: true, expires_at: Math.floor(Date.now() / 1000) + 600,
  } as any);
}

/**
 * Signature for ONE direct browser → Cloudinary upload (so large files never pass through our server).
 * Only DRAIS folders (not the Trash) may receive uploads. The browser must send exactly these fields.
 */
export function signUpload(opts: { folder?: string; tags?: string[] }) {
  configure();
  const folder = draisFolder(opts.folder || 'drais');
  if (folder === TRASH_ROOT || folder.startsWith(`${TRASH_ROOT}/`)) throw httpError('Files cannot be uploaded into the Trash.', 400);
  const params: Record<string, string | number | boolean> = {
    timestamp: Math.floor(Date.now() / 1000), use_filename: true, unique_filename: true,
    asset_folder: folder, use_asset_folder_as_public_id_prefix: true,
  };
  const tags = (opts.tags || []).map((t) => String(t).trim()).filter(Boolean);
  if (tags.length) params.tags = tags.join(',');
  const signature = cloudinary.utils.api_sign_request(params, process.env.CLOUDINARY_API_SECRET as string);
  return {
    url: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/auto/upload`,
    fields: { ...params, signature, api_key: process.env.CLOUDINARY_API_KEY as string },
  };
}

export async function fileDetails(publicId: string, rt: ResourceType, type: DeliveryType) {
  return scopedResource(publicId, rt, type);
}
