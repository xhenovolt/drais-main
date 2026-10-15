'use client';

/**
 * Display-settings preview — rendered in an <iframe> by Settings → Appearance
 * and Settings → Branding.
 *
 * The parent posts a DRAFT theme ({ type: 'drais-theme-preview', theme }) and
 * this page applies it to its own <html> with the same code the real app uses
 * (lib/theme/apply), so the preview is exactly what Save will produce — light or
 * dark, glass or solid — independent of the theme the parent page is showing.
 *
 * The sample uses the same Tailwind utilities real DRAIS screens use
 * (bg-blue-600, rounded-xl, bg-white cards…), which is the point: it proves the
 * settings reach ordinary screens, not just a few themed components.
 *
 * ?view=compact shows a single card (used for the per-setting examples).
 */
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LayoutDashboard, Users, CalendarCheck, Wallet, Settings, Search, Bell, Check, TrendingUp } from 'lucide-react';
import { applyVars, ensureFontLoaded, type EffectiveTheme } from '@/lib/theme/apply';
import { themeVars } from '@/lib/theme/palette';

function applyDraft(t: EffectiveTheme) {
  const root = document.documentElement;
  root.classList.toggle('dark', t.dark);
  applyVars(root, themeVars(t.input));
  root.dataset.glass = t.glass ? 'on' : 'off';
  root.style.fontSize = t.fontScale === 1 ? '' : `${t.fontScale * 100}%`;
  ensureFontLoaded(t.input.font);
}

function Preview() {
  const view = useSearchParams().get('view');
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.origin !== window.location.origin || e.data?.type !== 'drais-theme-preview') return;
      applyDraft(e.data.theme as EffectiveTheme);
      setReady(true);
    };
    window.addEventListener('message', onMsg);
    window.parent?.postMessage({ type: 'drais-theme-preview-ready' }, window.location.origin);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  if (view === 'compact') {
    return (
      <div className={`app-backdrop min-h-screen p-3 bg-gray-50 dark:bg-gray-900 ${ready ? '' : 'opacity-0'}`}>
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
          <div className="text-sm font-semibold text-gray-900 dark:text-white">Senior 2 East</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">42 learners · 38 present</div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden mb-3"><div className="h-full w-[90%] bg-blue-600 rounded-full" /></div>
          <div className="flex gap-2">
            <button className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold">Save</button>
            <button className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 text-xs text-gray-700 dark:text-gray-200">Cancel</button>
            <span className="ms-auto self-center text-xs text-blue-600 dark:text-blue-400 font-medium">View all</span>
          </div>
        </div>
      </div>
    );
  }

  const nav = [
    { icon: LayoutDashboard, label: 'Dashboard', active: true },
    { icon: Users, label: 'Students' },
    { icon: CalendarCheck, label: 'Attendance' },
    { icon: Wallet, label: 'Finance' },
    { icon: Settings, label: 'Settings' },
  ];
  return (
    <div className={`app-backdrop min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 ${ready ? '' : 'opacity-0'}`}>
      <div data-surface="topbar" className="h-12 flex items-center gap-3 px-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="font-bold text-blue-700 dark:text-blue-400">DRAIS</span>
        <div className="flex-1 max-w-xs flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-xs text-gray-500"><Search className="w-3.5 h-3.5" /> Search learners…</div>
        <Bell className="w-4 h-4 text-gray-500 ms-auto" />
        <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-[11px] font-bold flex items-center justify-center">AK</span>
      </div>
      <div className="flex flex-1 min-h-0">
        <aside data-surface="sidebar" className="w-44 shrink-0 p-2 space-y-0.5 bg-white dark:bg-slate-900 border-e border-slate-200 dark:border-slate-800">
          {nav.map(({ icon: I, label, active }) => (
            <div key={label} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm ${active ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-medium' : 'text-slate-600 dark:text-slate-400'}`}>
              <I className="w-4 h-4" /> {label}
            </div>
          ))}
        </aside>
        <main className="flex-1 p-4 space-y-3 overflow-hidden">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold">Good morning, Amina</h1>
              <p className="text-xs text-gray-500 dark:text-gray-400">Here is today at your school.</p>
            </div>
            <div className="flex gap-2">
              <button className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-xs font-medium bg-white dark:bg-gray-800">Export</button>
              <button className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold shadow-sm">Add learner</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[['Learners', '1,248', '+12 this term'], ['Present today', '1,163', '93%'], ['Fees collected', 'UGX 84.2M', '71% of target']].map(([k, v, d]) => (
              <div key={k} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm">
                <div className="text-[11px] text-gray-500 dark:text-gray-400">{k}</div>
                <div className="text-xl font-bold mt-0.5">{v}</div>
                <div className="text-[11px] text-green-600 dark:text-green-400 flex items-center gap-1 mt-0.5"><TrendingUp className="w-3 h-3" />{d}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-[1.4fr_1fr] gap-3">
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
              <div className="px-3 py-2 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
                <span className="text-sm font-semibold">Recent arrivals</span>
                <span className="text-xs text-blue-600 dark:text-blue-400 font-medium">View all</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr><th className="text-start px-3 py-1.5 font-medium">Learner</th><th className="text-start px-3 py-1.5 font-medium">Class</th><th className="text-start px-3 py-1.5 font-medium">Status</th></tr></thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {[['Nakato Sarah', 'S2 East', 'On time', 'green'], ['Okello Brian', 'S1 West', 'Late', 'amber'], ['Achieng Joy', 'S3 North', 'On time', 'green']].map(([n, c, st, tone]) => (
                    <tr key={n}><td className="px-3 py-1.5">{n}</td><td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">{c}</td>
                      <td className="px-3 py-1.5"><span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${tone === 'green' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'}`}>{st}</span></td></tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 shadow-sm space-y-2.5">
              <div className="text-sm font-semibold">Quick message</div>
              <input readOnly value="Parents of S2 East" className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-xs" />
              <div className="flex items-center gap-2 text-xs"><span className="w-4 h-4 rounded bg-blue-600 text-white flex items-center justify-center"><Check className="w-3 h-3" /></span> Send by SMS</div>
              <div className="flex gap-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 text-[10px] font-medium">Term 3</span>
                <span className="px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 text-[10px] font-medium">Boarding</span>
              </div>
              <button className="w-full py-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-violet-600 text-white text-xs font-semibold">Send</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default function ThemePreviewPage() {
  return <Suspense><Preview /></Suspense>;
}
