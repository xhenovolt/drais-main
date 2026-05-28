"use client";
/**
 * Renders a `block_ref` section when the document was fetched in UNRESOLVED
 * form (typical for the editor — the live preview). The print/render path
 * fetches with ?resolved=1 so the renderer never sees a block_ref.
 *
 * In the editor we show a lightweight placeholder pill so authors can see
 * "this is where shared block #X plugs in" without the editor calling out to
 * fetch the block content on every paint. Click "Open library" to navigate
 * to the block management screen (future).
 */
import React from 'react';
import { Library } from 'lucide-react';
import type { DRCEBlockRefSection as Section, DRCESection } from '@/lib/drce/schema';

export function BlockRefSection({ section }: { section: Section }) {
  return (
    <div
      className="my-1 px-3 py-2 rounded-lg border border-dashed border-indigo-300 dark:border-indigo-700 bg-indigo-50/60 dark:bg-indigo-900/20 text-xs text-indigo-700 dark:text-indigo-300 inline-flex items-center gap-2"
      data-drce-block-ref={section.block_id}
    >
      <Library className="w-3.5 h-3.5" />
      <span>
        Shared block <strong>#{section.block_id}</strong> — inlined at render time
      </span>
    </div>
  );
}

export function defaultBlockRef(): Omit<DRCESection, 'id' | 'order'> {
  return { type: 'block_ref', visible: true, block_id: 0 } as Omit<DRCESection, 'id' | 'order'>;
}
