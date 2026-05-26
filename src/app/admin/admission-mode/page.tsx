'use client';
import React from 'react';
import useSWR from 'swr';
import { Workflow, CheckCircle2, AlertTriangle, Zap, GitBranch, ShieldAlert } from 'lucide-react';
import { toast } from 'react-hot-toast';

const fetcher = async (u: string) => {
  const r = await fetch(u, { credentials: 'same-origin' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(b?.error || `HTTP ${r.status}`); (e as any).status = r.status; throw e; }
  return b;
};

type Mode = 'flexible' | 'structured';

export default function AdmissionModePage() {
  const { data, mutate, isLoading, error } = useSWR<{ mode: Mode }>('/api/admin/admission-mode', fetcher);
  const [saving, setSaving] = React.useState(false);

  async function set(mode: Mode) {
    setSaving(true);
    try {
      const r = await fetch('/api/admin/admission-mode', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error || 'Failed');
      toast.success(`Admission mode switched to ${mode}`);
      mutate();
    } catch (e: any) { toast.error(e?.message); }
    finally { setSaving(false); }
  }

  if (isLoading) return <div className="p-6"><div className="h-32 rounded-2xl bg-slate-100 dark:bg-slate-800 animate-pulse" /></div>;
  if (error) {
    const isAuth = (error as any).status === 401 || (error as any).status === 403;
    return (
      <div className="p-6">
        <div className="rounded-lg border border-rose-300 bg-rose-50 dark:bg-rose-950/30 p-4 text-sm text-rose-700 flex items-start gap-3">
          {isAuth ? <ShieldAlert className="w-4 h-4 mt-0.5" /> : <AlertTriangle className="w-4 h-4 mt-0.5" />}
          <div>
            <p className="font-semibold">{isAuth ? 'Access denied' : 'Failed to load'}</p>
            <p className="text-xs opacity-90">{error.message}</p>
            {isAuth && <p className="text-xs mt-1">Needs <code>admissions.mode.manage</code>.</p>}
          </div>
        </div>
      </div>
    );
  }

  const current = data?.mode ?? 'flexible';

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Workflow className="w-6 h-6 text-indigo-500" />
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white">Admission Mode</h1>
          <p className="text-xs text-slate-400">Pick how this school takes in new learners.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <ModeCard
          mode="flexible"
          current={current}
          onSelect={set}
          saving={saving}
          icon={Zap}
          title="Flexible (MVP)"
          subtitle="The current DRAIS workflow — rapid admit then enroll. No state machine, no review pipeline."
          bullets={[
            'Admin opens /students/admit and creates a learner directly',
            '/students/enroll picks a class + term, and the learner is active',
            'Best for small schools and rapid onboarding',
            'No staged review or document verification',
          ]}
          accent="emerald"
        />
        <ModeCard
          mode="structured"
          current={current}
          onSelect={set}
          saving={saving}
          icon={GitBranch}
          title="Structured (Enterprise)"
          subtitle="Staged pipeline with review, approval, document checks, and audit trail."
          bullets={[
            'Applicant intake → Review → Approved → Enrolled / Rejected',
            'Approve action auto-creates the student + active enrollment',
            'Per-status audit log + permissioned transitions',
            'Best for schools with admission boards and document verification',
          ]}
          accent="indigo"
        />
      </div>

      <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm">
        <p className="font-semibold text-amber-700 dark:text-amber-300">Both modes coexist system-wide.</p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Switching does NOT delete existing students, enrollments, or admissions records.
          The Flexible-mode pages remain accessible regardless — Structured mode just enables
          the additional /admissions pipeline.
        </p>
      </div>
    </div>
  );
}

function ModeCard({
  mode, current, onSelect, saving, icon: Icon, title, subtitle, bullets, accent,
}: {
  mode: 'flexible' | 'structured';
  current: 'flexible' | 'structured';
  onSelect: (m: 'flexible' | 'structured') => void;
  saving: boolean;
  icon: any; title: string; subtitle: string; bullets: string[];
  accent: 'emerald' | 'indigo';
}) {
  const isCurrent = current === mode;
  const accentClass = accent === 'emerald'
    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20'
    : 'border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/20';
  return (
    <div className={`p-5 rounded-2xl border-2 transition ${
      isCurrent ? accentClass : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
    }`}>
      <div className="flex items-start gap-3">
        <Icon className={`w-6 h-6 ${accent === 'emerald' ? 'text-emerald-500' : 'text-indigo-500'} mt-1`} />
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">{title}</h3>
            {isCurrent && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-200 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200">
                <CheckCircle2 className="w-3 h-3" /> Current
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
        </div>
      </div>
      <ul className="mt-4 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2">
            <span className="text-slate-400 mt-0.5">•</span> <span>{b}</span>
          </li>
        ))}
      </ul>
      {!isCurrent && (
        <button onClick={() => onSelect(mode)} disabled={saving}
          className="mt-4 w-full px-3 py-2 text-sm font-semibold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Switching…' : `Switch to ${title}`}
        </button>
      )}
    </div>
  );
}
