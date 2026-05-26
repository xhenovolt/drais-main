/**
 * Role-defaults seeding engine.
 *
 * For each existing role whose slug matches a known canonical role, ensure
 * the catalog permissions listed in ROLE_DEFAULTS are granted via
 * role_permissions. Existing grants are preserved; only missing ones are
 * inserted. Idempotent.
 *
 * Wildcards (e.g. 'finance.*', '*') are inserted as literal permission
 * codes only if they exist in the permissions table. The userCan / authorize
 * engines already expand wildcards at check time, so storing the wildcard
 * code itself is the most compact representation.
 */
import { query } from '@/lib/db';
import { ROLE_DEFAULTS, KNOWN_ROLE_SLUGS, type RoleSlug } from './role-defaults';

export interface SeedReport {
  rolesTouched:   number;
  grantsInserted: number;
  /** Codes referenced in ROLE_DEFAULTS that are not in the permissions table. */
  missingCodes:   string[];
  /** Per-role summary. */
  details:        Array<{ slug: string; roleId: number; schoolId: number | null; granted: number }>;
}

/**
 * Make sure every wildcard / catalog code that appears in ROLE_DEFAULTS is
 * registered in the permissions table. Wildcards like 'finance.*' and the
 * universal '*' grant need a row to be assignable. These rows are created
 * inactive-aware (is_active=1) and won't conflict with the catalog sync
 * since they're explicit wildcard rows.
 */
async function ensureWildcardRows(): Promise<{ insertedCodes: string[] }> {
  const allReferenced = new Set<string>();
  for (const codes of Object.values(ROLE_DEFAULTS)) {
    for (const c of codes) allReferenced.add(c);
  }
  const insertedCodes: string[] = [];
  for (const code of allReferenced) {
    if (!code.endsWith('*')) continue; // catalog handles non-wildcards
    const [existing] = (await query(
      `SELECT id FROM permissions WHERE code = ? LIMIT 1`,
      [code],
    )) as Array<{ id: number }>;
    if (existing) continue;
    const parts = code.split('.');
    const module   = code === '*' ? '*' : (parts[0] ?? '*');
    const resource = code === '*' ? '*' : (parts.length > 1 ? parts[1] : '*');
    const action   = code === '*' ? '*' : (parts.length > 2 ? parts.slice(2).join('.') : '*');
    const description = code === '*'
      ? 'Universal wildcard — grants every permission. Super-admin slot.'
      : `Wildcard grant for ${parts.slice(0, -1).join('.')}. Covers every action within the group.`;
    await query(
      `INSERT INTO permissions (code, module, resource, action, description, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [code, module, resource, action, description],
    );
    insertedCodes.push(code);
  }
  return { insertedCodes };
}

export async function seedRoleDefaults(): Promise<SeedReport> {
  const { insertedCodes } = await ensureWildcardRows();
  if (insertedCodes.length) {
    // eslint-disable-next-line no-console
    console.log(`[rbac/seed-roles] Inserted wildcard permission rows: ${insertedCodes.join(', ')}`);
  }

  // Fetch every role whose slug matches a canonical default (case-insensitive)
  const roleRows = (await query(
    `SELECT id, school_id, slug FROM roles
      WHERE deleted_at IS NULL
        AND LOWER(slug) IN (${KNOWN_ROLE_SLUGS.map(() => '?').join(',')})`,
    KNOWN_ROLE_SLUGS.map(s => s.toLowerCase()),
  )) as Array<{ id: number; school_id: number | null; slug: string }>;

  // Pre-cache permission id by code
  const referenced = new Set<string>();
  for (const codes of Object.values(ROLE_DEFAULTS)) for (const c of codes) referenced.add(c);
  const permRows = (await query(
    `SELECT id, code FROM permissions WHERE code IN (${[...referenced].map(() => '?').join(',')})`,
    [...referenced],
  )) as Array<{ id: number; code: string }>;
  const idByCode = new Map(permRows.map(r => [r.code, r.id]));

  const missingCodes: string[] = [];
  for (const code of referenced) if (!idByCode.has(code)) missingCodes.push(code);

  const details: SeedReport['details'] = [];
  let totalGranted = 0;
  let totalRoles   = 0;

  for (const role of roleRows) {
    const slug = role.slug.toLowerCase() as RoleSlug;
    const codes = ROLE_DEFAULTS[slug] ?? [];
    if (codes.length === 0) continue;

    let granted = 0;
    for (const code of codes) {
      const pid = idByCode.get(code);
      if (!pid) continue;
      const result = (await query(
        `INSERT IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)`,
        [role.id, pid],
      )) as { affectedRows?: number };
      if (Number(result?.affectedRows ?? 0) > 0) granted++;
    }
    totalRoles++;
    totalGranted += granted;
    details.push({ slug: role.slug, roleId: role.id, schoolId: role.school_id, granted });
  }

  return {
    rolesTouched:   totalRoles,
    grantsInserted: totalGranted,
    missingCodes,
    details,
  };
}
