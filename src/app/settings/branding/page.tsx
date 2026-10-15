'use client';

/**
 * School branding settings (Phase 3). School admins set the institution's
 * primary/secondary/accent colours, corners, glass on/off and logo.
 * Saved to school_theme_settings and applied to everyone in the school as the
 * baseline theme (a user's personal Appearance choices still override theirs).
 *
 * The preview is the real app theming (ThemePreviewFrame) showing the draft as
 * someone who follows the school's branding will see it; Save applies it at once.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, RotateCcw, Save, Palette, Sun, Moon, Undo2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import ThemePreviewFrame from '@/components/theme/ThemePreviewFrame';
import { refreshSchoolTheme } from '@/components/theme/SchoolThemeApplier';
import { effectiveTheme } from '@/lib/theme/apply';
import { normalizeHex, normalizeRadius, colorScale } from '@/lib/theme/palette';
import { useThemeStore } from '@/hooks/useThemeStore';

interface Theme {
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  logo_url: string | null;
  glass_enabled: number;
  border_radius: string;
  button_style: string;
  card_style: string;
  sidebar_style: string;
  report_branding: string;
  receipt_branding: string;
}

const DEFAULTS: Theme = {
  primary_color: '#2563eb', secondary_color: '#7c3aed', accent_color: '#0ea5e9', logo_url: null,
  glass_enabled: 0, border_radius: 'lg', button_style: 'solid', card_style: 'elevated',
  sidebar_style: 'solid', report_branding: 'logo', receipt_branding: 'logo',
};
const RADII: { value: string; label: string; px: string }[] = [
  { value: 'none', label: 'Sharp', px: '0px' },
  { value: 'sm', label: 'Subtle', px: '4px' },
  { value: 'md', label: 'Soft', px: '6px' },
  { value: 'lg', label: 'Default', px: '8px' },
  { value: 'xl', label: 'Rounded', px: '12px' },
];
const COLOURS: { key: 'primary_color' | 'secondary_color' | 'accent_color'; label: string; help: string }[] = [
  { key: 'primary_color', label: 'Primary colour', help: 'Buttons, links, the active menu item, highlights and progress bars.' },
  { key: 'secondary_color', label: 'Secondary colour', help: 'Second accents: gradients, secondary badges and charts.' },
  { key: 'accent_color', label: 'Accent colour', help: 'Small touches that use the accent token.' },
];
const PRESETS = ['#2563eb', '#7c3aed', '#0ea5e9', '#059669', '#16a34a', '#dc2626', '#d97706', '#0f766e', '#be123c', '#1e293b'];

const card = 'rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800';

export default function BrandingPage() {
  const [theme, setTheme] = useState<Theme>(DEFAULTS);
  const [saved, setSaved] = useState<Theme>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const appDark = useThemeStore((s) => s.mode === 'dark');
  const [previewDark, setPreviewDark] = useState(appDark);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/branding');
        if (res.ok) {
          const { theme: t } = await res.json();
          const loaded: Theme = {
            ...DEFAULTS, ...t,
            primary_color: t.primary_color || DEFAULTS.primary_color,
            secondary_color: t.secondary_color || DEFAULTS.secondary_color,
            accent_color: t.accent_color || DEFAULTS.accent_color,
            glass_enabled: Number(t.glass_enabled) === 1 ? 1 : 0,
            border_radius: normalizeRadius(t.border_radius) || 'lg',
          };
          setTheme(loaded); setSaved(loaded);
        }
      } catch { /* keep defaults */ } finally { setLoading(false); }
    })();
  }, []);

  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme((t) => ({ ...t, [k]: v }));
  const dirty = JSON.stringify(theme) !== JSON.stringify(saved);
  const badColour = COLOURS.find((c) => theme[c.key] && !normalizeHex(theme[c.key]));

  // As seen by someone who follows the school's branding (no personal overrides).
  const preview = useMemo(() => effectiveTheme(
    { primary: '#2563eb', primaryExplicit: false, glassMode: 'school', radius: 'school', font: null, fontScale: 1 },
    {
      primary: normalizeHex(theme.primary_color), secondary: normalizeHex(theme.secondary_color), accent: normalizeHex(theme.accent_color),
      glass: theme.glass_enabled === 1, radius: theme.border_radius !== 'lg' ? normalizeRadius(theme.border_radius) : null,
    },
    previewDark,
  ), [theme, previewDark]);

  async function save() {
    if (badColour) { toast.error(`${badColour.label} is not a valid colour (use #RRGGBB).`); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/settings/branding', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(theme),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      setSaved(theme);
      await refreshSchoolTheme(); // apply now, no reload
      toast.success('School branding saved and applied.');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function reset() {
    if (!confirm('Reset this school to the default DRAIS look?')) return;
    setSaving(true);
    try {
      await fetch('/api/settings/branding', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEFAULTS, primary_color: null, secondary_color: null, accent_color: null, logo_url: null }),
      });
      setTheme(DEFAULTS); setSaved(DEFAULTS);
      await refreshSchoolTheme();
      toast.success('Reset to the DRAIS default.');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading branding…</div>;
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Palette className="w-6 h-6" /> School Branding
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your institution&apos;s look — applied to everyone in the school. People can still change their own look in Appearance.
          </p>
        </div>
        <button onClick={reset} disabled={saving}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
          <RotateCcw className="w-4 h-4" /> Reset to DRAIS default
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-6 items-start">
        <div className="space-y-4 min-w-0">
          {COLOURS.map(({ key, label, help }) => {
            const v = theme[key] || '#000000';
            const valid = !!normalizeHex(v);
            const sc = valid ? colorScale(v) : null;
            return (
              <div key={key} className={card}>
                <div className="text-sm font-semibold text-slate-900 dark:text-white">{label}</div>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{help}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <input type="color" value={valid ? normalizeHex(v)! : '#000000'} onChange={(e) => set(key, e.target.value)}
                    className="w-12 h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent cursor-pointer" />
                  <input type="text" value={theme[key] || ''} onChange={(e) => set(key, e.target.value)}
                    placeholder="#2563eb"
                    className={`w-28 px-2 py-1.5 rounded-md border bg-white dark:bg-slate-900 text-sm font-mono ${valid ? 'border-slate-300 dark:border-slate-600' : 'border-red-400'}`} />
                  <div className="flex flex-wrap gap-1.5">
                    {PRESETS.map((c) => (
                      <button key={c} title={c} onClick={() => set(key, c)}
                        className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow"
                        style={{ background: c, outline: theme[key]?.toLowerCase() === c ? '2px solid currentColor' : 'none' }} />
                    ))}
                  </div>
                </div>
                {sc && (
                  <div className="mt-3 flex overflow-hidden rounded-md" title="The shades generated from this colour">
                    {[50, 100, 200, 300, 400, 500, 600, 700, 800, 900].map((s) => <span key={s} className="h-4 flex-1" style={{ background: sc[s] }} />)}
                  </div>
                )}
              </div>
            );
          })}

          <div className={`${card} space-y-4`}>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Corners</div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">How rounded cards, buttons and fields are.</p>
              <div className="grid grid-cols-5 gap-2">
                {RADII.map((r) => (
                  <button key={r.value} onClick={() => set('border_radius', r.value)}
                    className={`p-2 rounded-lg border-2 ${theme.border_radius === r.value ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30' : 'border-slate-200 dark:border-slate-700'}`}>
                    <div className="h-8 flex items-center justify-center"><div className="w-10 h-6 border-2 border-slate-400 bg-slate-50 dark:bg-slate-900" style={{ borderRadius: r.px }} /></div>
                    <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{r.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-start justify-between gap-3 cursor-pointer">
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">Glass effect</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Frosted, see-through cards and bars over a soft colour background. Menus and forms stay solid.</span>
              </span>
              <input type="checkbox" checked={theme.glass_enabled === 1}
                onChange={(e) => set('glass_enabled', e.target.checked ? 1 : 0)} className="w-5 h-5 mt-1 accent-blue-600 shrink-0" />
            </label>
            <div>
              <label className="block text-sm font-semibold text-slate-900 dark:text-white mb-2">Logo URL (optional)</label>
              <input type="text" value={theme.logo_url || ''} onChange={(e) => set('logo_url', e.target.value || null)}
                placeholder="https://…/logo.png"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" />
            </div>
          </div>
        </div>

        <div className="lg:sticky lg:top-20 min-w-0">
          <div className={card}>
            <div className="flex items-center justify-between mb-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Preview</div>
              <div className="flex gap-1 bg-slate-100 dark:bg-slate-900 rounded-lg p-0.5">
                <button onClick={() => setPreviewDark(false)} className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 ${!previewDark ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}><Sun className="w-3.5 h-3.5" /> Light</button>
                <button onClick={() => setPreviewDark(true)} className={`px-2 py-1 rounded-md text-xs flex items-center gap-1 ${previewDark ? 'bg-white dark:bg-slate-700 shadow-sm' : 'text-slate-500'}`}><Moon className="w-3.5 h-3.5" /> Dark</button>
              </div>
            </div>
            <ThemePreviewFrame theme={preview} height={360} />
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={save} disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-40">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save for the school
              </button>
              <button onClick={() => setTheme(saved)} disabled={saving || !dirty}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 disabled:opacity-40">
                <Undo2 className="w-4 h-4" /> Discard
              </button>
              <span className={`text-xs ${dirty ? 'text-amber-600 dark:text-amber-400' : 'text-slate-500 dark:text-slate-400'}`}>{dirty ? 'Not saved yet' : 'Saved'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
