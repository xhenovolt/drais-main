/**
 * A role's display name. Role names are school data ("Teacher", "DIRECTOR OF STUDIES", "super_admin");
 * English shows them exactly as stored, Arabic shows the Arabic title of the common ones (shell.role.*)
 * and the stored name for anything else.
 */
export function roleSlug(raw: string | null | undefined): string {
  return String(raw ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^super_admin$/, 'superadmin');
}

export function roleLabel(t: (key: string, fallback?: string) => string, lang: string, raw: string | null | undefined): string {
  const name = String(raw ?? '');
  if (lang !== 'ar' || !name) return name;
  const slug = roleSlug(name);
  return slug ? t(`shell.role.${slug}`, name) : name;
}
