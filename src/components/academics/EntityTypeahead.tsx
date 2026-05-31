"use client";
/**
 * EntityTypeahead — a combobox input that accepts free text and offers
 * inline creation when the typed value doesn't yet exist.
 *
 * Use case: results entry + results import. Schools with empty term /
 * subject / result_type tables previously hit a dead end on a hard
 * dropdown — they had to leave the page, create the entity, return.
 * Now they type the name, DRAIS detects "this doesn't exist", offers
 * a "Create &lsquo;<text>&rsquo;" affordance, fires the POST in the
 * background, and auto-selects the result.
 *
 * Loud-fail surface: the parent's onCreate handler is responsible for
 * toasts on success/failure. Returning null from onCreate leaves the
 * input editable so the user can retry.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

export interface TypeaheadOption {
  id: number | string;
  name: string;
}

interface EntityTypeaheadProps<T extends TypeaheadOption> {
  label: string;
  value: T | null;
  onChange: (v: T | null) => void;
  items: T[];
  placeholder?: string;
  disabled?: boolean;
  /** When typed text doesn't match anything, this fires. Resolve to the new option. */
  onCreate?: (typed: string) => Promise<T | null>;
  /** Singular label for the create CTA, e.g. "subject", "term". */
  entityLabel?: string;
  /** Visual variant: themed glass (default) or plain bordered (for forms). */
  variant?: 'glass' | 'plain';
}

export function EntityTypeahead<T extends TypeaheadOption>({
  label,
  value,
  onChange,
  items,
  placeholder = 'Select or type to create…',
  disabled,
  onCreate,
  entityLabel = 'item',
  variant = 'glass',
}: EntityTypeaheadProps<T>) {
  const [query, setQuery] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (value && !open) setQuery(value.name);
    if (!value && !open) setQuery('');
  }, [value, open]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (value) setQuery(value.name);
        else setQuery('');
      }
    }
    if (open) document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, value]);

  const q = query.trim().toLowerCase();
  const matches = q
    ? items.filter(i => i.name.toLowerCase().includes(q))
    : items;
  const exactExists = items.some(i => i.name.toLowerCase() === q);
  const canCreate = !!onCreate && q.length >= 2 && !exactExists;

  async function handleCreate() {
    if (!onCreate || !query.trim()) return;
    const typed = query.trim();
    setCreating(true);
    try {
      const created = await onCreate(typed);
      if (created) {
        onChange(created);
        setQuery(created.name);
        setOpen(false);
      }
    } finally {
      setCreating(false);
    }
  }

  const shellClass = variant === 'plain'
    ? `relative rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-3 py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`
    : `relative rounded-xl border border-white/40 dark:border-white/10 bg-gradient-to-br from-slate-200/40 to-slate-50/20 dark:from-slate-800/60 dark:to-slate-900/40 backdrop-blur px-3 py-2 ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`;

  return (
    <div className="space-y-1" ref={wrapRef}>
      <label className="block text-[11px] font-semibold uppercase tracking-wide mb-1">
        {label}
        {creating && (
          <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            creating in background
          </span>
        )}
      </label>
      <div className={shellClass}>
        <input
          type="text"
          value={query}
          disabled={disabled || creating}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); if (value) onChange(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (matches.length === 1) { onChange(matches[0]); setOpen(false); }
              else if (canCreate) handleCreate();
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          className="flex w-full bg-transparent text-left text-sm font-medium outline-none placeholder:text-slate-400"
        />
        {open && !disabled && (
          <div className="absolute z-30 mt-2 left-0 right-0 max-h-64 overflow-auto rounded-xl border border-white/30 dark:border-white/10 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl shadow-xl p-1 text-sm">
            {matches.length > 0 && matches.slice(0, 50).map(o => (
              <button
                key={o.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o); setQuery(o.name); setOpen(false); }}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 ${value?.id === o.id ? 'text-fuchsia-600 dark:text-fuchsia-400 font-semibold' : ''}`}
              >
                <span className="flex-1 truncate">{o.name}</span>
                {value?.id === o.id && <Check className="w-4 h-4" />}
              </button>
            ))}
            {matches.length === 0 && !canCreate && (
              <div className="px-3 py-4 text-center text-xs text-slate-500">
                {q ? `No ${entityLabel} matches "${query}"` : `No ${entityLabel}s yet — start typing to create one.`}
              </div>
            )}
            {canCreate && (
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleCreate(); }}
                disabled={creating}
                className="w-full mt-1 flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 border border-emerald-200 dark:border-emerald-800 font-semibold"
              >
                {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-base leading-none">＋</span>}
                <span className="flex-1 truncate text-left">
                  Create {entityLabel} <span className="font-bold">&ldquo;{query.trim()}&rdquo;</span>
                  <span className="block text-[10px] font-normal opacity-70">DRAIS will add it now, then continue.</span>
                </span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default EntityTypeahead;
