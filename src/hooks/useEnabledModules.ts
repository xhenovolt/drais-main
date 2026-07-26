/**
 * Phase A — client hook for the current school's enabled modules.
 *
 * Components consume this hook to decide whether to render module-gated
 * UI (sidebar items, dashboard cards, action buttons). SWR caches the
 * response so navigating around does not refetch.
 *
 * The server-side gate is `requireModule` in `src/lib/auth/requireModule.ts`
 * — UI hiding alone is insufficient; APIs must enforce the gate too.
 * Phase F wires the gate into every gated route.
 */
import useSWR from 'swr';
import { useMemo } from 'react';
import { MODULE_CODES, type ModuleCode } from '@/lib/school-modules-codes';
import type { ModuleDescriptor } from '@/lib/school-modules';

interface ModuleApiRow {
  code:       ModuleCode;
  isEnabled:  boolean;
  enabledAt:  string | null;
  expiresAt:  string | null;
}

interface ModuleApiResponse {
  success:  boolean;
  schoolId: number;
  catalog:  ModuleDescriptor[];
  modules:  ModuleApiRow[];
}

const fetcher = (url: string) =>
  fetch(url, { credentials: 'same-origin' }).then(r => r.json());

export interface UseEnabledModulesResult {
  isLoading:   boolean;
  error:       Error | null;
  /** Set of currently-enabled module codes. Constant-time membership check. */
  enabled:     Set<ModuleCode>;
  /** Full catalog rows joined with per-school status. Sorted by category. */
  modules:     ModuleApiRow[];
  catalog:     ModuleDescriptor[];
  /** Imperative check: is this module enabled? */
  isEnabled:   (code: ModuleCode) => boolean;
  /** Refetch — call after a toggle write. */
  refresh:     () => void;
}

export function useEnabledModules(): UseEnabledModulesResult {
  const { data, error, isLoading, mutate } = useSWR<ModuleApiResponse>(
    '/api/admin/school-modules',
    fetcher,
    { revalidateOnFocus: false, shouldRetryOnError: false },
  );

  const enabled = useMemo(() => {
    // OPT-OUT: until we know a school's disabled modules, assume ALL are
    // enabled (show everything). The authoritative gate is server-side
    // (requireModule); fail-open here just avoids hiding the sidebar on a
    // slow/failed fetch. Once loaded, the set is "all except explicitly disabled".
    if (!data?.modules) return new Set<ModuleCode>(MODULE_CODES);
    const set = new Set<ModuleCode>();
    for (const m of data.modules) if (m.isEnabled) set.add(m.code);
    return set;
  }, [data]);

  return {
    isLoading,
    error:     error ? (error instanceof Error ? error : new Error(String(error))) : null,
    enabled,
    modules:   data?.modules ?? [],
    catalog:   data?.catalog ?? [],
    isEnabled: (code: ModuleCode) => enabled.has(code),
    refresh:   () => { mutate(); },
  };
}
