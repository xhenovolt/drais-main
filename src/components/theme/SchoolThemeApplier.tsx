'use client';

/**
 * School branding loader (Phase 3).
 *
 * Fetches the school's theme (Settings → Branding) and hands it to the theme
 * store. The ThemeProvider then works out the effective theme — the user's own
 * choices where they made one, otherwise this school branding, otherwise the
 * DRAIS default — and applies it to every screen (lib/theme/apply).
 *
 * It used to inject a <style> that only changed --primary, which almost no
 * screen reads, so a school's colours never showed.
 *
 * Mounted inside the authenticated app shell only — public/print routes keep
 * the neutral default theme.
 */
import { useEffect } from 'react';
import { useThemeStore, type SchoolTheme } from '@/hooks/useThemeStore';
import { normalizeHex, normalizeRadius } from '@/lib/theme/palette';

/** Fetch the school's branding into the theme store. Also called by Settings → Branding after Save. */
export async function refreshSchoolTheme(): Promise<SchoolTheme | null> {
  try {
    const res = await fetch('/api/settings/branding', { cache: 'no-store' });
    if (!res.ok) return null;
    const { theme } = await res.json();
    if (!theme) return null;
    const t: SchoolTheme = {
      primary: normalizeHex(theme.primary_color),
      secondary: normalizeHex(theme.secondary_color),
      accent: normalizeHex(theme.accent_color),
      glass: Number(theme.glass_enabled) === 1,
      // 'lg' is the DRAIS default: no override, so personal choices and the default look match.
      radius: theme.border_radius && theme.border_radius !== 'lg' ? normalizeRadius(theme.border_radius) : null,
    };
    useThemeStore.getState().setSchoolTheme(t);
    return t;
  } catch {
    return null; // network/parse — keep what we had
  }
}

export function SchoolThemeApplier() {
  useEffect(() => {
    // Leftover from the old applier, if a cached page still has it.
    document.getElementById('drais-school-theme')?.remove();
    refreshSchoolTheme();
  }, []);
  return null;
}
