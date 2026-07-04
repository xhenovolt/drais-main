'use client';

/**
 * School branding applier (Phase 3).
 *
 * Fetches the school's theme once and injects it as a <style> that overrides
 * the DRAIS default design tokens. Precedence, low → high:
 *   1. token defaults in globals.css (:root / html.dark)
 *   2. THIS school <style> (both light + dark, so brand colour is consistent)
 *   3. the user's personal choice (inline styles set on <html> by ThemeProvider)
 * so a school brand shows for everyone who hasn't personally customised, and a
 * personal choice still wins for that user.
 *
 * Mounted inside the authenticated app shell only — public/print routes keep
 * the neutral default theme.
 */
import { useEffect } from 'react';

const STYLE_ID = 'drais-school-theme';
const RADIUS: Record<string, string> = { none: '0px', sm: '2px', md: '6px', lg: '8px', full: '9999px' };

interface Theme {
  primary_color?: string | null;
  secondary_color?: string | null;
  accent_color?: string | null;
  glass_enabled?: number | boolean;
  border_radius?: string | null;
}

export function SchoolThemeApplier() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/settings/branding');
        if (!res.ok || cancelled) return;
        const { theme } = (await res.json()) as { theme?: Theme };
        if (!theme || cancelled) return;

        const decls: string[] = [];
        if (theme.primary_color) decls.push(`--primary:${theme.primary_color};--color-primary:${theme.primary_color};--ring:${theme.primary_color};`);
        if (theme.secondary_color) decls.push(`--secondary:${theme.secondary_color};`);
        if (theme.accent_color) decls.push(`--accent:${theme.accent_color};`);
        if (theme.border_radius && RADIUS[theme.border_radius]) decls.push(`--radius:${RADIUS[theme.border_radius]};`);

        const css = decls.length ? `:root,html.dark{${decls.join('')}}` : '';
        let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
        if (css) {
          if (!el) { el = document.createElement('style'); el.id = STYLE_ID; document.head.appendChild(el); }
          el.textContent = css;
        } else {
          el?.remove();
        }
        // School glass preference: only a default (Phase 6 policy keeps glass
        // readable + reversible). Apply it as data-glass so a school that turns
        // glass off gets solid surfaces; the personal toggle (ThemeProvider) is
        // set after hydration and takes precedence for that user.
        if (theme.glass_enabled === 0 || theme.glass_enabled === false) {
          if (!document.documentElement.dataset.glass) document.documentElement.dataset.glass = 'off';
        }
      } catch { /* network/parse — keep default theme */ }
    })();
    return () => { cancelled = true; };
  }, []);

  return null;
}
