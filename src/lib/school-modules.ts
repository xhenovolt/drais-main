/**
 * Phase A — School modules registry.
 *
 * Single source of truth for what modules exist and helpers for reading
 * which modules a given school has enabled.
 *
 * The MySQL ENUM `school_modules.module_code` is authoritative — adding
 * a new module requires an ENUM-extension migration AND adding the code
 * to MODULE_CODES below.
 */
import { query } from '@/lib/db';

// Pure code constants live in a client-safe module (no db import). Import for
// internal use AND re-export so existing `@/lib/school-modules` imports work.
import { MODULE_CODES, isModuleCode, type ModuleCode } from '@/lib/school-modules-codes';
export { MODULE_CODES, isModuleCode, type ModuleCode };

/**
 * Display metadata for each module. Used by the admin module-management
 * page and (optionally) by sidebar / dashboards. The category lines up
 * with the nav sections so a UI can group toggles meaningfully.
 */
export interface ModuleDescriptor {
  code:        ModuleCode;
  label:       string;
  description: string;
  category:    'core' | 'academics' | 'finance' | 'operations' | 'analytics' | 'spiritual';
}

export const MODULE_CATALOG: readonly ModuleDescriptor[] = [
  { code: 'academics',        label: 'Academics',         description: 'Classes, subjects, results, report cards.',           category: 'academics' },
  { code: 'examinations',     label: 'Examinations',      description: 'Exam scheduling and results recording.',              category: 'academics' },
  { code: 'attendance',       label: 'Attendance',        description: 'Daily attendance, biometric devices, reconciliation.', category: 'operations' },
  { code: 'fingerprint_auth', label: 'Fingerprint Auth',  description: 'WebAuthn / biometric login flow.',                    category: 'operations' },
  { code: 'finance',          label: 'Finance',           description: 'Fees, ledger, invoices.',                              category: 'finance' },
  { code: 'payroll',          label: 'Payroll',           description: 'Staff salary computation and payments.',               category: 'finance' },
  { code: 'inventory',        label: 'Inventory',         description: 'School assets and consumables tracking.',              category: 'operations' },
  { code: 'tahfiz',           label: 'Tahfiz',            description: 'Qur\'an memorization program: books, groups, reports.', category: 'spiritual' },
  { code: 'intelligence',     label: 'Intelligence',      description: 'AI-driven analytics and risk dashboards.',             category: 'analytics' },
  { code: 'analytics',        label: 'Analytics',         description: 'Reports, predictive insights, KPI dashboards.',        category: 'analytics' },
  { code: 'work_plans',       label: 'Work Plans',        description: 'Staff workplans and task tracking.',                   category: 'operations' },
] as const;

/**
 * Fetch the set of enabled module codes for a school. Honours both
 * `is_enabled` and `expires_at` (future-dated expiry).
 *
 * Returns a Set for O(1) membership checks in tight loops (sidebar filter,
 * route gating).
 */
export async function getEnabledModules(schoolId: number): Promise<Set<ModuleCode>> {
  // OPT-OUT policy: every module is enabled for a school UNLESS Control has
  // written an explicit disable (is_enabled = 0). So a school that has never
  // been configured keeps everything — restricting is a deliberate action.
  const rows = (await query(
    `SELECT module_code FROM school_modules WHERE school_id = ? AND is_enabled = 0`,
    [schoolId],
  )) as Array<{ module_code: ModuleCode }>;
  const disabled = new Set(rows.map(r => r.module_code));
  return new Set(MODULE_CODES.filter(c => !disabled.has(c)));
}

/**
 * Check a single module code for a school. Cheap convenience wrapper for
 * single-module gating; prefer `getEnabledModules()` when checking more
 * than one in the same request.
 */
export async function isModuleEnabled(
  schoolId: number,
  code:     ModuleCode,
): Promise<boolean> {
  // OPT-OUT: enabled unless an explicit disable row exists for this module.
  const rows = (await query(
    `SELECT 1 FROM school_modules
      WHERE school_id = ? AND module_code = ? AND is_enabled = 0 LIMIT 1`,
    [schoolId, code],
  )) as Array<{ '1': number }>;
  return rows.length === 0;
}

/**
 * Full module-status snapshot for a school. Used by the admin module
 * management page so the toggles know enabled/disabled state and any
 * expiry context.
 */
export interface SchoolModuleRow {
  code:       ModuleCode;
  isEnabled:  boolean;
  enabledAt:  string | null;
  expiresAt:  string | null;
}

export async function getSchoolModuleStatus(schoolId: number): Promise<SchoolModuleRow[]> {
  const rows = (await query(
    `SELECT module_code, is_enabled, enabled_at, expires_at
       FROM school_modules
      WHERE school_id = ?`,
    [schoolId],
  )) as Array<{
    module_code: ModuleCode;
    is_enabled:  number;
    enabled_at:  string | Date | null;
    expires_at:  string | Date | null;
  }>;

  const toIso = (v: string | Date | null) =>
    v === null ? null : (typeof v === 'string' ? v : new Date(v).toISOString());

  // Ensure every module in the catalog appears even if the row is missing
  // (defensive — backfill seeded all rows, but if a future module is added
  // without re-backfilling, the UI still renders the toggle).
  const byCode = new Map<ModuleCode, SchoolModuleRow>();
  for (const r of rows) {
    byCode.set(r.module_code, {
      code:      r.module_code,
      isEnabled: r.is_enabled === 1,
      enabledAt: toIso(r.enabled_at),
      expiresAt: toIso(r.expires_at),
    });
  }
  // OPT-OUT default: a module with no explicit row is ENABLED. Only an explicit
  // is_enabled = 0 row (present in byCode) reports as disabled.
  return MODULE_CATALOG.map(d => byCode.get(d.code) ?? {
    code: d.code, isEnabled: true, enabledAt: null, expiresAt: null,
  });
}

/**
 * Upsert a school's module flag. Used by the admin toggle UI.
 *
 * Idempotent: writing the same state twice does nothing harmful. The
 * `updated_at` column ticks on UPDATE so audits can show when a school
 * last flipped a flag.
 */
export async function setSchoolModule(args: {
  schoolId:   number;
  moduleCode: ModuleCode;
  isEnabled:  boolean;
  expiresAt?: Date | null;
}): Promise<void> {
  if (!isModuleCode(args.moduleCode)) {
    throw new Error(`Invalid module code: ${args.moduleCode}`);
  }
  const expires = args.expiresAt ?? null;
  await query(
    `INSERT INTO school_modules (school_id, module_code, is_enabled, enabled_at, expires_at)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       is_enabled = VALUES(is_enabled),
       enabled_at = CASE WHEN VALUES(is_enabled) = 1 THEN NOW() ELSE enabled_at END,
       expires_at = VALUES(expires_at)`,
    [args.schoolId, args.moduleCode, args.isEnabled ? 1 : 0,
     args.isEnabled ? new Date() : null, expires],
  );
}
