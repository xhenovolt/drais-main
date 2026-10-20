/**
 * Media service — the one place that decides where an image comes from.
 *
 *   DB reference ──▶ resolveRef() ──▶ local file (managed store / school photo folder)
 *                                  └▶ redirect to the original URL (cloud, legacy static)
 *                                  └▶ missing (local-only policy, file gone, offline)
 *
 * Pages never decide cloud-vs-local themselves; the client asks mediaSrc() (src/lib/media/client.ts)
 * which routes through /api/media/file when local media is in effect.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getDbMode, isLocalAllowed } from '@/lib/db/db-mode';
import { classifyRef, managedRef, parseManagedRef, type RefKind } from './refs';
import { resolveInsideRoot, isImageFileName, mimeForFile, validatePhotoFolder } from './safe-path';
import {
  getSchoolConfig, managedFilesRoot, readManifest, updateManifest, writeManagedFile, sha256,
  type ManifestEntry, type MediaPolicy,
} from './store';
import { listMediaSubjects, setPersonPhotoRef, type MediaSubject } from './data';
import { matchFolder, type MatchKey, type PersonIdentity } from './folder-match';

/** Local media needs a server that IS the school's computer (desktop app / local dev). Never on hosted. */
export function localMediaSupported(): boolean {
  return isLocalAllowed();
}

/**
 * Effective policy for a school on this machine.
 *   hosted                    → cloud (no local disk)
 *   explicitly configured     → that choice
 *   local-mysql / local-sqlite → local-first (offline install default)
 *   online on a desktop       → cloud
 */
export function effectivePolicy(schoolId: number): MediaPolicy {
  if (!localMediaSupported()) return 'cloud';
  const chosen = getSchoolConfig(schoolId).policy;
  if (chosen) return chosen;
  return getDbMode() === 'online' ? 'cloud' : 'local-first';
}

function publicDir(): string { return path.join(process.cwd(), 'public'); }

function entryAbsPath(schoolId: number, e: ManifestEntry): string | null {
  if (e.store === 'managed') return resolveInsideRoot(managedFilesRoot(schoolId), e.rel);
  const folder = getSchoolConfig(schoolId).photoFolder;
  if (!folder) return null;
  const v = validatePhotoFolder(folder);
  return v.ok ? resolveInsideRoot(v.real, e.rel) : null;
}

export type Resolution =
  | { kind: 'file'; absPath: string; mime: string }
  | { kind: 'redirect'; url: string }
  | { kind: 'missing'; reason: 'not_this_school' | 'no_local_copy' | 'file_missing' | 'invalid_ref' };

export function resolveRef(schoolId: number, ref: string): Resolution {
  const kind = classifyRef(ref);
  if (kind === 'empty' || kind === 'data' || kind === 'unknown') return { kind: 'missing', reason: 'invalid_ref' };
  const policy = effectivePolicy(schoolId);
  const manifest = readManifest(schoolId);
  const entry = manifest.entries[ref];

  if (kind === 'managed') {
    const parsed = parseManagedRef(ref);
    if (!parsed) return { kind: 'missing', reason: 'invalid_ref' };
    if (parsed.schoolId !== schoolId) return { kind: 'missing', reason: 'not_this_school' };
    const abs = entry ? entryAbsPath(schoolId, entry) : resolveInsideRoot(managedFilesRoot(schoolId), parsed.rel);
    return abs ? { kind: 'file', absPath: abs, mime: mimeForFile(abs) } : { kind: 'missing', reason: 'file_missing' };
  }

  if (entry && policy !== 'cloud') {
    const abs = entryAbsPath(schoolId, entry);
    if (abs) return { kind: 'file', absPath: abs, mime: mimeForFile(abs) };
    if (policy === 'local-only') return { kind: 'missing', reason: 'file_missing' };
  }
  if (kind === 'legacy') {
    const abs = resolveInsideRoot(publicDir(), ref.replace(/^\/+/, ''));
    return abs ? { kind: 'redirect', url: ref } : { kind: 'missing', reason: 'file_missing' };
  }
  if (policy === 'local-only') return { kind: 'missing', reason: 'no_local_copy' };
  return { kind: 'redirect', url: ref };
}

// ── Inventory ───────────────────────────────────────────────────────────────
export type InventoryStatus = 'local' | 'folder' | 'remote_only' | 'missing' | 'none';
export interface InventoryRow extends MediaSubject {
  refKind: RefKind;
  status: InventoryStatus;
  bytes: number | null;
  duplicateOf: number[];
}

export async function inventory(schoolId: number): Promise<{ rows: InventoryRow[]; policy: MediaPolicy; localSupported: boolean }> {
  const subjects = await listMediaSubjects(schoolId);
  const manifest = readManifest(schoolId);
  const bySha = new Map<string, number[]>();
  for (const e of Object.values(manifest.entries)) {
    const list = bySha.get(e.sha256) ?? [];
    list.push(e.entityId);
    bySha.set(e.sha256, list);
  }
  const rows = subjects.map((s): InventoryRow => {
    const refKind = classifyRef(s.ref);
    let status: InventoryStatus = 'none';
    let bytes: number | null = null;
    let dup: number[] = [];
    if (refKind !== 'empty') {
      const e = s.ref ? manifest.entries[s.ref] : undefined;
      const abs = e ? entryAbsPath(schoolId, e) : null;
      if (e && abs) {
        status = e.store === 'folder' ? 'folder' : 'local';
        bytes = e.bytes;
        dup = (bySha.get(e.sha256) ?? []).filter(id => id !== s.entityId);
      } else if (refKind === 'managed') status = 'missing';
      else if (refKind === 'legacy') status = resolveInsideRoot(publicDir(), (s.ref ?? '').replace(/^\/+/, '')) ? 'local' : 'missing';
      else if (refKind === 'cloudinary' || refKind === 'remote') status = e ? 'missing' : 'remote_only';
      else status = 'missing';
    }
    return { ...s, refKind, status, bytes, duplicateOf: dup };
  });
  return { rows, policy: effectivePolicy(schoolId), localSupported: localMediaSupported() };
}

// ── Make available offline (download remote/legacy images into the managed store) ──
const MAX_BYTES = 15 * 1024 * 1024;

async function fetchImage(url: string): Promise<{ data: Buffer; ext: string }> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 20_000);
  try {
    const res = await fetch(url, { signal: ctl.signal });
    if (!res.ok) throw new Error(`http_${res.status}`);
    const type = res.headers.get('content-type') ?? '';
    if (!type.startsWith('image/')) throw new Error('not_an_image');
    const data = Buffer.from(await res.arrayBuffer());
    if (data.length > MAX_BYTES) throw new Error('too_large');
    const ext = type.includes('png') ? '.png' : type.includes('webp') ? '.webp' : type.includes('gif') ? '.gif' : '.jpg';
    return { data, ext };
  } finally { clearTimeout(timer); }
}

export interface LocalizeResult { processed: number; saved: number; remaining: number; failures: { entityId: number; role: string; reason: string }[] }

/** Copy up to `limit` not-yet-local images into the managed store. Idempotent; call repeatedly until remaining = 0. */
export async function localizeBatch(schoolId: number, limit = 25): Promise<LocalizeResult> {
  if (!localMediaSupported()) throw new Error('media: local media is not available on this server');
  const manifest = readManifest(schoolId);
  const pending = (await listMediaSubjects(schoolId)).filter(s => {
    const k = classifyRef(s.ref);
    if (!(k === 'cloudinary' || k === 'remote' || k === 'legacy')) return false;
    const e = manifest.entries[s.ref!];
    if (e && entryAbsPath(schoolId, e)) return false;
    // A legacy file that is gone cannot be copied by retrying — it is reported as missing instead,
    // so it never blocks the batches behind it.
    if (k === 'legacy' && !resolveInsideRoot(publicDir(), s.ref!.replace(/^\/+/, ''))) return false;
    return true;
  });
  const batch = pending.slice(0, Math.max(1, Math.min(limit, 100)));
  const failures: LocalizeResult['failures'] = [];
  let saved = 0;
  for (const s of batch) {
    const ref = s.ref!;
    const kind = classifyRef(ref);
    try {
      let data: Buffer; let ext: string;
      if (kind === 'legacy') {
        const abs = resolveInsideRoot(publicDir(), ref.replace(/^\/+/, ''));
        if (!abs) throw new Error('source_file_missing');
        data = fs.readFileSync(abs); ext = path.extname(abs) || '.jpg';
      } else {
        ({ data, ext } = await fetchImage(ref));
      }
      const sub = s.entityType === 'school_logo' ? 'school' : s.role === 'staff' ? 'staff' : 'students';
      const { rel, sha } = writeManagedFile(schoolId, sub, `${s.entityType}_${s.entityId}`, ext, data);
      await updateManifest(schoolId, m => {
        m.entries[ref] = { ref, store: 'managed', rel, entityType: s.entityType, entityId: s.entityId, sha256: sha, bytes: data.length, origin: kind === 'legacy' ? 'legacy' : kind === 'cloudinary' ? 'cloudinary' : 'remote', updatedAt: new Date().toISOString() };
      });
      saved++;
    } catch (e) {
      const err = e as Error;
      // Stable reason codes for the UI; network-level failures (offline, DNS) become no_connection.
      const reason = err.name === 'AbortError' ? 'timeout' : /^(http_\d+|not_an_image|too_large|source_file_missing)$/.test(err.message) ? err.message : 'no_connection';
      failures.push({ entityId: s.entityId, role: s.role, reason });
    }
  }
  return { processed: batch.length, saved, remaining: pending.length - saved, failures };
}

// ── Offline uploads ─────────────────────────────────────────────────────────
/**
 * Store an uploaded person/school image locally and return the media:// reference to save
 * in the DB. Only used when the active DB is local; online uploads keep going to Cloudinary.
 */
export async function storeUploadLocally(schoolId: number, entityType: 'person' | 'school_logo', entityId: number, data: Buffer, fileName: string, sub: string): Promise<string> {
  const ext = path.extname(fileName) || '.jpg';
  const { rel, sha } = writeManagedFile(schoolId, sub, `${entityType}_${entityId}`, ext, data);
  const ref = managedRef(schoolId, rel);
  await updateManifest(schoolId, m => {
    m.entries[ref] = { ref, store: 'managed', rel, entityType, entityId, sha256: sha, bytes: data.length, origin: 'upload', updatedAt: new Date().toISOString() };
  });
  return ref;
}

/** True when uploads in this request should be stored on this machine rather than in Cloudinary. */
export function uploadsGoLocal(): boolean {
  return localMediaSupported() && getDbMode() !== 'online';
}

// ── School-managed photo folder ─────────────────────────────────────────────
export async function scanPhotoFolder(schoolId: number) {
  const cfg = getSchoolConfig(schoolId);
  if (!cfg.photoFolder) return { ok: false as const, reason: 'not_configured' };
  const v = validatePhotoFolder(cfg.photoFolder);
  if (!v.ok) return { ok: false as const, reason: v.reason };
  const files = fs.readdirSync(v.real, { withFileTypes: true }).filter(d => d.isFile() && isImageFileName(d.name)).map(d => d.name);
  const subjects = (await listMediaSubjects(schoolId)).filter(s => s.entityType === 'person');
  const people: PersonIdentity[] = subjects.map(s => ({ personId: s.entityId, kind: s.role === 'staff' ? 'staff' : 'student', admissionNo: s.admissionNo, staffNo: s.staffNo, displayName: s.displayName }));
  const key: MatchKey = cfg.folderKey;
  const result = matchFolder(files, people, key);
  const nameOf = new Map(subjects.map(s => [s.entityId, s]));
  return {
    ok: true as const, folder: v.real, key, fileCount: files.length,
    matched: result.matched.map(m => ({ ...m, displayName: nameOf.get(m.personId)?.displayName ?? '', role: nameOf.get(m.personId)?.role ?? 'student', recordId: nameOf.get(m.personId)?.recordId ?? 0 })),
    unresolved: result.unresolved,
  };
}

/**
 * Link confirmed folder files to people. A person who already has a photo reference keeps it
 * in the DB; the manifest maps that reference to the folder file on this machine. A person with
 * no photo gets a media:// reference — written to the LOCAL database only.
 */
export async function applyFolderAssignments(schoolId: number, pairs: { personId: number; file: string }[]) {
  const cfg = getSchoolConfig(schoolId);
  const v = cfg.photoFolder ? validatePhotoFolder(cfg.photoFolder) : { ok: false as const, reason: 'not_configured' };
  if (!v.ok) throw new Error(`media: photo folder unavailable (${(v as { reason: string }).reason})`);
  const subjects = new Map((await listMediaSubjects(schoolId)).filter(s => s.entityType === 'person').map(s => [s.entityId, s]));
  const refUsers = new Map<string, number>();
  for (const s of subjects.values()) if (s.ref) refUsers.set(s.ref, (refUsers.get(s.ref) ?? 0) + 1);
  const applied: number[] = []; const skipped: { personId: number; reason: string }[] = [];
  for (const { personId, file } of pairs) {
    const person = subjects.get(personId);
    if (!person) { skipped.push({ personId, reason: 'not_in_this_school' }); continue; }
    const abs = resolveInsideRoot(v.real, file);
    if (!abs || !isImageFileName(abs)) { skipped.push({ personId, reason: 'file_not_found' }); continue; }
    const data = fs.readFileSync(abs);
    let ref = person.ref;
    if (ref && (refUsers.get(ref) ?? 0) > 1) { skipped.push({ personId, reason: 'photo_reference_shared' }); continue; }
    if (!ref) {
      if (getDbMode() === 'online') { skipped.push({ personId, reason: 'needs_local_database' }); continue; }
      ref = managedRef(schoolId, `folder/person_${personId}`);
      await setPersonPhotoRef(schoolId, personId, ref);
    }
    const finalRef = ref;
    await updateManifest(schoolId, m => {
      m.entries[finalRef] = { ref: finalRef, store: 'folder', rel: path.basename(abs), entityType: 'person', entityId: personId, sha256: sha256(data), bytes: data.length, origin: 'folder', previousRef: person.ref, updatedAt: new Date().toISOString() };
    });
    applied.push(personId);
  }
  return { applied: applied.length, skipped };
}

// ── Server-rendered HTML (print routes) ─────────────────────────────────────
/**
 * The server-side twin of mediaSrc(): for HTML built on the server (report-card print, ID-card
 * sheets) where <MediaImg> is not in play. Returns a same-origin /api/media/file URL when local
 * media is in effect for the school (the browser sends the session cookie with it), otherwise the
 * reference unchanged.
 */
export function serverMediaSrc(schoolId: number, ref: string | null | undefined): string {
  const v = (ref ?? '').trim();
  if (!v) return '';
  const kind = classifyRef(v);
  if (kind === 'data' || kind === 'unknown' || kind === 'empty') return v;
  if (kind === 'managed' || effectivePolicy(schoolId) !== 'cloud') return `/api/media/file?ref=${encodeURIComponent(v)}`;
  return v;
}
