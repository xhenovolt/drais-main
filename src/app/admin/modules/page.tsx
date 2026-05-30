'use client';
import React, { useState } from 'react';
import useSWR from 'swr';
import { Boxes, Loader2, BookOpen, Coins, Wrench, BarChart3, Star, Lock, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (u: string) => fetch(u).then(r => r.json());

type Category = 'core' | 'academics' | 'finance' | 'operations' | 'analytics' | 'spiritual';

interface ModuleDescriptor {
  code:        string;
  label:       string;
  description: string;
  category:    Category;
}
interface ModuleRow {
  code:       string;
  isEnabled:  boolean;
  enabledAt:  string | null;
  expiresAt:  string | null;
}
interface ApiResponse {
  success: boolean;
  schoolId: number;
  catalog:  ModuleDescriptor[];
  modules:  ModuleRow[];
}

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  core:       { label: 'Core',       icon: Lock,       color: 'slate'   },
  academics:  { label: 'Academics',  icon: BookOpen,   color: 'indigo'  },
  finance:    { label: 'Finance',    icon: Coins,      color: 'emerald' },
  operations: { label: 'Operations', icon: Wrench,     color: 'sky'     },
  analytics:  { label: 'Analytics',  icon: BarChart3,  color: 'violet'  },
  spiritual:  { label: 'Spiritual',  icon: Star,       color: 'amber'   },
};

export default function ModulesAdminPage() {
  const { t } = useI18n();
  const { data, mutate, isLoading } = useSWR<ApiResponse>('/api/admin/school-modules', fetcher);
  const [pending, setPending] = useState<string | null>(null);

  const catalog = data?.catalog ?? [];
  const modules = data?.modules ?? [];
  const byCode = new Map(modules.map(m => [m.code, m]));

  // Group by category
  const grouped = catalog.reduce((acc, d) => {
    if (!acc[d.category]) acc[d.category] = [];
    acc[d.category].push(d);
    return acc;
  }, {} as Record<Category, ModuleDescriptor[]>);

  async function toggle(code: string, enable: boolean) {
    setPending(code);
    try {
      const res = await fetch('/api/admin/school-modules', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ module_code: code, is_enabled: enable }),
      });
      const j = await res.json();
      if (!res.ok || !j.success) throw new Error(j.error || 'Toggle failed');
      toast.success(`${code}: ${enable ? 'enabled' : 'disabled'}`);
      mutate();
    } catch (e: any) { toast.error(e?.message || 'Toggle failed'); }
    finally { setPending(null); }
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Boxes className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">{t('nav.admin.schoolModules')}</h1>
          <p className="text-xs text-slate-400">Toggle features for this school. Super-admin only.</p>
        </div>
      </div>

      <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 flex items-start gap-2">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          Disabling a module hides its sidebar entries and blocks its API routes
          with HTTP 403. Existing data is preserved — re-enabling restores access.
        </p>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
      ) : (
        Object.entries(grouped).map(([cat, mods]) => {
          const meta = CATEGORY_META[cat as Category];
          const Icon = meta.icon;
          return (
            <section key={cat} className="space-y-3">
              <div className="flex items-center gap-2">
                <Icon className="w-4 h-4 text-slate-500" />
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">{meta.label}</h2>
              </div>
              <div className="grid sm:grid-cols-2 gap-3">
                {mods.map(d => {
                  const row = byCode.get(d.code);
                  const enabled = row?.isEnabled ?? false;
                  const isPending = pending === d.code;
                  return (
                    <div key={d.code}
                      className={`p-4 rounded-2xl border transition ${
                        enabled
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
                      }`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-800 dark:text-white">{d.label}</p>
                          <p className="text-xs text-slate-500 mt-1 line-clamp-2">{d.description}</p>
                          <p className="text-[10px] font-mono text-slate-400 mt-2">{d.code}</p>
                        </div>
                        <label className="flex items-center cursor-pointer flex-shrink-0">
                          <input type="checkbox" checked={enabled}
                            onChange={() => toggle(d.code, !enabled)}
                            disabled={isPending}
                            className="sr-only peer" />
                          <div className={`relative w-11 h-6 rounded-full transition ${
                            enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                          } ${isPending ? 'opacity-50' : ''}`}>
                            <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition shadow ${
                              enabled ? 'left-[22px]' : 'left-0.5'
                            }`} />
                          </div>
                        </label>
                      </div>
                      {row?.expiresAt && (
                        <p className="text-[10px] text-slate-400 mt-2">
                          Expires: {new Date(row.expiresAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
