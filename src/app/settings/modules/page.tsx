'use client';

import { useState } from 'react';
import { Loader2, Layers, Check, AlertTriangle, Lock } from 'lucide-react';
import { useEnabledModules } from '@/hooks/useEnabledModules';
import { showToast } from '@/lib/toast';
import type { ModuleCode, ModuleDescriptor } from '@/lib/school-modules';

/**
 * Phase A — Module-management UI.
 *
 * Super-admin-only page. Lists every module in the catalog, shows current
 * enabled state per the school, lets the operator toggle. Writes go
 * through /api/admin/school-modules; on each toggle we refetch via the
 * hook so the page always reflects canonical server state.
 *
 * Until Phase F wires sidebar/route consumption, toggles here have no
 * visible effect on the rest of the app — they record intent in the DB.
 */
export default function SchoolModulesPage() {
  const { isLoading, error, modules, catalog, refresh } = useEnabledModules();
  const [pendingCode, setPendingCode] = useState<ModuleCode | null>(null);
  const [forbidden, setForbidden] = useState(false);

  async function toggle(code: ModuleCode, isEnabled: boolean) {
    setPendingCode(code);
    try {
      const res = await fetch('/api/admin/school-modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_code: code, is_enabled: isEnabled }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (!res.ok) {
        showToast('error', json?.error || `HTTP ${res.status}`);
        return;
      }
      refresh();
      showToast('success', `${code} ${isEnabled ? 'enabled' : 'disabled'}`);
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Toggle failed');
    } finally {
      setPendingCode(null);
    }
  }

  const byCategory = catalog.reduce<Record<string, ModuleDescriptor[]>>((acc, d) => {
    (acc[d.category] ??= []).push(d);
    return acc;
  }, {});

  const stateFor = (code: ModuleCode) => modules.find(m => m.code === code);

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <header>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Layers className="w-6 h-6" /> School Modules
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Toggle which feature modules are available for this school.
          Disabled modules are hidden from the sidebar and APIs return 403.
        </p>
      </header>

      {forbidden && (
        <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-start gap-2">
          <Lock className="w-4 h-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-medium">Super-admin only</div>
            <div className="text-xs">Module toggles are reserved for super-admin accounts. Your view is read-only.</div>
          </div>
        </div>
      )}

      {error && (
        <div className="rounded border border-rose-300 bg-rose-50 dark:bg-rose-950/40 p-3 text-sm text-rose-700 dark:text-rose-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          {error.message}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-12 justify-center">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading modules…
        </div>
      )}

      {!isLoading && Object.entries(byCategory).map(([cat, items]) => (
        <section key={cat} className="space-y-2">
          <h2 className="text-xs uppercase tracking-wider text-slate-500">{cat}</h2>
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-200 dark:divide-slate-700 bg-white dark:bg-slate-800">
            {items.map(descriptor => {
              const state = stateFor(descriptor.code);
              const enabled = state?.isEnabled ?? false;
              const pending = pendingCode === descriptor.code;
              return (
                <div
                  key={descriptor.code}
                  className="flex items-start justify-between gap-4 p-4"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{descriptor.label}</span>
                      <code className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400">{descriptor.code}</code>
                      {enabled && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200">
                          <Check className="w-3 h-3" /> Enabled
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{descriptor.description}</p>
                    {state?.expiresAt && (
                      <p className="text-[11px] text-amber-700 mt-1">Expires {new Date(state.expiresAt).toLocaleDateString()}</p>
                    )}
                  </div>
                  <button
                    onClick={() => toggle(descriptor.code, !enabled)}
                    disabled={pending || forbidden}
                    className={`shrink-0 inline-flex items-center justify-center w-12 h-6 rounded-full transition-colors ${enabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'} ${forbidden ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'} disabled:opacity-50`}
                    aria-label={`${enabled ? 'Disable' : 'Enable'} ${descriptor.label}`}
                  >
                    <span className={`w-5 h-5 rounded-full bg-white shadow transform transition-transform ${enabled ? 'translate-x-3' : '-translate-x-3'}`} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
