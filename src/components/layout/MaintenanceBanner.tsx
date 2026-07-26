'use client';

/**
 * Platform maintenance banner (Phase 23). Polls the public maintenance flag and
 * shows a notice to schools during a deploy/migration. In read-only mode it also
 * says writes are paused (the server enforces that in withRoute).
 */
import React from 'react';
import useSWR from 'swr';
import { AlertTriangle } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

export default function MaintenanceBanner() {
  const { data } = useSWR<any>('/api/platform/maintenance', fetcher, { refreshInterval: 60_000, revalidateOnFocus: true });
  const mode = data?.mode;
  if (!mode || mode === 'off') return null;
  const readOnly = mode === 'read_only';
  return (
    <div className={`w-full px-4 py-2 text-sm flex items-center justify-center gap-2 text-center ${readOnly ? 'bg-rose-600 text-white' : 'bg-amber-500 text-amber-950'}`}>
      <AlertTriangle className="w-4 h-4 flex-shrink-0" />
      <span>{data.message || 'Scheduled maintenance in progress.'}{readOnly ? ' Saving is temporarily paused — please try again shortly.' : ''}</span>
    </div>
  );
}
