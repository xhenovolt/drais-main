'use client';
/**
 * Collapsible filter panel: powerful filtering without a wall of controls.
 *
 * Collapsed, it shows one line — "Filters · 3 active" — plus removable chips for what is applied, so
 * nothing important is hidden. Expanded, it shows the controls in a responsive grid with
 * "Clear" and (optional) "Apply". Keyboard and screen-reader friendly (button + aria-expanded/controls).
 */
import React, { useId, useState } from 'react';
import { ChevronDown, Filter, X } from 'lucide-react';

export interface FilterChip { key: string; label: string; onRemove: () => void }

export default function FilterAccordion({
  chips, onClear, onApply, defaultOpen = false, children, title = 'Filters',
}: {
  chips: FilterChip[];
  onClear: () => void;
  /** When provided an "Apply" button is shown (for panels whose inputs are staged, not live). */
  onApply?: () => void;
  defaultOpen?: boolean;
  children: React.ReactNode;
  title?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  const active = chips.length;

  return (
    <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <button
          type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls={id}
          className="inline-flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-100"
        >
          <Filter className="w-4 h-4 text-gray-500" />
          {title}
          <span className="text-gray-400">•</span>
          <span className={active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-500'}>{active ? `${active} active` : 'none'}</span>
          <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>

        {!open && chips.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 text-xs px-2 py-0.5">
            {c.label}
            <button type="button" onClick={c.onRemove} aria-label={`Remove filter ${c.label}`} className="hover:text-indigo-900 dark:hover:text-white">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}

        {active > 0 && !open && (
          <button type="button" onClick={onClear} className="ml-auto text-xs text-gray-500 hover:text-gray-800 dark:hover:text-gray-200 underline">Clear</button>
        )}
      </div>

      {open && (
        <div id={id} className="border-t border-gray-200 dark:border-gray-700 px-3 py-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">{children}</div>
          <div className="flex justify-end gap-2 mt-3">
            <button type="button" onClick={onClear} className="px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200">Clear</button>
            {onApply && (
              <button type="button" onClick={() => { onApply(); setOpen(false); }} className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">Apply filters</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Labelled field wrapper so every filter control looks and reads the same. */
export function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  );
}

export const filterInputCls =
  'w-full px-2 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100';
