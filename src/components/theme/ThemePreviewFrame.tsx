'use client';

/**
 * Live preview of a DRAFT theme: an iframe of /theme-preview that applies the
 * theme to its own document with the app's real theming code. Used by
 * Settings → Appearance and Settings → Branding so people see exactly what
 * Save will do before saving.
 */
import React, { useEffect, useRef, useState } from 'react';
import type { EffectiveTheme } from '@/lib/theme/apply';

const DESIGN_WIDTH = 1024;

export default function ThemePreviewFrame({ theme, view = 'full', height = 420, className = '', title = 'Preview' }: {
  theme: EffectiveTheme; view?: 'full' | 'compact'; height?: number; className?: string; title?: string;
}) {
  const ref = useRef<HTMLIFrameElement | null>(null);
  const [ready, setReady] = useState(false);
  // The full preview is laid out like a desktop screen (1024px) and scaled down to fit the column.
  const box = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    if (view !== 'full' || !box.current) return;
    const ro = new ResizeObserver(([e]) => setScale(Math.min(1, e.contentRect.width / DESIGN_WIDTH)));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, [view]);
  const latest = useRef(theme);
  latest.current = theme;

  const post = () => ref.current?.contentWindow?.postMessage({ type: 'drais-theme-preview', theme: latest.current }, window.location.origin);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.source !== ref.current?.contentWindow) return;
      if (e.data?.type === 'drais-theme-preview-ready') { setReady(true); post(); }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  useEffect(() => { if (ready) post(); }, [ready, JSON.stringify(theme)]); // eslint-disable-line react-hooks/exhaustive-deps

  const frame = (
    <iframe
      ref={ref}
      title={title}
      src={`/theme-preview${view === 'compact' ? '?view=compact' : ''}`}
      onLoad={() => post()}
      className="border-0 bg-gray-100 dark:bg-gray-900"
      style={view === 'full'
        ? { width: DESIGN_WIDTH, height: height / scale, transform: `scale(${scale})`, transformOrigin: 'top left' }
        : { width: '100%', height }}
    />
  );
  return (
    <div ref={box} className={`w-full overflow-hidden rounded-xl ring-1 ring-black/5 dark:ring-white/10 ${className}`} style={{ height }}>
      {frame}
    </div>
  );
}
