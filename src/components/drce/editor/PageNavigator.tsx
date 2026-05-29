'use client';
/**
 * P5 — page navigator strip shown in the editor when a document is
 * multi-page (or when the user clicks "Enable multi-page" on a single-
 * page template). Compact horizontal pill bar above the canvas:
 *
 *   [Page 1 ●][Page 2][Page 3][+ Add page]
 *
 * Clicking a pill makes that page active; the section list, canvas, and
 * properties panel all operate on the active page from then on. The "+"
 * button opens a tiny prompt to add a named page.
 *
 * Drag-to-reorder is intentionally deferred — page lists are short, the
 * inline ▲▼ buttons are enough for now.
 */
import React from 'react';
import { Plus, Trash2, ChevronUp, ChevronDown, Layers } from 'lucide-react';
import type { DRCEDocument, DRCEMutation } from '@/lib/drce/schema';

interface Props {
  doc: DRCEDocument;
  activePageId: string | null;
  onActivePageChange: (id: string | null) => void;
  onMutate: (m: DRCEMutation) => void;
}

export function PageNavigator({ doc, activePageId, onActivePageChange, onMutate }: Props) {
  const pages = doc.pages ?? [];

  // Single-page template — show only the "Enable multi-page" affordance so
  // the editor doesn't grow chrome unless the user wants it.
  if (!pages.length) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50">
        <Layers size={13} className="text-gray-400" />
        <span className="text-[11px] text-gray-500">Single page</span>
        <button
          type="button"
          onClick={() => {
            onMutate({ type: 'ENABLE_MULTI_PAGE' });
            // Active page is set on the next render once doc.pages exists.
          }}
          className="text-[11px] text-indigo-600 hover:underline"
          title="Convert this template into a multi-page document. Existing sections become Page 1."
        >
          Enable multi-page →
        </button>
      </div>
    );
  }

  function addPage() {
    const name = window.prompt('Name for the new page?', `Page ${pages.length + 1}`);
    if (name === null) return;
    onMutate({ type: 'ADD_PAGE', name: name || undefined, afterId: activePageId ?? null });
  }

  function reorder(direction: 'up' | 'down') {
    if (!activePageId) return;
    const ids = pages.map(p => p.id);
    const i = ids.indexOf(activePageId);
    if (i < 0) return;
    const j = direction === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onMutate({ type: 'REORDER_PAGES', ids });
  }

  function deleteActive() {
    if (!activePageId) return;
    if (pages.length <= 1) { alert('A multi-page document needs at least one page.'); return; }
    if (!window.confirm('Delete this page and everything on it?')) return;
    const i = pages.findIndex(p => p.id === activePageId);
    onMutate({ type: 'DELETE_PAGE', pageId: activePageId });
    // Switch to the previous page (or the first one) after delete.
    const fallback = pages[Math.max(0, i - 1)]?.id ?? pages[0]?.id ?? null;
    onActivePageChange(fallback === activePageId ? null : fallback);
  }

  function renameActive() {
    if (!activePageId) return;
    const current = pages.find(p => p.id === activePageId);
    if (!current) return;
    const next = window.prompt('Rename page', current.name);
    if (next === null) return;
    onMutate({ type: 'SET_PAGE_PROP', pageId: activePageId, prop: 'name', value: next.trim() || current.name });
  }

  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 overflow-x-auto">
      <Layers size={13} className="text-gray-400 flex-shrink-0" />
      <div className="flex items-center gap-1">
        {pages.map(p => {
          const isActive = p.id === activePageId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onActivePageChange(p.id)}
              onDoubleClick={() => isActive && renameActive()}
              className={[
                'inline-flex items-center gap-1 px-2.5 py-1 text-[11px] rounded-md transition-colors whitespace-nowrap',
                isActive
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-slate-900 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-slate-700 hover:border-indigo-300',
              ].join(' ')}
              title={isActive ? 'Active page (double-click to rename)' : `Switch to ${p.name}`}
            >
              <span className="font-medium">{p.name}</span>
              {isActive && <span className="opacity-60 text-[9px]">●</span>}
            </button>
          );
        })}
      </div>

      <div className="w-px h-4 bg-gray-200 dark:bg-slate-700 mx-1" />

      <button type="button" onClick={addPage}
        className="inline-flex items-center gap-1 px-2 py-1 text-[11px] text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded">
        <Plus size={11} /> Add page
      </button>

      {activePageId && (
        <>
          <button type="button" onClick={() => reorder('up')}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
            title="Move active page up">
            <ChevronUp size={12} />
          </button>
          <button type="button" onClick={() => reorder('down')}
            className="p-1 text-gray-400 hover:text-gray-700 hover:bg-gray-100 dark:hover:bg-slate-700 rounded"
            title="Move active page down">
            <ChevronDown size={12} />
          </button>
          <button type="button" onClick={deleteActive}
            className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded"
            title="Delete active page">
            <Trash2 size={12} />
          </button>
        </>
      )}
    </div>
  );
}
