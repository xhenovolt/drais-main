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
