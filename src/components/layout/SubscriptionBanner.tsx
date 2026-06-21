'use client';

/**
 * Loud, persistent subscription warning. Shows an amber bar across the app
 * when the school's DRAIS subscription is about to expire (within
 * EXPIRING_SOON_DAYS). Expired accounts are already blocked at the auth layer,
 * so this only ever warns about imminent expiry. Reads /api/auth/me.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export function SubscriptionBanner() {
  const [info, setInfo] = useState<{ expiringSoon?: boolean; daysUntilExpiry?: number | null; subscriptionEndDate?: string | null; trialEndDate?: string | null } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    fetch('/api/auth/me', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInfo(d?.user?.subscription ?? null))
      .catch(() => {});
  }, []);

  if (dismissed || !info?.expiringSoon) return null;
  const days = info.daysUntilExpiry;
  const end = info.subscriptionEndDate || info.trialEndDate;
  const endStr = end ? new Date(end).toLocaleDateString() : null;

  return (
    <div className="bg-amber-500 text-white px-4 py-2 flex items-center gap-2 text-sm">
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span className="flex-1">
        <strong>Subscription expiring{typeof days === 'number' ? ` in ${days} day${days === 1 ? '' : 's'}` : ' soon'}.</strong>{' '}
        {endStr ? `Access ends ${endStr}. ` : ''}Renew now to avoid interruption — contact Xhenvolt or your administrator.
      </span>
      <button onClick={() => setDismissed(true)} className="p-1 hover:bg-amber-600 rounded" title="Dismiss">
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
