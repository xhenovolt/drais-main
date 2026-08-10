'use client';

/**
 * Capacity warning bar — the school-facing half of Phase 7.
 *
 * Plan limits became real in Phase 4: a school at its ceiling is REFUSED when
 * it tries to admit a learner. Discovering that at the counter, with a parent
 * waiting, is the worst possible moment. This warns from 90% so there is a week
 * or two to archive leavers or arrange an upgrade.
 *
 * Deliberately quiet until it matters — below the warning threshold it renders
 * nothing. A bar that is always present is ignored within a week, and then the
 * one time it says something urgent nobody reads it.
 *
 * Sits beside SubscriptionBanner rather than inside it: one warns that the
 * subscription is running out of TIME, this that the plan is running out of
 * ROOM. They can be true at once and the remedies are different.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface Alert {
  key: string; label: string;
  /** Agrees in number with `remaining` — never "1 learners". */
  labelRemaining: string;
  used: number; limit: number; remaining: number; percent: number;
  severity: 'ok' | 'warn' | 'critical' | 'exceeded';
}

export function CapacityBanner() {
  const [worst, setWorst] = useState<Alert | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/school/usage', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setWorst(d?.worst ?? null))
      .catch(() => {});
  }, []);

  if (!worst) return null;
  // "Exceeded" is not dismissible: creation is already failing, so hiding the
  // explanation would leave staff with an error and no cause.
  if (dismissed && worst.severity !== 'exceeded') return null;

  const exceeded = worst.severity === 'exceeded';
  const critical = worst.severity === 'critical';

  const tone = exceeded
    ? 'bg-red-600 text-white'
    : critical
      ? 'bg-orange-500 text-white'
      : 'bg-amber-500 text-white';

  return (
    <div className={`${tone} px-4 py-2 flex items-center gap-2 text-sm`} role="status">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        {exceeded ? (
          <>
            <strong>Your plan is full — {worst.used.toLocaleString()} of {worst.limit.toLocaleString()} {worst.label}.</strong>{' '}
            New records cannot be added. Archive {worst.label} you no longer need, or contact Xhenvolt to upgrade.
          </>
        ) : (
          <>
            <strong>
              {worst.remaining.toLocaleString()} {worst.labelRemaining} remaining on your plan
              {' '}({worst.used.toLocaleString()} of {worst.limit.toLocaleString()}).
            </strong>{' '}
            Once the limit is reached you will not be able to add more. Archive records you no longer need, or
            contact Xhenvolt to upgrade.
          </>
        )}
      </span>
      {!exceeded && (
        <button onClick={() => setDismissed(true)} className="p-1 hover:bg-black/15 rounded" title="Dismiss">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
