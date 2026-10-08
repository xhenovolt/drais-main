/**
 * @drais/desktop — the install-time .drs bundle a Windows build can ship.
 *
 * `npm run dist:win` optionally bundles one or more encrypted .drs files
 * (scripts/build/prepare-drs-bundle.mjs) so a packaged install can offer
 * "set this machine up for <school>" on first run, instead of silently
 * creating an empty local-sqlite shell the admin never chose and then
 * leaving them to find scripts/db/import-drs.mjs — a dev-only CLI tool
 * that was never reachable from the packaged app at all.
 *
 * Resource location: electron/main.cjs sets DRAIS_RESOURCES_PATH before
 * requiring the Next standalone server (packaged: process.resourcesPath;
 * dev-under-Electron: the repo's own `build/` dir). Plain `npm run dev`
 * (no Electron at all) falls back to `<cwd>/build` too, so this works
 * identically whether or not Electron is actually running — the bundle
 * is just files on disk, never an Electron-only concept.
 *
 * The manifest's passphrases are real secrets (whoever ran `npm run
 * dist:win` typed them in) — this module is the ONLY thing that ever
 * reads them, and never over the network: offlineSchools() strips them
 * before returning anything to a route that might serve it to a client.
 */
import fs from 'node:fs';
import path from 'node:path';

export interface BundledDrsEntry {
  schoolId: number;
  schoolName: string;
  fileName: string;
  createdAt: string;
  /** Present only when read internally by installBundledSchool(). Never
   *  returned by listBundledSchools(), which the client-facing route uses. */
  passphrase?: string;
  /** At most one entry carries this. When set, src/instrumentation.ts
   *  installs it SILENTLY the first time the server boots with no local
   *  database yet — zero clicks, matching how TiDB credentials baked
   *  into build/.env.production already make the exe work from the very
   *  first launch with no setup screen at all. Without this flag, the
   *  school still shows up on /setup/local-sqlite's Automatic tab for a
   *  one-click (not zero-click) install instead. */
  autoActivate?: boolean;
}

export function resourcesPath(): string {
  return process.env.DRAIS_RESOURCES_PATH || path.join(process.cwd(), 'build');
}

export function bundleDir(): string {
  return path.join(resourcesPath(), 'drs-bundle');
}

function readManifest(): BundledDrsEntry[] {
  const manifestPath = path.join(bundleDir(), 'manifest.json');
  try {
    if (!fs.existsSync(manifestPath)) return [];
    const raw = fs.readFileSync(manifestPath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Safe for a client-facing route — never includes passphrases. */
export function listBundledSchools(): Omit<BundledDrsEntry, 'passphrase' | 'fileName'>[] {
  return readManifest().map(({ schoolId, schoolName, createdAt }) => ({ schoolId, schoolName, createdAt }));
}

/** Server-side only — resolves one bundled entry's real file path + passphrase. */
export function findBundledSchool(schoolId: number): { filePath: string; passphrase: string; schoolName: string } | null {
  const entry = readManifest().find((e) => e.schoolId === schoolId);
  if (!entry) return null;
  return { filePath: path.join(bundleDir(), entry.fileName), passphrase: entry.passphrase ?? '', schoolName: entry.schoolName };
}

/** Server-side only — the one entry (if any) this build was told to
 *  install with zero clicks on first boot. See autoActivate's own doc. */
export function findAutoActivateSchool(): { filePath: string; passphrase: string; schoolName: string; schoolId: number } | null {
  const entry = readManifest().find((e) => e.autoActivate === true);
  if (!entry) return null;
  return { filePath: path.join(bundleDir(), entry.fileName), passphrase: entry.passphrase ?? '', schoolName: entry.schoolName, schoolId: entry.schoolId };
}

/**
 * The "drop folder" — the real, direct answer to "where do I put the .drs
 * file": right next to wherever the active local database itself lives
 * (defaultSqlitePath()'s own directory — `~/.drais/` by default, or
 * alongside DRAIS_SQLITE_PATH if that's been overridden). Deliberately
 * NOT process.resourcesPath (the packaged install's read-only resource
 * tree, where Program Files would require admin elevation to write into
 * after install) — this has to be somewhere the installing user can
 * actually drop a file into without rebuilding or re-installing anything.
 * Scanned fresh on every request, no caching — dropping a new file and
 * refreshing the setup page is the whole interaction.
 */
export async function dropDir(): Promise<string> {
  const { defaultSqlitePath } = await import('@/lib/repo/sqlite/singleton');
  return path.join(path.dirname(defaultSqlitePath()), 'import');
}

export interface DroppedDrsEntry { fileName: string; schoolId: number; schoolName: string; createdAt: string }

/** Client-safe — reads only each file's header (no passphrase exists to
 *  leak; a dropped file was never typed into by this build, only copied
 *  onto disk by whoever has it). */
export async function listDroppedDrsFiles(): Promise<DroppedDrsEntry[]> {
  const dir = await dropDir();
  let files: string[];
  try {
    files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.drs'));
  } catch {
    return []; // folder doesn't exist yet — nothing dropped, not an error
  }
  const { readDrsHeader } = await import('@/lib/container/read-drs');
  const out: DroppedDrsEntry[] = [];
  for (const fileName of files) {
    try {
      const h = await readDrsHeader(path.join(dir, fileName));
      out.push({ fileName, schoolId: h.schoolId, schoolName: h.schoolName || `School #${h.schoolId}`, createdAt: h.createdAt });
    } catch { /* unreadable header — skip, don't fail the whole listing */ }
  }
  return out;
}

/** Server-side only. `fileName` must be a bare basename — rejects any
 *  path separator so a crafted name can never escape the drop folder. */
export async function resolveDroppedFile(fileName: string): Promise<string | null> {
  if (!fileName || fileName.includes('/') || fileName.includes('\\') || fileName.includes('..')) return null;
  const dir = await dropDir();
  const full = path.join(dir, fileName);
  return fs.existsSync(full) ? full : null;
}
