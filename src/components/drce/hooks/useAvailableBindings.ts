'use client';
/**
 * P1 — bindings hook that merges the static DRCE catalogue with the school's
 * live custom-field set, so every new field defined at /admin/custom-fields
 * shows up automatically in:
 *   • the variable picker
 *   • column / field / cell binding dropdowns
 *   • the comment-rules editor
 *
 * The custom fields are fetched once per session and reused via SWR; refresh
 * happens on focus when needed. Failure is non-fatal — the static catalogue
 * is always returned.
 */
import useSWR from 'swr';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';

export interface BindingEntry { group: string; binding: string; label: string }

interface CustomFieldRow {
  code: string; label: string;
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.ok ? r.json() : { fields: [] }).catch(() => ({ fields: [] }));

export function useAvailableBindings(): BindingEntry[] {
  const { data } = useSWR<{ fields: CustomFieldRow[] }>(
    '/api/admin/custom-fields?entity_type=student&active_only=1',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const customEntries: BindingEntry[] = (data?.fields ?? []).map(f => ({
    group:   'Custom Field',
    binding: `student.custom.${f.code}`,
    label:   f.label,
  }));

  return [...AVAILABLE_BINDINGS, ...customEntries];
}
