/**
 * Theme → CSS variables. PURE (no DOM), shared by the live app, the settings
 * previews and the pre-paint script.
 *
 * Why this exists: Tailwind v4 compiles every colour and radius utility to a
 * CSS variable (`bg-blue-600` → `var(--color-blue-600)`, `rounded-lg` →
 * `var(--radius-lg)`, `text-sm` → `var(--text-sm)` in rem). DRAIS's screens use
 * those utilities directly — ~5,700 blue/indigo classes and ~6,100 rounded-*
 * classes — while the old theme code only changed `--primary` and an unused
 * `--app-border-radius`. So picking "Green" changed almost nothing.
 *
 * Re-pointing the palette variables instead re-themes every screen at once:
 * the brand colour becomes the blue + indigo families (DRAIS's brand hues), the
 * secondary colour becomes violet + purple, and the roundness setting rescales
 * every radius step.
 */

export type RadiusSetting = 'none' | 'sm' | 'md' | 'lg' | 'xl';
export const RADIUS_SETTINGS: RadiusSetting[] = ['none', 'sm', 'md', 'lg', 'xl'];

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const;
// Tailwind v4 blue, used as the lightness/chroma profile every brand colour follows.
const TW_L: Record<number, number> = { 50: 0.97, 100: 0.932, 200: 0.882, 300: 0.809, 400: 0.707, 500: 0.623, 600: 0.546, 700: 0.488, 800: 0.424, 900: 0.379, 950: 0.282 };
const TW_C: Record<number, number> = { 50: 0.014, 100: 0.032, 200: 0.059, 300: 0.105, 400: 0.165, 500: 0.214, 600: 0.245, 700: 0.243, 800: 0.199, 900: 0.146, 950: 0.091 };

export function normalizeHex(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(s)) return s;
  if (/^#[0-9a-f]{3}$/.test(s)) return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`;
  return null;
}

/** sRGB hex → OKLCH (L 0–1, C, H degrees). */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const n = normalizeHex(hex) ?? '#2563eb';
  const lin = (x: number) => { const v = x / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const r = lin(parseInt(n.slice(1, 3), 16)), g = lin(parseInt(n.slice(3, 5), 16)), b = lin(parseInt(n.slice(5, 7), 16));
  const l_ = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m_ = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s_ = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l_ + 0.793617785 * m_ - 0.0040720468 * s_;
  const A = 1.9779984951 * l_ - 2.428592205 * m_ + 0.4505937099 * s_;
  const B = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.808675766 * s_;
  const c = Math.sqrt(A * A + B * B);
  let h = (Math.atan2(B, A) * 180) / Math.PI; if (h < 0) h += 360;
  return { l: L, c, h };
}

const fmt = (l: number, c: number, h: number) => `oklch(${(l * 100).toFixed(1)}% ${c.toFixed(3)} ${h.toFixed(1)})`;

/**
 * An 11-step palette (50…950) for a colour, shaped like Tailwind's own: shade
 * 600 is the colour itself, lighter steps rise toward near-white and darker
 * steps fall toward near-black on the same hue, with Tailwind's chroma curve.
 */
export function colorScale(hex: string): Record<number, string> {
  const n = normalizeHex(hex);
  if (!n) return {};
  const { l, c, h } = hexToOklch(n);
  const out: Record<number, string> = {};
  for (const s of SHADES) {
    if (s === 600) { out[s] = n; continue; }
    let L: number;
    if (s < 600) { const f = (TW_L[s] - TW_L[600]) / (0.97 - TW_L[600]); L = l + f * (0.975 - l); }
    else { const f = (TW_L[600] - TW_L[s]) / (TW_L[600] - 0.282); L = l - f * (l - 0.26); }
    const C = Math.min(0.37, c * (TW_C[s] / TW_C[600]));
    out[s] = fmt(Math.max(0, Math.min(1, L)), C, h);
  }
  return out;
}

/** Every radius step, per roundness setting. 'lg' = Tailwind's own values (no override). */
const RADIUS_SCALES: Record<RadiusSetting, Record<string, string> | null> = {
  none: { xs: '0px', sm: '0px', md: '0px', lg: '0px', xl: '0px', '2xl': '0px', '3xl': '0px', '4xl': '0px' },
  sm: { xs: '1px', sm: '2px', md: '3px', lg: '4px', xl: '6px', '2xl': '8px', '3xl': '10px', '4xl': '12px' },
  md: { xs: '2px', sm: '3px', md: '5px', lg: '6px', xl: '9px', '2xl': '12px', '3xl': '16px', '4xl': '20px' },
  lg: null,
  xl: { xs: '4px', sm: '6px', md: '9px', lg: '12px', xl: '16px', '2xl': '22px', '3xl': '28px', '4xl': '36px' },
};

/** Legacy stored values ('full' was "Pill") → current settings. */
export function normalizeRadius(v: unknown): RadiusSetting | null {
  if (v === 'full') return 'xl';
  return RADIUS_SETTINGS.includes(v as RadiusSetting) ? (v as RadiusSetting) : null;
}

/** Fonts the settings offer, with the Google Fonts family to load (null = installed on the device). */
export const FONT_CHOICES: { id: string; label: string; stack: string; google: string | null }[] = [
  { id: 'system', label: 'System default', stack: "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif", google: null },
  { id: 'inter', label: 'Inter', stack: "Inter, system-ui, 'Segoe UI', Arial, sans-serif", google: 'Inter:wght@400;500;600;700' },
  { id: 'roboto', label: 'Roboto', stack: 'Roboto, system-ui, Arial, sans-serif', google: 'Roboto:wght@400;500;700' },
  { id: 'poppins', label: 'Poppins', stack: 'Poppins, system-ui, Arial, sans-serif', google: 'Poppins:wght@400;500;600;700' },
  { id: 'nunito', label: 'Nunito', stack: 'Nunito, system-ui, Arial, sans-serif', google: 'Nunito:wght@400;600;700' },
  { id: 'source-serif', label: 'Source Serif (book style)', stack: "'Source Serif 4', Georgia, Cambria, serif", google: 'Source+Serif+4:wght@400;600;700' },
  { id: 'mono', label: 'Monospace', stack: "'JetBrains Mono', 'Fira Code', Consolas, monospace", google: 'JetBrains+Mono:wght@400;600' },
];

/** Stored font values (a font id, or a CSS stack from older versions) → a choice. */
export function fontChoice(v: unknown) {
  const s = String(v ?? '');
  return FONT_CHOICES.find((f) => f.id === s)
    ?? FONT_CHOICES.find((f) => s && s.toLowerCase().startsWith(f.stack.split(',')[0].replace(/'/g, '').toLowerCase()))
    ?? FONT_CHOICES.find((f) => /^inter\b/i.test(s) && f.id === 'inter')
    ?? null;
}

export interface ThemeInput {
  /** Brand colour → blue + indigo families, --primary, focus rings. Null = DRAIS default blue. */
  brand?: string | null;
  /** Secondary colour → violet + purple families. */
  secondary?: string | null;
  /** Accent colour → --accent token. */
  accent?: string | null;
  radius?: RadiusSetting | null;
  /** Font id from FONT_CHOICES. Null = the app default. */
  font?: string | null;
}

/** All CSS custom properties for a theme. Keys not returned should be removed from the target. */
export function themeVars(t: ThemeInput): Record<string, string> {
  const vars: Record<string, string> = {};
  const brand = normalizeHex(t.brand);
  if (brand) {
    const sc = colorScale(brand);
    for (const fam of ['blue', 'indigo']) for (const s of SHADES) vars[`--color-${fam}-${s}`] = sc[s];
    vars['--primary'] = brand; vars['--color-primary'] = brand; vars['--ring'] = brand;
  }
  const secondary = normalizeHex(t.secondary);
  if (secondary) {
    const sc = colorScale(secondary);
    for (const fam of ['violet', 'purple']) for (const s of SHADES) vars[`--color-${fam}-${s}`] = sc[s];
    vars['--secondary'] = secondary; vars['--color-secondary'] = secondary;
  }
  const accent = normalizeHex(t.accent);
  if (accent) { vars['--accent'] = accent; vars['--color-accent'] = accent; }
  const r = t.radius ? RADIUS_SCALES[t.radius] : null;
  if (r) { for (const [k, v] of Object.entries(r)) vars[`--radius-${k}`] = v; vars['--radius'] = r.lg; }
  const f = t.font ? fontChoice(t.font) : null;
  if (f) { vars['--font-sans'] = `'Amiri', ${f.stack}`; vars['--app-font'] = vars['--font-sans']; vars['--app-font-family'] = f.stack; }
  return vars;
}
