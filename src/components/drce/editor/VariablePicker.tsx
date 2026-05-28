"use client";
/**
 * DRCE — Variable picker.
 *
 * A floating catalogue of available expressions: computed fields,
 * aggregators, and formatters (from /api/drce/expression/evaluate). Clicking
 * any item inserts the matching token at the caret of the most recently
 * focused <input>/<textarea>. Avoids the school having to memorise the
 * expression language.
 *
 * Drop one of these anywhere in the editor; it tracks the last-focused input
 * via the global focusin/focusout events.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Loader2 } from 'lucide-react';

type Group = 'computed' | 'aggregators' | 'formatters';

interface ComputedItem  { name: string; group: string; description?: string }
interface Catalogue     {
  computed:    ComputedItem[];
  aggregators: string[];
  formatters:  string[];
}

const SAMPLE_INSERT: Record<string, string> = {
  // computed → just the name as a {token}
  // aggregators → call form with results path
  // formatters → pipe-suffix
};

export function VariablePicker() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [catalogue, setCatalogue] = useState<Catalogue | null>(null);
  const [tab, setTab] = useState<Group>('computed');
  const [filter, setFilter] = useState('');
  const lastFocused = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Track the last focused text input — that's where insertions land.
  useEffect(() => {
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement;
      if (!t) return;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        const input = t as HTMLInputElement | HTMLTextAreaElement;
        const ttype = (input as HTMLInputElement).type;
        // Skip non-text inputs (color, number, checkbox…) where token insertion
        // doesn't make sense.
        if (input.tagName === 'TEXTAREA' || !ttype || ttype === 'text' || ttype === 'search') {
          lastFocused.current = input;
        }
      }
    };
    window.addEventListener('focusin', onFocusIn);
    return () => window.removeEventListener('focusin', onFocusIn);
  }, []);

  useEffect(() => {
    if (!open || catalogue) return;
    setLoading(true);
    fetch('/api/drce/expression/evaluate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expression: '{report_title}' }),
    })
      .then(r => r.json())
      .then(data => {
        if (data?.catalog) setCatalogue(data.catalog);
      })
      .finally(() => setLoading(false));
  }, [open, catalogue]);

  function insert(token: string) {
    const el = lastFocused.current;
    if (!el) { setOpen(false); return; }
    const start = el.selectionStart ?? el.value.length;
    const end   = el.selectionEnd   ?? el.value.length;
    const next = el.value.slice(0, start) + token + el.value.slice(end);
    // React-controlled inputs need a native setter to register the change.
    const setter = Object.getOwnPropertyDescriptor(
      el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    // Place caret after the inserted token
    const caret = start + token.length;
    requestAnimationFrame(() => { el.setSelectionRange?.(caret, caret); el.focus(); });
  }

  const items = (() => {
    if (!catalogue) return [];
    const q = filter.trim().toLowerCase();
    if (tab === 'computed') {
      return catalogue.computed
        .filter(c => !q || c.name.toLowerCase().includes(q) || c.group.toLowerCase().includes(q))
        .map(c => ({ label: c.name, token: `{${c.name}}`, hint: `${c.group}${c.description ? ' — ' + c.description : ''}` }));
    }
    if (tab === 'aggregators') {
      return catalogue.aggregators
        .filter(n => !q || n.toLowerCase().includes(q))
        .map(n => ({ label: `${n}(…)`, token: `{${n}(results, "score")}`, hint: 'Aggregator over a path' }));
    }
    return catalogue.formatters
      .filter(n => !q || n.toLowerCase().includes(q))
      .map(n => ({ label: `| ${n}`, token: ` | ${n}`, hint: 'Formatter pipe (paste at end of an expression)' }));
  })();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        title="Insert a variable / computed / formatter"
        className="inline-flex items-center gap-1 px-2 py-1.5 rounded-md text-xs font-medium text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/40"
      >
        <Sparkles className="w-3.5 h-3.5" />
        Insert variable
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-[80] w-80 bg-white dark:bg-slate-900 rounded-xl shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-200">Insert variable</span>
            <button onClick={() => setOpen(false)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-800 text-gray-400">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex border-b border-gray-100 dark:border-slate-800">
            {(['computed', 'aggregators', 'formatters'] as Group[]).map(g => (
              <button
                key={g}
                onClick={() => setTab(g)}
                className={`flex-1 px-2 py-1.5 text-[11px] font-semibold capitalize transition-colors ${
                  tab === g
                    ? 'border-b-2 border-indigo-500 text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                {g}
              </button>
            ))}
          </div>

          <input
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="Filter…"
            className="w-full px-3 py-1.5 text-xs bg-gray-50 dark:bg-slate-800 border-b border-gray-100 dark:border-slate-800 focus:outline-none"
          />

          <div className="max-h-72 overflow-y-auto">
            {loading && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading…
              </div>
            )}
            {!loading && items.length === 0 && (
              <p className="px-3 py-4 text-xs text-gray-400 text-center">No matches</p>
            )}
            {items.map((it, i) => (
              <button
                key={i}
                type="button"
                onClick={() => insert(it.token)}
                className="w-full text-left px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 border-b border-gray-50 dark:border-slate-800"
              >
                <code className="text-[11px] font-mono text-indigo-600">{it.token}</code>
                {it.hint && <p className="text-[10px] text-gray-500 mt-0.5 truncate">{it.hint}</p>}
              </button>
            ))}
          </div>
          {!lastFocused.current && (
            <div className="px-3 py-2 text-[10px] text-amber-600 bg-amber-50 dark:bg-amber-900/20">
              Click a text field first, then pick a variable to insert.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
