import React from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * A small set of screens (Timetable/ClassSubjects/Results managers,
 * Payroll definitions, Terms progress/reports/requirements, Events,
 * Documents, Departments, Finance wallets/payments/ledger/fee managers)
 * call a legacy PHP backend (NEXT_PUBLIC_PHP_API_BASE) that does not
 * exist in this deployment — DRAIS is Next.js end-to-end. This is
 * pre-existing tech debt on every platform (Vercel, Electron, Android),
 * not something introduced by or specific to Android packaging.
 *
 * Rather than a raw failed fetch (infinite loading spinner, blank
 * section, or a console error the user never sees an explanation for),
 * screens that hit this backend render this instead, so the failure is
 * visible and understood rather than silently swallowed or unbounded.
 */
export function BackendUnavailableNotice({ feature }: { feature?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
      <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span>
        {feature ? `${feature} isn't available yet` : "This feature isn't available yet"}
        {' — '}it depends on a backend that hasn't been migrated to this platform.
      </span>
    </div>
  );
}
