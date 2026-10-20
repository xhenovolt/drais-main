/**
 * Path containment for every local media read/write.
 *
 * Media files are only ever read from two kinds of root: DRAIS's managed media
 * folder (~/.drais/media/<schoolId>) and a school-configured photo folder. A
 * request never supplies a path — it supplies a media REFERENCE that the
 * manifest maps to a path relative to one of those roots. This module is the
 * last line of defence: the resolved real path (symlinks followed) must stay
 * inside the real root, otherwise the read is refused.
 */
import fs from 'node:fs';
import path from 'node:path';

export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'] as const;

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif',
};

export function isImageFileName(name: string): boolean {
  return (IMAGE_EXTENSIONS as readonly string[]).includes(path.extname(name).toLowerCase());
}

export function mimeForFile(name: string): string {
  return MIME_BY_EXT[path.extname(name).toLowerCase()] ?? 'application/octet-stream';
}

/** A relative path we are willing to store in a manifest: no absolute paths, no `..`, no NUL. */
export function isSafeRelative(rel: string): boolean {
  if (!rel || rel.includes('\0')) return false;
  if (path.isAbsolute(rel) || /^[a-zA-Z]:/.test(rel)) return false;
  const norm = path.normalize(rel);
  return !norm.split(/[\\/]+/).includes('..');
}

/**
 * Resolve `rel` inside `root` and return the real absolute path, or null when
 * the target escapes the root (after following symlinks), does not exist, or
 * is not a regular file.
 */
export function resolveInsideRoot(root: string, rel: string): string | null {
  if (!isSafeRelative(rel)) return null;
  let realRoot: string;
  try { realRoot = fs.realpathSync(root); } catch { return null; }
  const candidate = path.resolve(realRoot, rel);
  let realTarget: string;
  try { realTarget = fs.realpathSync(candidate); } catch { return null; }
  const rootWithSep = realRoot.endsWith(path.sep) ? realRoot : realRoot + path.sep;
  const sameCase = process.platform === 'win32'
    ? realTarget.toLowerCase().startsWith(rootWithSep.toLowerCase())
    : realTarget.startsWith(rootWithSep);
  if (!sameCase) return null;
  try { if (!fs.statSync(realTarget).isFile()) return null; } catch { return null; }
  return realTarget;
}

/**
 * Validate a folder an administrator wants DRAIS to read photos from. Refuses
 * filesystem roots, DRAIS's own install/source tree and system folders — a
 * photo folder is configuration, not a way to read arbitrary files.
 */
export function validatePhotoFolder(dir: string): { ok: true; real: string } | { ok: false; reason: string } {
  if (!dir || typeof dir !== 'string') return { ok: false, reason: 'empty' };
  if (!path.isAbsolute(dir)) return { ok: false, reason: 'not_absolute' };
  let real: string;
  try { real = fs.realpathSync(dir); } catch { return { ok: false, reason: 'not_found' }; }
  try { if (!fs.statSync(real).isDirectory()) return { ok: false, reason: 'not_directory' }; } catch { return { ok: false, reason: 'not_found' }; }
  const parsed = path.parse(real);
  if (real === parsed.root) return { ok: false, reason: 'filesystem_root' };
  const lower = real.toLowerCase();
  const forbidden = [process.cwd(), process.env.SystemRoot, process.env.windir, process.env.ProgramFiles, process.env['ProgramFiles(x86)'], '/etc', '/bin', '/usr', '/System']
    .filter((p): p is string => !!p)
    .map(p => { try { return fs.realpathSync(p).toLowerCase(); } catch { return p.toLowerCase(); } });
  for (const f of forbidden) {
    if (lower === f || lower.startsWith(f + path.sep)) return { ok: false, reason: 'forbidden_location' };
  }
  try { fs.accessSync(real, fs.constants.R_OK); } catch { return { ok: false, reason: 'not_readable' }; }
  return { ok: true, real };
}
