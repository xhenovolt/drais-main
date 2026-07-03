'use client';

/**
 * School branding settings (Phase 3). School admins set the institution's
 * primary/secondary/accent colours, corner radius, glass on/off and logo.
 * Saved to school_theme_settings and applied to everyone in the school as the
 * baseline theme (a user's personal appearance choice still overrides theirs).
 */
import React, { useEffect, useState } from 'react';
import { Loader2, RotateCcw, Save, Palette } from 'lucide-react';
import { toast } from 'react-hot-toast';

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
  glass_enabled: 1, border_radius: 'lg', button_style: 'solid', card_style: 'elevated',
  sidebar_style: 'solid', report_branding: 'logo', receipt_branding: 'logo',
};
const RADIUS: Record<string, string> = { none: '0px', sm: '2px', md: '6px', lg: '10px', full: '24px' };

const PRESETS = ['#2563eb', '#7c3aed', '#0ea5e9', '#059669', '#dc2626', '#d97706', '#0f766e', '#be123c', '#1e293b'];

export default function BrandingPage() {
  const [theme, setTheme] = useState<Theme>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/settings/branding');
        if (res.ok) {
          const { theme: t } = await res.json();
          setTheme({ ...DEFAULTS, ...t, primary_color: t.primary_color || DEFAULTS.primary_color,
            secondary_color: t.secondary_color || DEFAULTS.secondary_color, accent_color: t.accent_color || DEFAULTS.accent_color });
        }
      } catch { /* keep defaults */ } finally { setLoading(false); }
    })();
  }, []);

  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setTheme((t) => ({ ...t, [k]: v }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch('/api/settings/branding', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(theme),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to save');
      toast.success('School branding saved. Reload to see it everywhere.');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  async function reset() {
    if (!confirm('Reset this school to the default DRAIS theme?')) return;
    setSaving(true);
    try {
      await fetch('/api/settings/branding', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...DEFAULTS, primary_color: null, secondary_color: null, accent_color: null, logo_url: null }),
      });
      setTheme(DEFAULTS);
      toast.success('Reset to DRAIS default.');
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  }

  if (loading) {
    return <div className="p-6 flex items-center gap-2 text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> Loading branding…</div>;
  }

  const radius = RADIUS[theme.border_radius] || '10px';

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Palette className="w-6 h-6" /> School Branding
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Your institution identity — applied to everyone in the school. Personal appearance choices still override per user.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} disabled={saving}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">
            <RotateCcw className="w-4 h-4" /> Reset
          </button>
          <button onClick={save} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-60">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Controls */}
        <div className="space-y-5">
          {(['primary_color', 'secondary_color', 'accent_color'] as const).map((key) => (
            <div key={key} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                {key.replace('_color', '').replace(/^\w/, (c) => c.toUpperCase())} colour
              </label>
              <div className="flex items-center gap-3">
                <input type="color" value={theme[key] || '#000000'} onChange={(e) => set(key, e.target.value)}
                  className="w-12 h-10 rounded-md border border-slate-300 dark:border-slate-600 bg-transparent cursor-pointer" />
                <input type="text" value={theme[key] || ''} onChange={(e) => set(key, e.target.value)}
                  placeholder="#2563eb"
                  className="w-28 px-2 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm font-mono" />
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((c) => (
                    <button key={c} title={c} onClick={() => set(key, c)}
                      className="w-6 h-6 rounded-full border-2 border-white dark:border-slate-700 shadow"
                      style={{ background: c, outline: theme[key] === c ? '2px solid currentColor' : 'none' }} />
                  ))}
                </div>
              </div>
            </div>
          ))}

          <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 bg-white dark:bg-slate-800 space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Corner radius</label>
              <div className="flex gap-2">
                {Object.keys(RADIUS).map((r) => (
                  <button key={r} onClick={() => set('border_radius', r)}
                    className={`px-3 py-1.5 text-sm rounded-md border ${theme.border_radius === r ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300' : 'border-slate-300 dark:border-slate-600'}`}>
                    {r}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Glass / transparency effects</span>
              <input type="checkbox" checked={theme.glass_enabled === 1}
                onChange={(e) => set('glass_enabled', e.target.checked ? 1 : 0)} className="w-5 h-5 accent-blue-600" />
            </label>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">Logo URL (optional)</label>
              <input type="text" value={theme.logo_url || ''} onChange={(e) => set('logo_url', e.target.value || null)}
                placeholder="https://…/logo.png"
                className="w-full px-3 py-2 rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-sm" />
            </div>
          </div>
        </div>

        {/* Live preview */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-5 bg-slate-50 dark:bg-slate-900"
          style={{ borderRadius: radius }}>
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-4">Live preview</p>
          <div className="space-y-3">
            <div className="flex gap-2">
              <button className="px-4 py-2 text-sm font-semibold text-white shadow" style={{ background: theme.primary_color || '#2563eb', borderRadius: radius }}>Primary</button>
              <button className="px-4 py-2 text-sm font-semibold text-white shadow" style={{ background: theme.secondary_color || '#7c3aed', borderRadius: radius }}>Secondary</button>
              <button className="px-4 py-2 text-sm font-semibold text-white shadow" style={{ background: theme.accent_color || '#0ea5e9', borderRadius: radius }}>Accent</button>
            </div>
            <div className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm"
              style={{ borderRadius: radius, backdropFilter: theme.glass_enabled ? 'blur(8px)' : undefined }}>
              <div className="font-semibold text-slate-900 dark:text-white">Sample card</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Cards, buttons and highlights use your brand colours.</div>
              <div className="mt-3 flex gap-2">
                <span className="px-2 py-0.5 text-xs rounded-full text-white" style={{ background: theme.primary_color || '#2563eb' }}>Badge</span>
                <span className="px-2 py-0.5 text-xs rounded-full border" style={{ borderColor: theme.accent_color || '#0ea5e9', color: theme.accent_color || '#0ea5e9' }}>Outline</span>
              </div>
            </div>
            <div className="h-2 rounded-full" style={{ background: `linear-gradient(90deg, ${theme.primary_color}, ${theme.accent_color})` }} />
          </div>
        </div>
      </div>
    </div>
  );
}
