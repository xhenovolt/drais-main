"use client";
import React from 'react';
import { useThemeStore } from '@/hooks/useThemeStore';
import { Sun, Moon, Monitor, Check, RotateCcw } from 'lucide-react';
import { showToast } from '@/lib/toast';

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

const fontFamilies = [
  { label: 'Inter (Default)', value: 'Inter, system-ui, sans-serif' },
  { label: 'System UI',       value: 'system-ui, -apple-system, sans-serif' },
  { label: 'Roboto',          value: 'Roboto, sans-serif' },
  { label: 'Poppins',         value: 'Poppins, sans-serif' },
  { label: 'Nunito',          value: 'Nunito, sans-serif' },
  { label: 'Segoe UI',        value: "'Segoe UI', Tahoma, Geneva, sans-serif" },
  { label: 'Monospace',       value: "'JetBrains Mono', 'Fira Code', monospace" },
];

const fontSizes = [
  { label: 'Small',  value: 0.875 },
  { label: 'Medium', value: 1 },
  { label: 'Large',  value: 1.125 },
];

const borderRadii = [
  { label: 'Sharp',    value: 'none',  preview: 'rounded-none' },
  { label: 'Subtle',   value: 'sm',    preview: 'rounded-sm' },
  { label: 'Medium',   value: 'md',    preview: 'rounded-md' },
  { label: 'Rounded',  value: 'lg',    preview: 'rounded-lg' },
  { label: 'Pill',     value: 'full',  preview: 'rounded-full' },
];

export default function AppearancePage() {
  const store = useThemeStore();

  const currentRadius = (store as any).borderRadius || 'lg';
  const setBorderRadius = (v: string) => {
    useThemeStore.setState({ borderRadius: v } as any);
  };

  const handleReset = () => {
    store.resetTheme();
    showToast('success', 'Theme reset to defaults');
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Appearance</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Customize the look and feel of DRAIS. Changes apply instantly.</p>
        </div>
        <button onClick={handleReset} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
          <RotateCcw className="w-4 h-4" /> Reset
        </button>
      </div>

      {/* Theme Mode */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Theme</h2>
        <div className="grid grid-cols-3 gap-3">
          {[
            { mode: 'light', icon: Sun, label: 'Light' },
            { mode: 'dark', icon: Moon, label: 'Dark' },
            { mode: 'system', icon: Monitor, label: 'System' },
          ].map(({ mode, icon: Icon, label }) => {
            const active = store.mode === mode || (mode === 'system' && !(store as any)._hasExplicitMode);
            return (
              <button
                key={mode}
                onClick={() => {
                  if (mode === 'system') {
                    const sys = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    store.setMode(sys);
                  } else {
                    store.setMode(mode);
                  }
                }}
                className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                <Icon className={`w-6 h-6 ${active ? 'text-indigo-600 dark:text-indigo-400' : 'text-gray-400'}`} />
                <span className={`text-sm font-medium ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-600 dark:text-gray-400'}`}>{label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Primary Color */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Brand Color</h2>
        <div className="flex flex-wrap gap-3">
          {colorPresets.map(c => (
            <button
              key={c.value}
              onClick={() => store.setPrimary(c.value)}
              className={`relative w-10 h-10 rounded-full border-2 transition-all ${
                store.primary === c.value ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
              }`}
              style={{ backgroundColor: c.value }}
              title={c.label}
            >
              {store.primary === c.value && (
                <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" />
              )}
            </button>
          ))}
          {/* Custom color picker */}
          <label className="relative w-10 h-10 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 cursor-pointer hover:border-gray-400 transition-colors flex items-center justify-center" title="Custom color">
            <span className="text-xs text-gray-400">#</span>
            <input
              type="color"
              value={store.primary}
              onChange={e => store.setPrimary(e.target.value)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>
        {/* Preview bar */}
        <div className="mt-4 h-2 rounded-full" style={{ backgroundColor: store.primary }} />
      </section>

      {/* Font Family */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Font Family</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {fontFamilies.map(f => {
            const active = store.fontFamily === f.value;
            return (
              <button
                key={f.value}
                onClick={() => store.setFontFamily?.(f.value)}
                className={`px-3 py-2.5 rounded-lg text-sm font-medium border transition-all text-left ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
                style={{ fontFamily: f.value }}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* Font Size */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">Font Size</h2>
        <div className="grid grid-cols-3 gap-3">
          {fontSizes.map(s => {
            const active = store.fontScale === s.value;
            return (
              <button
                key={s.value}
                onClick={() => store.setFontScale(s.value)}
                className={`py-3 rounded-lg text-sm font-medium border-2 transition-all ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300'
                }`}
              >
                <span style={{ fontSize: `${s.value}rem` }}>{s.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Border Radius */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-4">UI Roundness</h2>
        <div className="grid grid-cols-5 gap-3">
          {borderRadii.map(r => {
            const active = currentRadius === r.value;
            return (
              <button
                key={r.value}
                onClick={() => setBorderRadius(r.value)}
                className={`flex flex-col items-center gap-2 py-3 border-2 transition-all ${r.preview} ${
                  active
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                }`}
              >
                <div className={`w-8 h-8 bg-gray-300 dark:bg-gray-600 ${r.preview}`} />
                <span className={`text-xs font-medium ${active ? 'text-indigo-700 dark:text-indigo-300' : 'text-gray-500'}`}>{r.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Glass Effect Toggle */}
      <section className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Glass Effect</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Apply frosted glass look to panels and sidebar</p>
          </div>
          <button
            onClick={() => store.toggleGlass()}
            className={`relative w-11 h-6 rounded-full transition-colors ${store.glass ? 'bg-indigo-600' : 'bg-gray-300 dark:bg-gray-600'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${store.glass ? 'translate-x-5' : ''}`} />
          </button>
        </div>
      </section>
    </div>
  );
}
