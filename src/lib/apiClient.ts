/**
 * src/lib/apiClient.ts
 * Global fetch wrapper — ALL client-side API calls MUST go through apiFetch.
 * Direct fetch() is forbidden.
 *
 * Guarantees:
 *   ✅ Success toast on every successful mutation
 *   ✅ Error toast on every failure (network or API)
 *   ✅ Consistent JSON parsing
 *   ✅ Throws on failure so callers can handle
 *
 * Usage:
 *   import { apiFetch } from '@/lib/apiClient';
 *   const data = await apiFetch('/api/staff/add', { method: 'POST', body: formData });
 */
import { showToast } from '@/lib/toast';

interface ApiFetchOptions extends RequestInit {
  /** Suppress the automatic success toast (e.g. for background fetches) */
  silent?: boolean;
  /** Custom success message override */
  successMessage?: string;
}

/**
 * The single, mandatory fetch wrapper for all client-side API calls.
 * - Shows error toast on network failure
 * - Shows error toast on non-ok response
 * - Shows success toast on mutation success (POST/PUT/DELETE/PATCH)
 * - Returns the JSON body typed as T (handles both `{ success, data }` and flat payloads)
 */
export async function apiFetch<T = any>(
  input: RequestInfo | URL,
  init?: ApiFetchOptions
): Promise<T> {
  const { silent, successMessage, ...fetchInit } = init || {};
  let res: Response;

  try {
    res = await fetch(input, { credentials: 'include', ...fetchInit });
  } catch (e) {
    showToast('error', 'Network error. Check your connection.');
    throw e;
  }

  let data: any;
  try {
    data = await res.json();
  } catch {
    showToast('error', 'Invalid server response');
    throw new Error('Invalid JSON response');
  }

  if (!res.ok || data.success === false) {
    const msg = data?.error?.message || data?.message || data?.error || 'Operation failed';
    showToast('error', typeof msg === 'string' ? msg : 'Operation failed');
    const err = new Error(typeof msg === 'string' ? msg : 'Operation failed') as Error & { code?: string; status?: number };
    err.code = data?.error?.code;
    err.status = res.status;
    throw err;
  }

  // Show success toast for mutations only (not GET reads), unless silenced
  if (!silent) {
    const method = (fetchInit.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      showToast('success', successMessage || data.message || 'Success');
    }
  }

  return data as T;
}

/**
 * SWR-compatible fetcher that uses apiFetch.
 * Returns the full API response (e.g. { success, message, data }).
 * Pages access .data themselves: staffData?.data || []
 */
export const swrFetcher = async (url: string) => {
  return apiFetch(url, { silent: true });
};
