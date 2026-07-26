/**
 * Client-safe module code constants — NO server imports (no @/lib/db).
 *
 * Split out of school-modules.ts so client components/hooks (e.g. the sidebar's
 * useEnabledModules) can import the code list as a *value* without dragging the
 * database layer into the browser bundle.
 */
export const MODULE_CODES = [
  'academics',
  'finance',
  'payroll',
  'tahfiz',
  'attendance',
  'inventory',
  'examinations',
  'analytics',
  'fingerprint_auth',
  'intelligence',
  'work_plans',
] as const;

export type ModuleCode = (typeof MODULE_CODES)[number];

export function isModuleCode(v: unknown): v is ModuleCode {
  return typeof v === 'string' && (MODULE_CODES as readonly string[]).includes(v);
}
