"use client";
/**
 * Settings → Appearance — personal display settings.
 *
 * Changes are a DRAFT shown in the live preview (the same theming code the app
 * uses, in an isolated frame) and in each option's own example; nothing changes
 * across DRAIS until Save. Discard returns to what is saved.
 *
 * "School" options follow Settings → Branding, so a user who never customises
 * gets the school's look and keeps getting it if the school changes it.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useThemeStore, type DisplaySettings } from '@/hooks/useThemeStore';
import { useI18n } from '@/components/i18n/I18nProvider';
import { Sun, Moon, Monitor, Check, RotateCcw, Languages, Building2, Save, Undo2, Sparkles, School } from 'lucide-react';
import { showToast } from '@/lib/toast';
import useSWR from 'swr';
import ThemePreviewFrame from '@/components/theme/ThemePreviewFrame';
import { effectiveTheme, ensureFontLoaded, resolveDark } from '@/lib/theme/apply';
import { FONT_CHOICES, colorScale, type RadiusSetting } from '@/lib/theme/palette';

const languages = [
  { code: 'en', label: 'English',  native: 'English',   flag: '🇬🇧' },
  { code: 'ar', label: 'Arabic',   native: 'العربية',   flag: '🇸🇦' },
];

const colorPresets = [
  { label: 'Blue',    value: '#2563eb' },
  { label: 'Indigo',  value: '#4f46e5' },
  { label: 'Purple',  value: '#7c3aed' },
  { label: 'Pink',    value: '#db2777' },
  { label: 'Red',     value: '#dc2626' },
  { label: 'Orange',  value: '#ea580c' },
  { label: 'Amber',   value: '#d97706' },
  { label: 'Green',   value: '#16a34a' },
  { label: 'Teal',    value: '#0d9488' },
  { label: 'Cyan',    value: '#0891b2' },
  { label: 'Slate',   value: '#475569' },
];

const fontSizes = [
  { label: 'Smaller', value: 0.9 },
  { label: 'Default', value: 1 },
  { label: 'Larger',  value: 1.1 },
  { label: 'Largest', value: 1.25 },
];

const RADII: { value: RadiusSetting; label: string; px: string }[] = [
  { value: 'none', label: 'Sharp',   px: '0px' },
  { value: 'sm',   label: 'Subtle',  px: '4px' },
  { value: 'md',   label: 'Soft',    px: '6px' },
  { value: 'lg',   label: 'Default', px: '8px' },
  { value: 'xl',   label: 'Rounded', px: '12px' },
];

const section = 'bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5';
const heading = 'text-sm font-semibold text-gray-900 dark:text-white';
const sub = 'text-xs text-gray-500 dark:text-gray-400 mt-0.5 mb-4';
const pick = (active: boolean) => `relative rounded-xl border-2 transition-all text-start ${active
  ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-900/20'
  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'}`;
const ActiveTick = ({ on }: { on: boolean }) => on ? <span className="absolute top-1.5 end-1.5 w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span> : null;

function draftFromStore(s: any): DisplaySettings {
  return {
    themePreference: s.themePreference || 'system', primary: s.primary, primaryExplicit: !!s.primaryExplicit,
    glassMode: s.glassMode || 'school', radius: s.radius || 'school', font: s.font ?? null,
    fontScale: s.fontScale || 1, layoutWidth: s.layoutWidth || 'full',
  };
}

export default function AppearancePage() {
  const store = useThemeStore();
  const { lang, setLang, t } = useI18n();
  const school = store.school;
  const saved = useMemo(() => draftFromStore(store), [store.themePreference, store.primary, store.primaryExplicit, store.glassMode, store.radius, store.font, store.fontScale, store.layoutWidth]); // eslint-disable-line react-hooks/exhaustive-deps
  const [draft, setDraft] = useState<DisplaySettings>(saved);
  useEffect(() => { if (store.hydrated) setDraft(draftFromStore(useThemeStore.getState())); }, [store.hydrated]);
  // Fonts are shown in their own typeface, so load the choices once.
  useEffect(() => { FONT_CHOICES.forEach((f) => ensureFontLoaded(f.id)); }, []);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const set = <K extends keyof DisplaySettings>(k: K, v: DisplaySettings[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const dark = resolveDark(draft.themePreference);
  const preview = effectiveTheme(draft, school, dark);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const save = () => { store.saveDisplaySettings(draft); showToast('success', 'Display settings saved'); };
  const discard = () => setDraft(saved);
  const resetAll = () => {
    if (!confirm('Go back to the default look (your school\'s branding, or the DRAIS default)? You can still Discard before saving.')) return;
    setDraft({ themePreference: 'system', primary: '#2563eb', primaryExplicit: false, glassMode: 'school', radius: 'school', font: null, fontScale: 1, layoutWidth: 'full' });
  };

  const schoolBrand = school?.primary;

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appearance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">How DRAIS looks for you. Try options in the preview, then Save — nothing changes until you do.</p>
        </div>
        <button onClick={resetAll} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <RotateCcw className="w-4 h-4" /> Default look
        </button>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-6 items-start">
        <div className="space-y-5 min-w-0">
          {/* Theme */}
          <section className={section}>
            <h2 className={heading}>Light or dark</h2>
            <p className={sub}>System follows your device and switches with it.</p>
            <div className="grid grid-cols-3 gap-3">
              {([['light', Sun, 'Light'], ['dark', Moon, 'Dark'], ['system', Monitor, 'System']] as const).map(([mode, Icon, label]) => {
                const active = draft.themePreference === mode;
                const d = mode === 'system' ? resolveDark('system') : mode === 'dark';
                return (
                  <button key={mode} onClick={() => set('themePreference', mode)} className={`${pick(active)} p-2`}>
                    <ActiveTick on={active} />
                    <div className={`h-14 rounded-lg mb-2 p-1.5 flex gap-1 ${d ? 'bg-slate-900' : 'bg-slate-100'}`}>
                      <div className={`w-1/4 rounded ${d ? 'bg-slate-800' : 'bg-white'}`} />
                      <div className="flex-1 space-y-1">
                        <div className={`h-2 rounded ${d ? 'bg-slate-700' : 'bg-white'}`} />
                        <div className={`h-5 rounded ${d ? 'bg-slate-800' : 'bg-white'}`} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-sm font-medium text-gray-700 dark:text-gray-200"><Icon className="w-4 h-4" />{label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Brand colour */}
          <section className={section}>
            <h2 className={heading}>Brand colour</h2>
            <p className={sub}>Buttons, links, highlights, the active menu item and progress bars across every screen.</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <button onClick={() => set('primaryExplicit', false)} className={`${pick(!draft.primaryExplicit)} p-2.5`}>
                <ActiveTick on={!draft.primaryExplicit} />
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: schoolBrand || '#2563eb' }}><School className="w-3.5 h-3.5 text-white" /></span>
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{schoolBrand ? 'School colour' : 'DRAIS blue'}</span>
                </div>
                <ColourSample hex={schoolBrand || '#2563eb'} />
              </button>
              {colorPresets.map((c) => {
                const active = draft.primaryExplicit && draft.primary.toLowerCase() === c.value;
                return (
                  <button key={c.value} onClick={() => setDraft((d) => ({ ...d, primary: c.value, primaryExplicit: true }))} className={`${pick(active)} p-2.5`}>
                    <ActiveTick on={active} />
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-full" style={{ background: c.value }} />
                      <span className="text-sm font-medium text-gray-800 dark:text-gray-100">{c.label}</span>
                    </div>
                    <ColourSample hex={c.value} />
                  </button>
                );
              })}
              <label className={`${pick(draft.primaryExplicit && !colorPresets.some((c) => c.value === draft.primary.toLowerCase()))} p-2.5 cursor-pointer`}>
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600" style={{ background: draft.primaryExplicit ? draft.primary : undefined }} />
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100">Custom…</span>
                </div>
                <ColourSample hex={draft.primary} />
                <input type="color" value={draft.primary} onChange={(e) => setDraft((d) => ({ ...d, primary: e.target.value, primaryExplicit: true }))} className="absolute inset-0 opacity-0 cursor-pointer" />
              </label>
            </div>
          </section>

          {/* Glass */}
          <section className={section}>
            <h2 className={heading}>Glass effect</h2>
            <p className={sub}>Frosted, see-through cards and bars over a soft colour background. Menus, pop-ups and forms stay solid so text is always readable.</p>
            <div className="grid grid-cols-3 gap-3">
              {([['school', `School setting (${school?.glass ? 'on' : 'off'})`], ['on', 'On'], ['off', 'Off']] as const).map(([v, label]) => {
                const active = draft.glassMode === v;
                const on = v === 'school' ? !!school?.glass : v === 'on';
                return (
                  <button key={v} onClick={() => set('glassMode', v)} className={`${pick(active)} p-2`}>
                    <ActiveTick on={active} />
                    <GlassSample on={on} hex={preview.input.brand || '#2563eb'} dark={dark} />
                    <div className="text-xs font-medium text-gray-700 dark:text-gray-200 mt-1.5">{label}</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Roundness */}
          <section className={section}>
            <h2 className={heading}>Corners</h2>
            <p className={sub}>How rounded cards, buttons and fields are everywhere.</p>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              <button onClick={() => set('radius', 'school')} className={`${pick(draft.radius === 'school')} p-2`}>
                <ActiveTick on={draft.radius === 'school'} />
                <CornerSample px={RADII.find((r) => r.value === (school?.radius || 'lg'))!.px} />
                <div className="text-[11px] font-medium text-gray-700 dark:text-gray-200 mt-1">School</div>
              </button>
              {RADII.map((r) => (
                <button key={r.value} onClick={() => set('radius', r.value)} className={`${pick(draft.radius === r.value)} p-2`}>
                  <ActiveTick on={draft.radius === r.value} />
                  <CornerSample px={r.px} />
                  <div className="text-[11px] font-medium text-gray-700 dark:text-gray-200 mt-1">{r.label}</div>
                </button>
              ))}
            </div>
          </section>

          {/* Font */}
          <section className={section}>
            <h2 className={heading}>Font</h2>
            <p className={sub}>Used for English text. Arabic text always uses Amiri.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {FONT_CHOICES.map((f) => {
                const active = (draft.font ?? 'system') === f.id;
                return (
                  <button key={f.id} onClick={() => set('font', f.id === 'system' ? null : f.id)} className={`${pick(active)} px-3 py-2.5`} style={{ fontFamily: f.stack }}>
                    <ActiveTick on={active} />
                    <div className="text-sm font-semibold text-gray-800 dark:text-gray-100">{f.label}</div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">Nakato Sarah · S2 East · 1,248 learners</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Text size */}
          <section className={section}>
            <h2 className={heading}>Text size</h2>
            <p className={sub}>Scales all text and spacing that follows it.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {fontSizes.map((s) => {
                const active = Math.abs(draft.fontScale - s.value) < 0.001;
                return (
                  <button key={s.value} onClick={() => set('fontScale', s.value)} className={`${pick(active)} px-3 py-2.5`}>
                    <ActiveTick on={active} />
                    <div className="font-semibold text-gray-800 dark:text-gray-100" style={{ fontSize: `${0.95 * s.value}rem` }}>Aa</div>
                    <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: `${0.75 * s.value}rem` }}>{s.label} · {Math.round(s.value * 100)}%</div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Layout width */}
          <section className={section}>
            <h2 className={heading}>Page width</h2>
            <p className={sub}>On wide screens: use the whole width, or keep pages narrower.</p>
            <div className="grid grid-cols-3 gap-3">
              {([['full', 'Full', 100], ['wide', 'Wide', 86], ['boxed', 'Centred', 66]] as const).map(([v, label, w]) => (
                <button key={v} onClick={() => set('layoutWidth', v)} className={`${pick(draft.layoutWidth === v)} p-2`}>
                  <ActiveTick on={draft.layoutWidth === v} />
                  <div className="h-12 rounded-lg bg-gray-100 dark:bg-gray-900 flex justify-center p-1.5">
                    <div className="h-full rounded bg-white dark:bg-gray-700 flex gap-1 p-1" style={{ width: `${w}%` }}>
                      <div className="w-1/5 rounded-sm bg-gray-200 dark:bg-gray-600" /><div className="flex-1 rounded-sm bg-gray-100 dark:bg-gray-800" />
                    </div>
                  </div>
                  <div className="text-xs font-medium text-gray-700 dark:text-gray-200 mt-1.5">{label}</div>
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Live preview + save */}
        <div className="lg:sticky lg:top-20 space-y-3 min-w-0">
          <div className={section}>
            <div className="flex items-center justify-between mb-3">
              <h2 className={`${heading} flex items-center gap-1.5`}><Sparkles className="w-4 h-4 text-blue-600" /> Preview</h2>
              <span className={`text-[11px] px-2 py-0.5 rounded-full ${dirty ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400'}`}>{dirty ? 'Not saved yet' : 'This is your saved look'}</span>
            </div>
            <ThemePreviewFrame theme={preview} height={360} />
            <div className="flex flex-wrap items-center gap-2 mt-4">
              <button onClick={save} disabled={!dirty} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold disabled:opacity-40">
                <Save className="w-4 h-4" /> Save
              </button>
              <button onClick={discard} disabled={!dirty} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-40">
                <Undo2 className="w-4 h-4" /> Discard
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">Saved on this device for your account.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Language */}
      <div className="max-w-3xl mt-8 space-y-5">
      <section className={section}>
        <div className="flex items-center gap-2 mb-4">
          <Languages className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {t('settings.language')}
          </h2>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
          {lang === 'ar'
            ? 'يتم تطبيق التغيير على كامل النظام فورًا. تتحول الواجهة إلى اتجاه RTL تلقائيًا للعربية.'
            : 'Changes apply instantly across the entire system. The interface flips to RTL automatically for Arabic.'}
        </p>
        <div className="grid grid-cols-2 gap-3">
          {languages.map((l) => {
            const active = lang === l.code;
            return (
              <button
                key={l.code}
                onClick={() => {
                  setLang(l.code);
                  showToast('success', l.code === 'ar' ? 'تم تغيير اللغة' : 'Language changed');
                }}
                className={`flex items-center gap-3 px-4 py-3 rounded-lg border-2 transition-all text-left ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <span className="text-2xl">{l.flag}</span>
                <div className="flex-1">
                  <div className={`text-sm font-semibold ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                    {l.native}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">{l.label}</div>
                </div>
                {active && <Check className="w-4 h-4 text-indigo-600" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* School default language (Phase 6) */}
      <SchoolDefaultLocaleCard lang={lang} t={t} />
      </div>

      {/* Sticky save bar while there are unsaved changes (the preview's buttons can scroll away on phones). */}
      {dirty && (
        <div className="fixed bottom-16 lg:bottom-4 inset-x-3 lg:inset-x-auto lg:end-6 z-40 flex items-center gap-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-gray-800 shadow-xl px-4 py-2.5">
          <span className="text-sm text-gray-700 dark:text-gray-200">You have unsaved display changes</span>
          <button onClick={discard} className="text-sm text-gray-500 hover:text-gray-800 dark:hover:text-gray-100">Discard</button>
          <button onClick={save} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold"><Save className="w-4 h-4" /> Save</button>
        </div>
      )}
    </div>
  );
}

/** A tiny button + link in this colour (inline styles: an example must not depend on the current theme). */
function ColourSample({ hex }: { hex: string }) {
  const sc = colorScale(hex);
  return (
    <div className="flex items-center gap-1.5 mt-2">
      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold text-white" style={{ background: hex }}>Save</span>
      <span className="px-1.5 py-0.5 rounded-md text-[10px] font-medium" style={{ background: sc[100], color: sc[700] }}>Tag</span>
      <span className="text-[10px] font-medium underline" style={{ color: sc[700] }}>Link</span>
    </div>
  );
}

function GlassSample({ on, hex, dark }: { on: boolean; hex: string; dark: boolean }) {
  const sc = colorScale(hex);
  const bg = on
    ? `radial-gradient(circle at 15% 20%, ${sc[300]}, transparent 60%), radial-gradient(circle at 90% 90%, ${sc[200]}, transparent 55%), ${dark ? '#0f172a' : '#f1f5f9'}`
    : dark ? '#111827' : '#f3f4f6';
  return (
    <div className="h-16 rounded-lg p-2 flex items-end" style={{ background: bg }}>
      <div className="w-full h-9 rounded-md border" style={on
        ? { background: dark ? 'rgb(15 23 42 / .5)' : 'rgb(255 255 255 / .55)', borderColor: dark ? 'rgb(255 255 255 / .1)' : 'rgb(255 255 255 / .8)', boxShadow: '0 6px 16px -8px rgb(0 0 0 / .35)' }
        : { background: dark ? '#1f2937' : '#ffffff', borderColor: dark ? '#374151' : '#e5e7eb' }} />
    </div>
  );
}

function CornerSample({ px }: { px: string }) {
  return (
    <div className="h-12 flex flex-col items-center justify-center gap-1">
      <div className="w-12 h-6 border-2 border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-900" style={{ borderRadius: px }} />
      <div className="w-8 h-2.5 bg-blue-600" style={{ borderRadius: px === '0px' ? '0px' : `calc(${px} / 1.5)` }} />
    </div>
  );
}

// ─── School default language (Phase 6) ────────────────────────────────────────
// Lets a school admin pick the language that brand-new users see on first
// sign-in. NULL = no preference (app falls back to 'en'). User-level
// localStorage override always wins, so picking 'ar' here will NOT yank
// existing users out of English mid-session.
function SchoolDefaultLocaleCard({ lang, t }: { lang: string; t: (k: string) => string }) {
  const { data, mutate, isLoading } = useSWR<{ school: { default_locale: 'en' | 'ar' | null } }>(
    '/api/school-config',
    (u: string) => fetch(u).then(r => r.json()),
  );
  const current = data?.school?.default_locale ?? null;
  const [saving, setSaving] = React.useState(false);

  async function set(value: 'en' | 'ar' | null) {
    setSaving(true);
    try {
      const res = await fetch('/api/school-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ default_locale: value }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        showToast('error', e?.error || (lang === 'ar' ? 'فشل الحفظ' : 'Failed to save'));
        return;
      }
      await mutate();
      showToast('success', lang === 'ar' ? 'تم تحديث الإعداد المدرسي' : 'School default updated');
    } finally {
      setSaving(false);
    }
  }

  const options: Array<{ value: 'en' | 'ar' | null; label: string; sub: string }> = [
    { value: null, label: lang === 'ar' ? 'بلا تفضيل' : 'No preference',
      sub: lang === 'ar' ? 'يفترض النظام الإنجليزية' : 'Falls back to English' },
    { value: 'en', label: 'English',  sub: lang === 'ar' ? 'لكل مستخدم جديد' : 'For every new user' },
    { value: 'ar', label: 'العربية', sub: lang === 'ar' ? 'لكل مستخدم جديد' : 'For every new user' },
  ];

  return (
    <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center gap-2 mb-4">
        <Building2 className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
          {lang === 'ar' ? 'اللغة الافتراضية للمدرسة' : 'School default language'}
        </h2>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
        {lang === 'ar'
          ? 'يُطبَّق هذا الإعداد على المستخدمين الذين لم يختاروا لغة بعد. اختيار المستخدم الشخصي يبقى محفوظًا في جهازه ولا يُغيَّر.'
          : "Applied to users who haven't picked a language yet. Each user's personal choice stays in their browser and is never overridden."}
      </p>
      {isLoading ? (
        <div className="text-xs text-gray-400">{t('common.loading')}</div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {options.map(opt => {
            const active = current === opt.value;
            return (
              <button
                key={String(opt.value)}
                onClick={() => set(opt.value)}
                disabled={saving || active}
                className={`flex flex-col items-start gap-1 px-3 py-3 rounded-lg border-2 transition-all text-start ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 disabled:opacity-60'
                }`}
              >
                <div className="flex items-center gap-2 w-full">
                  <span className={`text-sm font-semibold flex-1 ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-900 dark:text-white'}`}>
                    {opt.label}
                  </span>
                  {active && <Check className="w-4 h-4 text-indigo-600" />}
                </div>
                <span className="text-[11px] text-gray-500 dark:text-gray-400">{opt.sub}</span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
