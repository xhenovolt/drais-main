/**
 * Local media store: where files live on THIS machine and how DB references map to them.
 *
 *   <mediaRoot>/config.json                  per-machine settings, one block per school
 *   <mediaRoot>/<schoolId>/manifest.json     ref → local file mapping for that school
 *   <mediaRoot>/<schoolId>/files/…           files DRAIS manages (downloaded / uploaded offline)
 *
 * mediaRoot defaults to ~/.drais/media (same home as ~/.drais/local.sqlite) and can be
 * overridden with DRAIS_MEDIA_ROOT. It is never inside the app install folder, which is
 * read-only in an installed .exe, and never inside public/.
 *
 * Why a file and not a DB table: the mapping is about files on this one computer. The
 * school's DB rows are shared (online TiDB, exported .drs, local MySQL dumps); writing a
 * machine path into them would be wrong on every other machine. The DB keeps its original
 * reference untouched; the manifest says where this machine keeps a copy of it.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export type MediaPolicy = 'cloud' | 'local-first' | 'local-only';
export type FolderKey = 'admission_no' | 'staff_no' | 'person_id';

export interface SchoolMediaConfig {
  /** null = not chosen yet → the default for the active DB mode applies. */
  policy: MediaPolicy | null;
  /** Absolute path of a school-managed photo folder on this machine, if configured. */
  photoFolder: string | null;
  folderKey: FolderKey;
}

export interface ManifestEntry {
  /** The exact DB value this entry stands for (cloudinary URL, /uploads/…, media://…). */
  ref: string;
  /** Where the file is: DRAIS's managed folder, or the school's own photo folder. */
  store: 'managed' | 'folder';
  /** Path relative to that store's root. */
  rel: string;
  entityType: 'person' | 'school_logo';
  entityId: number;
  sha256: string;
  bytes: number;
  origin: 'cloudinary' | 'remote' | 'legacy' | 'upload' | 'folder';
  /** For folder assignments that changed people.photo_url: the value it replaced. */
  previousRef?: string | null;
  updatedAt: string;
}

export interface Manifest { version: 1; schoolId: number; entries: Record<string, ManifestEntry> }

export function mediaRoot(): string {
  return process.env.DRAIS_MEDIA_ROOT || path.join(os.homedir(), '.drais', 'media');
}

export function schoolRoot(schoolId: number): string {
  if (!Number.isInteger(schoolId) || schoolId <= 0) throw new Error('media: invalid school id');
  return path.join(mediaRoot(), String(schoolId));
}

export function managedFilesRoot(schoolId: number): string {
  return path.join(schoolRoot(schoolId), 'files');
}

function writeJsonAtomic(file: string, value: unknown) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function readJson<T>(file: string, fallback: T): T {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')) as T; } catch { return fallback; }
}

// One writer at a time per file within this process (the desktop app is a single process).
const queues = new Map<string, Promise<unknown>>();
function serialise<T>(key: string, work: () => T | Promise<T>): Promise<T> {
  const prev = queues.get(key) ?? Promise.resolve();
  const next = prev.then(work, work);
  queues.set(key, next.catch(() => undefined));
  return next;
}

// ── config ──────────────────────────────────────────────────────────────────
const configFile = () => path.join(mediaRoot(), 'config.json');
const DEFAULT_CONFIG: SchoolMediaConfig = { policy: null, photoFolder: null, folderKey: 'admission_no' };

export function getSchoolConfig(schoolId: number): SchoolMediaConfig {
  const all = readJson<Record<string, Partial<SchoolMediaConfig>>>(configFile(), {});
  return { ...DEFAULT_CONFIG, ...(all[String(schoolId)] ?? {}) };
}

export function setSchoolConfig(schoolId: number, patch: Partial<SchoolMediaConfig>): Promise<SchoolMediaConfig> {
  return serialise(configFile(), () => {
    const all = readJson<Record<string, Partial<SchoolMediaConfig>>>(configFile(), {});
    const next = { ...DEFAULT_CONFIG, ...(all[String(schoolId)] ?? {}), ...patch };
    all[String(schoolId)] = next;
    writeJsonAtomic(configFile(), all);
    return next;
  });
}

// ── manifest ────────────────────────────────────────────────────────────────
const manifestFile = (schoolId: number) => path.join(schoolRoot(schoolId), 'manifest.json');

export function readManifest(schoolId: number): Manifest {
  const m = readJson<Manifest>(manifestFile(schoolId), { version: 1, schoolId, entries: {} });
  // A manifest copied from another school's folder must never serve here.
  if (m.schoolId !== schoolId) return { version: 1, schoolId, entries: {} };
  return m;
}

export function updateManifest(schoolId: number, mutate: (m: Manifest) => void): Promise<Manifest> {
  return serialise(manifestFile(schoolId), () => {
    const m = readManifest(schoolId);
    mutate(m);
    writeJsonAtomic(manifestFile(schoolId), m);
    return m;
  });
}

export function sha256(buf: Uint8Array): string {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/** Write bytes into the managed store; returns the relative path. Content-addressed suffix avoids clobbering. */
export function writeManagedFile(schoolId: number, subdir: string, baseName: string, ext: string, data: Uint8Array): { rel: string; sha: string } {
  const sha = sha256(data);
  const safeBase = baseName.replace(/[^A-Za-z0-9_-]+/g, '_').slice(0, 60) || 'file';
  const safeExt = (/^\.(jpe?g|png|webp|gif)$/i.test(ext) ? ext : '.jpg').toLowerCase();
  const rel = path.posix.join(subdir.replace(/[^A-Za-z0-9_/-]+/g, '_'), `${safeBase}_${sha.slice(0, 12)}${safeExt}`);
  const abs = path.join(managedFilesRoot(schoolId), rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  if (!fs.existsSync(abs)) {
    const tmp = `${abs}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, data);
    fs.renameSync(tmp, abs);
  }
  return { rel, sha };
}
