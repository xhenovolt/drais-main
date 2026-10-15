/**
 * Applying a theme to the page (client only).
 *
 * One place decides the EFFECTIVE theme — personal choice where the user made
 * one, otherwise the school's branding (Settings → Branding), otherwise the
 * DRAIS default — and writes it as CSS variables on an element: <html> for the
 * app, or a preview box on the settings pages (so previews show exactly what
 * Save will do, through the very same code).
 *
 * It also stores the variables for the pre-paint script in the root layout,
 * so a saved theme is in place on the first frame instead of flashing blue.
 */
import { themeVars, fontChoice, normalizeRadius, type RadiusSetting, type ThemeInput } from '@/lib/theme/palette';
import type { DisplaySettings, SchoolTheme } from '@/hooks/useThemeStore';

export const PAINT_KEY = 'drais-theme-paint';

export interface EffectiveTheme {
  input: ThemeInput;
  glass: boolean;
  fontScale: number;
  dark: boolean;
}

export function effectiveTheme(d: Pick<DisplaySettings, 'primary' | 'primaryExplicit' | 'glassMode' | 'radius' | 'font' | 'fontScale'>, school: SchoolTheme | null, dark: boolean): EffectiveTheme {
  const radius: RadiusSetting | null = d.radius === 'school' ? (school?.radius ?? null) : normalizeRadius(d.radius);
  return {
    input: {
      brand: d.primaryExplicit ? d.primary : school?.primary ?? null,
      secondary: school?.secondary ?? null,
      accent: school?.accent ?? null,
      radius,
      font: d.font,
    },
    glass: d.glassMode === 'school' ? !!school?.glass : d.glassMode === 'on',
    fontScale: Number.isFinite(d.fontScale) && d.fontScale > 0 ? d.fontScale : 1,
    dark,
  };
}

/** Set exactly these variables on the element, removing ones a previous theme set. */
export function applyVars(el: HTMLElement, vars: Record<string, string>): void {
  const prev = (el.dataset.themeVars || '').split(',').filter(Boolean);
  for (const k of prev) if (!(k in vars)) el.style.removeProperty(k);
  for (const [k, v] of Object.entries(vars)) el.style.setProperty(k, v);
  el.dataset.themeVars = Object.keys(vars).join(',');
}

const loadedFonts = new Set<string>();
/** Load a Google font the first time it is chosen (or previewed). Offline: the stack's fallbacks apply. */
export function ensureFontLoaded(font: string | null | undefined): void {
  const f = font ? fontChoice(font) : null;
  if (!f?.google || typeof document === 'undefined' || loadedFonts.has(f.id)) return;
  loadedFonts.add(f.id);
  const id = `drais-font-${f.id}`;
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id; link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?family=${f.google}&display=swap`;
  document.head.appendChild(link);
}

/** Apply to <html>: variables, glass flag, text size; remember them for the next first paint. */
export function applyThemeToDocument(t: EffectiveTheme): void {
  const root = document.documentElement;
  const vars = themeVars(t.input);
  applyVars(root, vars);
  root.dataset.glass = t.glass ? 'on' : 'off';
  // Tailwind text sizes are rem, i.e. relative to <html>: scaling it scales every text size.
  root.style.fontSize = t.fontScale === 1 ? '' : `${t.fontScale * 100}%`;
  root.style.setProperty('--font-scale', String(t.fontScale));
  ensureFontLoaded(t.input.font);
  try {
    localStorage.setItem(PAINT_KEY, JSON.stringify({ vars, glass: t.glass, fontScale: t.fontScale, font: t.input.font ?? null }));
  } catch { /* storage blocked — the provider still applies on load */ }
}

/** light | dark | system → is it dark right now. */
export function resolveDark(pref: string | null | undefined): boolean {
  if (pref === 'dark') return true;
  if (pref === 'light') return false;
  return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
}
