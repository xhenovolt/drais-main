'use client';
/**
 * P4 — caller-side mirror of /api/drce/capabilities, used by the editor to
 * decide which workflow buttons to render and whether to switch into
 * read-only mode. SWR caches per session; the editor calls this once per
 * mount and reuses the result.
 */
import useSWR from 'swr';
import type { DRCECapabilities } from '@/lib/drce/workflow';

const ALL_FALSE: DRCECapabilities = {
  view: false, edit: false, approve: false, publish: false, admin: false,
};

const fetcher = (url: string) => fetch(url).then(r => r.ok ? r.json() : { capabilities: ALL_FALSE });

export function useDRCECapabilities(): DRCECapabilities {
  const { data } = useSWR<{ capabilities: DRCECapabilities }>(
    '/api/drce/capabilities',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  return data?.capabilities ?? ALL_FALSE;
}
