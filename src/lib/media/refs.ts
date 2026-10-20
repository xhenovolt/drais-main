/**
 * What kind of image reference a DB value is. Pure — safe on client and server.
 *
 * DB columns (people.photo_url, schools.logo_url, …) hold one of these shapes,
 * all seen in production (see docs/engineering/2026-10-directive-baseline.md):
 *   cloudinary   https://res.cloudinary.com/…            (current upload path)
 *   remote       any other http(s) URL
 *   legacy       /uploads/… or /offline-photos/…         (files expected under public/)
 *   managed      media://<schoolId>/<relative path>      (DRAIS local media store / school folder)
 *   data         data:image/… inline
 *   empty        null / ''
 */
export type RefKind = 'empty' | 'cloudinary' | 'remote' | 'legacy' | 'managed' | 'data' | 'unknown';

export const MANAGED_SCHEME = 'media://';

export function classifyRef(ref: string | null | undefined): RefKind {
  const v = (ref ?? '').trim();
  if (!v) return 'empty';
  if (v.startsWith('data:')) return 'data';
  if (v.startsWith(MANAGED_SCHEME)) return 'managed';
  if (/^https?:\/\/res\.cloudinary\.com\//i.test(v)) return 'cloudinary';
  if (/^https?:\/\//i.test(v)) return 'remote';
  if (v.startsWith('/uploads/') || v.startsWith('/offline-photos/')) return 'legacy';
  return 'unknown';
}

/** media://<schoolId>/<rel> → { schoolId, rel }, or null when malformed. */
export function parseManagedRef(ref: string): { schoolId: number; rel: string } | null {
  if (!ref.startsWith(MANAGED_SCHEME)) return null;
  const rest = ref.slice(MANAGED_SCHEME.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const schoolId = Number(rest.slice(0, slash));
  const rel = rest.slice(slash + 1);
  if (!Number.isInteger(schoolId) || schoolId <= 0 || !rel) return null;
  return { schoolId, rel };
}

export function managedRef(schoolId: number, rel: string): string {
  return `${MANAGED_SCHEME}${schoolId}/${rel.replace(/\\/g, '/')}`;
}
