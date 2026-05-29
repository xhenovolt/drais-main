'use client';
/**
 * Soft-warning layer for document-kind defaults.
 *
 * Office/Canva-style: when the active document doesn't fit the conventions
 * for its declared kind (a portrait certificate, an A4 ID card, a letter
 * with no header section, …), this layer surfaces a dismissible banner
 * with a one-click *Fix it* action. **Nothing is blocked.** The user is
 * always free to ignore an advisory.
 *
 * Rules are intentionally derived from the kind catalog's `expects{}`
 * block — so adding a new built-in kind automatically gets advisory
 * coverage without touching this file. School-defined kinds with no
 * expectations declared simply have no advisories.
 */
import React, { useMemo, useState } from 'react';
import { AlertTriangle, X, Wrench } from 'lucide-react';
import type { DRCEDocument, DRCEMutation } from '@/lib/drce/schema';
import { findKind } from '@/lib/drce/kinds';

interface Advisory {
  id:        string;
  message:   string;
  fixLabel?: string;
  fix?:      () => DRCEMutation;
}

interface Props {
  doc:      DRCEDocument;
  onMutate: (m: DRCEMutation) => void;
}

export function KindAdvisories({ doc, onMutate }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const advisories = useMemo(() => buildAdvisories(doc), [doc]);
  const visible = advisories.filter(a => !dismissed.has(a.id));

  if (!visible.length) return null;

  return (
    <div className="flex flex-col gap-1.5 px-3 py-2 border-b border-amber-200 dark:border-amber-900/40 bg-amber-50/70 dark:bg-amber-900/10">
      {visible.map(a => (
        <div key={a.id} className="flex items-center gap-2 text-[11px]">
          <AlertTriangle size={12} className="text-amber-600 flex-shrink-0" />
          <span className="text-amber-800 dark:text-amber-300 flex-1">{a.message}</span>
          {a.fix && a.fixLabel && (
            <button
              type="button"
              onClick={() => { const m = a.fix!(); onMutate(m); setDismissed(s => new Set(s).add(a.id)); }}
              className="inline-flex items-center gap-1 text-amber-800 dark:text-amber-200 hover:underline font-medium"
            >
              <Wrench size={10} /> {a.fixLabel}
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(s => new Set(s).add(a.id))}
            className="p-0.5 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded"
            title="Dismiss for this session"
          >
            <X size={11} />
          </button>
        </div>
      ))}
    </div>
  );
}

function buildAdvisories(doc: DRCEDocument): Advisory[] {
  const kind = findKind(doc.meta.document_kind);
  const expects = kind.expects ?? {};
  const out: Advisory[] = [];

  if (expects.pageSize && doc.theme.pageSize !== expects.pageSize) {
    out.push({
      id:       `pageSize:${expects.pageSize}`,
      message:  `${kind.label}s are typically ${expects.pageSize.toUpperCase()}, but this one is ${doc.theme.pageSize?.toUpperCase() ?? 'A4'}.`,
      fixLabel: `Switch to ${expects.pageSize.toUpperCase()}`,
      fix:      () => ({ type: 'SET_THEME', path: 'pageSize', value: expects.pageSize }),
    });
  }
  if (expects.orientation && doc.theme.orientation !== expects.orientation) {
    out.push({
      id:       `orientation:${expects.orientation}`,
      message:  `${kind.label}s are usually ${expects.orientation}; this document is ${doc.theme.orientation ?? 'portrait'}.`,
      fixLabel: `Rotate to ${expects.orientation}`,
      fix:      () => ({ type: 'SET_THEME', path: 'orientation', value: expects.orientation }),
    });
  }
  if (expects.suggestedSections?.length) {
    // Flatten section types across top-level + every page so a multi-page
    // doc with the suggested section deeper in the tree doesn't trigger.
    const presentTypes = new Set<string>();
    const walk = (arr: { type: string; children?: unknown[] }[] | undefined) => {
      for (const s of arr ?? []) {
        presentTypes.add(s.type);
        if (s.type === 'container') walk((s as unknown as { children?: { type: string }[] }).children as never);
      }
    };
    walk(doc.sections as never);
    for (const p of doc.pages ?? []) walk(p.sections as never);
    const missing = expects.suggestedSections.filter(t => !presentTypes.has(t));
    if (missing.length) {
      out.push({
        id:      `missing:${missing.join(',')}`,
        message: `${kind.label}s usually include ${missing.join(', ')}. None found in this document.`,
        // No one-click fix — adding sections requires the user's choice.
      });
    }
  }
  return out;
}
