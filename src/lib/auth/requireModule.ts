/**
 * Phase A — Module gating helpers.
 *
 * Mirrors the pattern of `requirePermission` from `src/lib/rbac.ts` but
 * checks the per-school module flag instead of a permission code. Phase F
 * wires this into every gated API route (tahfiz, payroll, examinations,
 * fingerprint_auth, etc.). Until then the helpers exist and are tested
 * via the admin module-management page.
 *
 * Super-admin does NOT bypass module gates. A super-admin still represents
 * a single school; if that school has the module disabled, the module
 * stays disabled. (To act across schools, super-admin uses the school-
 * selection flow.) This is a deliberate design choice — module gates
 * model subscription/billing intent, not access control.
 */
import { NextResponse } from 'next/server';
import { isModuleEnabled, type ModuleCode } from '@/lib/school-modules';

/**
 * Throw a structured error if the module is not enabled. Use inside a
 * try/catch route handler that already maps errors to JSON responses.
 */
export async function requireModule(
  schoolId: number,
  code:     ModuleCode,
): Promise<void> {
  const enabled = await isModuleEnabled(schoolId, code);
  if (!enabled) {
    const err: Error & { statusCode?: number; code?: string; module?: string } =
      new Error(`Module '${code}' is not enabled for this school`);
    err.statusCode = 403;
    err.code   = 'MODULE_DISABLED';
    err.module = code;
    throw err;
  }
}

/**
 * Return-based check — yields a 403 NextResponse on failure, or null on
 * success. Preferred when you want to avoid try/catch:
 *
 *   const denied = await checkModule(session.schoolId, 'tahfiz');
 *   if (denied) return denied;
 */
export async function checkModule(
  schoolId: number,
  code:     ModuleCode,
): Promise<NextResponse | null> {
  const enabled = await isModuleEnabled(schoolId, code);
  if (enabled) return null;
  return NextResponse.json(
    {
      error:  `Module '${code}' is not enabled for this school`,
      code:   'MODULE_DISABLED',
      module: code,
    },
    { status: 403 },
  );
}
