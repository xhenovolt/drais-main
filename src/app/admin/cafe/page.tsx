'use client';
/**
 * /admin/cafe — Configurable Assessment Framework Engine dashboard.
 *
 * Single page with four tabs:
 *   • Mode             — choose traditional / competency / hybrid + default framework
 *   • Frameworks       — list + create + open editor drawer
 *   • Scoring models   — list + create + grade-mapping editor drawer
 *   • Class assignments — assign frameworks to (class, term)
 *
 * Every mutation is gated server-side by cafe.manage; this page assumes
 * the user has at least cafe.view and shows a disabled state for write
 * verbs when the caller doesn't have cafe.manage.
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Loader2, Plus, Pencil, Trash2, X, Settings2, Layers, Ruler, GraduationCap, AlertTriangle,
} from 'lucide-react';
import type {
  AssessmentFramework, AssessmentComponent, ScoringModel, GradeMapping,
  AcademicMode, FrameworkMode, ScoringKind, SchoolAcademicSettings,
  ClassFrameworkAssignment,
} from '@/lib/cafe/types';

type Tab = 'mode' | 'frameworks' | 'scoring' | 'assignments' | 'promotion';

export default function CAFEDashboard() {
  const [tab, setTab] = useState<Tab>('mode');

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <GraduationCap size={22} className="text-indigo-500" /> CAFE
          <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">Phase 1 — Foundations</span>
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configurable Assessment Framework Engine. Build frameworks, scoring models, grade
          mappings, and per-class assignments — all from this page. New snapshot pipeline
          consumers land in Phase 2; nothing here affects existing report generation yet.
        </p>
      </header>

      <nav className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700">
        {[
          { id: 'mode',        label: 'School mode',     icon: <Settings2 size={13} /> },
          { id: 'frameworks',  label: 'Frameworks',      icon: <Layers size={13} /> },
          { id: 'scoring',     label: 'Scoring models',  icon: <Ruler size={13} /> },
          { id: 'assignments', label: 'Class assignments', icon: <GraduationCap size={13} /> },
          { id: 'promotion',   label: 'Promotion rule',  icon: <AlertTriangle size={13} /> },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id as Tab)}
            className={[
              'inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
            ].join(' ')}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </nav>

      <div className="pt-2">
        {tab === 'mode'        && <ModePanel />}
        {tab === 'frameworks'  && <FrameworksPanel />}
        {tab === 'scoring'     && <ScoringPanel />}
        {tab === 'assignments' && <AssignmentsPanel />}
        {tab === 'promotion'   && <PromotionPanel />}
      </div>
    </div>
  );
}

// ─── Mode panel ─────────────────────────────────────────────────────────────

function ModePanel() {
  const [settings, setSettings] = useState<SchoolAcademicSettings | null>(null);
  const [frameworks, setFrameworks] = useState<AssessmentFramework[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [s, f] = await Promise.all([
      fetch('/api/cafe/school-settings').then(r => r.json()),
      fetch('/api/cafe/frameworks').then(r => r.json()),
    ]);
    if (s?.success)  setSettings(s.settings);
    if (f?.success)  setFrameworks(f.frameworks);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function save(patch: Partial<SchoolAcademicSettings>) {
    setSaving(true); setErr(null);
    try {
      const r = await fetch('/api/cafe/school-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Save failed');
      setSettings(d.settings);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <Spinner />;

  return (
    <div className="space-y-4 max-w-xl">
      <div className="p-3 rounded border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40">
        <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
          <AlertTriangle size={13} className="mt-0.5 flex-shrink-0" />
          <span>
            Setting the mode here is metadata only in Phase 1. It will drive the
            snapshot pipeline + report rendering once Phase 2 lands. Existing
            primary-school workflows remain unchanged.
          </span>
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Academic mode</label>
        <div className="grid grid-cols-3 gap-2">
          {(['traditional', 'competency', 'hybrid'] as AcademicMode[]).map(m => (
            <button
              key={m}
              onClick={() => save({ academicMode: m })}
              disabled={saving}
              className={[
                'p-3 text-xs font-semibold rounded border transition-colors text-left',
                settings.academicMode === m
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 text-slate-600 dark:text-slate-300',
              ].join(' ')}
            >
              <div className="capitalize">{m}</div>
              <div className="text-[10px] font-normal text-slate-500 mt-0.5">
                {m === 'traditional' && 'Percentages, aggregates, positions.'}
                {m === 'competency'  && 'Descriptors, rubrics, no ranking.'}
                {m === 'hybrid'      && 'Mix per class / per subject.'}
              </div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">Default framework</label>
        <select
          value={settings.defaultFrameworkId ?? ''}
          onChange={e => save({ defaultFrameworkId: e.target.value ? Number(e.target.value) : null })}
          disabled={saving}
          className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
        >
          <option value="">— none (no default; classes get explicit assignment) —</option>
          {frameworks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <p className="text-[10px] text-slate-400 mt-1">
          Applied when a class has no explicit (class, term) assignment.
        </p>
      </div>

      {err && <div className="p-2 text-xs text-rose-700 bg-rose-50 dark:bg-rose-900/20 rounded">{err}</div>}
    </div>
  );
}

// ─── Frameworks panel ──────────────────────────────────────────────────────

function FrameworksPanel() {
  const [list, setList] = useState<AssessmentFramework[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AssessmentFramework | 'new' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/cafe/frameworks?active_only=0');
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Failed to load');
      setList(d.frameworks);
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{list.length} framework{list.length === 1 ? '' : 's'}</p>
        <button
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-500"
        >
          <Plus size={12} /> New framework
        </button>
      </div>

      {loading ? <Spinner /> : err ? <ErrorBox msg={err} /> : list.length === 0 ? (
        <EmptyHint label="No frameworks yet. Build one with components like Theory · Practical · Continuous Assessment · AoI · Project." />
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {list.map(f => (
            <div key={f.id} className="flex items-center gap-3 p-3">
              <Layers size={14} className="text-indigo-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{f.name}</div>
                <div className="text-[11px] text-slate-400">
                  mode: {f.mode} · code: <code className="font-mono">{f.code}</code>
                  {!f.isActive && <span className="ml-1 text-rose-500 font-semibold">archived</span>}
                </div>
              </div>
              <button onClick={() => setEditing(f)} className="text-xs text-indigo-600 hover:underline">
                <Pencil size={11} className="inline mr-1" />Edit
              </button>
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <FrameworkDrawer
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function FrameworkDrawer({
  initial, onClose, onSaved,
}: { initial: AssessmentFramework | null; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<'meta' | 'components'>('meta');
  const [code, setCode]               = useState(initial?.code ?? '');
  const [name, setName]               = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [mode, setMode]               = useState<FrameworkMode>(initial?.mode ?? 'numeric');
  const [isActive, setIsActive]       = useState(initial?.isActive ?? true);
  const [hydrated, setHydrated]       = useState<AssessmentFramework | null>(null);
  const [saving, setSaving]           = useState(false);
  const [err, setErr]                 = useState<string | null>(null);

  useEffect(() => {
    if (!initial) return;
    fetch(`/api/cafe/frameworks/${initial.id}`)
      .then(r => r.json())
      .then(d => { if (d.success) setHydrated(d.framework); });
  }, [initial]);

  // Auto-derive code from name on first open.
  useEffect(() => {
    if (initial) return;
    setCode(name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''));
  }, [name, initial]);

  async function save() {
    setSaving(true); setErr(null);
    const payload = { code, name, description, mode, isActive };
    try {
      const r = await fetch(
        initial ? `/api/cafe/frameworks/${initial.id}` : '/api/cafe/frameworks',
        { method: initial ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) },
      );
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Save failed');
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer onClose={onClose} title={initial ? 'Edit framework' : 'New framework'}>
      <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700 mb-3">
        <TabPill active={tab === 'meta'}       onClick={() => setTab('meta')}>Details</TabPill>
        <TabPill active={tab === 'components'} onClick={() => setTab('components')} disabled={!initial}>
          Components{initial ? '' : ' (save first)'}
        </TabPill>
      </div>

      {tab === 'meta' && (
        <div className="space-y-3 text-xs">
          <Row label="Name"><input value={name} onChange={e => setName(e.target.value)} className={inputCls} placeholder="NLSC Mathematics S1" /></Row>
          <Row label="Code"><input value={code} onChange={e => setCode(e.target.value)} disabled={!!initial} className={inputCls + ' font-mono'} placeholder="nlsc_math_s1" />
            <p className="text-[10px] text-slate-400 mt-0.5">Immutable after creation.</p>
          </Row>
          <Row label="Description"><textarea value={description ?? ''} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} /></Row>
          <Row label="Mode">
            <select value={mode} onChange={e => setMode(e.target.value as FrameworkMode)} className={inputCls}>
              <option value="numeric">Numeric (percent / scaled)</option>
              <option value="rubric">Rubric (1–N scale + descriptors)</option>
              <option value="descriptor">Descriptor (qualitative only)</option>
              <option value="mixed">Mixed (components vary)</option>
            </select>
          </Row>
          <label className="inline-flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} /> Active</label>
          {err && <ErrorBox msg={err} />}
          <div className="flex justify-end gap-2">
            <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
            <button onClick={save} disabled={saving || !name.trim() || !code} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">
              {saving ? 'Saving…' : initial ? 'Save changes' : 'Create framework'}
            </button>
          </div>
        </div>
      )}

      {tab === 'components' && initial && (
        <ComponentEditor framework={hydrated ?? initial} onChanged={() => {
          fetch(`/api/cafe/frameworks/${initial.id}`).then(r => r.json()).then(d => d.success && setHydrated(d.framework));
        }} />
      )}
    </Drawer>
  );
}

function ComponentEditor({ framework, onChanged }: {
  framework: AssessmentFramework; onChanged: () => void;
}) {
  const [models, setModels] = useState<ScoringModel[]>([]);
  const [code, setCode]     = useState('');
  const [name, setName]     = useState('');
  const [scoringModelId, setScoringModelId] = useState<number | ''>('');
  const [weight, setWeight] = useState<number>(1);
  const [err, setErr]       = useState<string | null>(null);
  const [busy, setBusy]     = useState(false);

  useEffect(() => {
    fetch('/api/cafe/scoring-models').then(r => r.json()).then(d => d.success && setModels(d.models));
  }, []);

  async function addComponent() {
    if (!name.trim() || !scoringModelId) return;
    setBusy(true); setErr(null);
    try {
      const codeNorm = code.trim() || name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_');
      const r = await fetch(`/api/cafe/frameworks/${framework.id}/components`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: codeNorm, name, scoringModelId, weight }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Add failed');
      setName(''); setCode(''); setWeight(1); setScoringModelId('');
      onChanged();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function delComponent(id: number) {
    if (!confirm('Delete this component?')) return;
    await fetch(`/api/cafe/frameworks/${framework.id}/components/${id}`, { method: 'DELETE' });
    onChanged();
  }

  return (
    <div className="space-y-3 text-xs">
      <div className="space-y-2">
        {(framework.components ?? []).map(c => (
          <div key={c.id} className="flex items-center gap-2 p-2 border border-slate-200 dark:border-slate-700 rounded">
            <span className="font-mono text-[10px] text-slate-400">{c.code}</span>
            <div className="flex-1">
              <div className="font-semibold text-slate-800 dark:text-slate-100">{c.name}</div>
              <div className="text-[10px] text-slate-400">
                weight: {c.weight} · scoring: {c.scoringModel?.name ?? c.scoringModelId}
                {c.isRequired ? ' · required' : ''}
              </div>
            </div>
            <button onClick={() => delComponent(c.id)} className="p-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded">
              <Trash2 size={11} />
            </button>
          </div>
        ))}
      </div>

      <div className="p-3 border border-dashed border-indigo-300 rounded space-y-2">
        <div className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">Add a component</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Theory · AoI · Continuous Assessment" className={inputCls} />
        <div className="grid grid-cols-2 gap-2">
          <input value={code} onChange={e => setCode(e.target.value)} placeholder="code (optional)" className={inputCls + ' font-mono'} />
          <input type="number" step="0.1" value={weight} onChange={e => setWeight(Number(e.target.value) || 1)} className={inputCls} />
        </div>
        <select value={scoringModelId} onChange={e => setScoringModelId(e.target.value ? Number(e.target.value) : '')} className={inputCls}>
          <option value="">— scoring model —</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.kind})</option>)}
        </select>
        {err && <ErrorBox msg={err} />}
        <button onClick={addComponent} disabled={busy || !name.trim() || !scoringModelId} className="w-full py-1.5 bg-indigo-600 text-white rounded text-[11px] hover:bg-indigo-500 disabled:opacity-40">
          {busy ? 'Adding…' : 'Add component'}
        </button>
      </div>
    </div>
  );
}

// ─── Scoring models panel ──────────────────────────────────────────────────

function ScoringPanel() {
  const [list, setList] = useState<ScoringModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<ScoringModel | 'new' | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch('/api/cafe/scoring-models?active_only=0');
    const d = await r.json();
    if (d?.success) setList(d.models);
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{list.length} scoring model{list.length === 1 ? '' : 's'} (incl. built-in)</p>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-500">
          <Plus size={12} /> New scoring model
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {list.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-3">
              <Ruler size={14} className="text-indigo-500" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-800 dark:text-white truncate">{m.name}</div>
                <div className="text-[11px] text-slate-400">
                  kind: {m.kind} · code: <code className="font-mono">{m.code}</code>
                  {m.schoolId == null && <span className="ml-1 text-blue-600 font-semibold">built-in</span>}
                </div>
              </div>
              {m.schoolId != null && (
                <button onClick={() => setEditing(m)} className="text-xs text-indigo-600 hover:underline">
                  <Pencil size={11} className="inline mr-1" />Edit
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing !== null && (
        <ScoringDrawer
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ScoringDrawer({ initial, onClose, onSaved }: { initial: ScoringModel | null; onClose: () => void; onSaved: () => void }) {
  const [code, setCode]               = useState(initial?.code ?? '');
  const [name, setName]               = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [kind, setKind]               = useState<ScoringKind>(initial?.kind ?? 'numeric');
  const [grades, setGrades]           = useState<GradeMapping[]>(initial?.grades ?? []);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!initial) return;
    fetch(`/api/cafe/scoring-models/${initial.id}`).then(r => r.json()).then(d => d.success && setGrades(d.model.grades ?? []));
  }, [initial]);
  useEffect(() => {
    if (initial) return;
    setCode(name.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, ''));
  }, [name, initial]);

  async function save() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(
        initial ? `/api/cafe/scoring-models/${initial.id}` : '/api/cafe/scoring-models',
        { method: initial ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code, name, description, kind }),
        },
      );
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Save failed');
      onSaved();
    } catch (e) { setErr((e as Error).message); }
    finally { setBusy(false); }
  }

  async function addGrade() {
    if (!initial) return;
    await fetch(`/api/cafe/scoring-models/${initial.id}/grades`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: `G${grades.length + 1}`, label: 'New grade', promotes: true, sortOrder: (grades.length + 1) * 10 }),
    });
    const r = await fetch(`/api/cafe/scoring-models/${initial.id}`);
    const d = await r.json();
    if (d.success) setGrades(d.model.grades ?? []);
  }

  async function delGrade(id: number) {
    if (!initial) return;
    await fetch(`/api/cafe/scoring-models/${initial.id}/grades/${id}`, { method: 'DELETE' });
    setGrades(grades.filter(g => g.id !== id));
  }

  return (
    <Drawer onClose={onClose} title={initial ? 'Edit scoring model' : 'New scoring model'}>
      <div className="space-y-3 text-xs">
        <Row label="Name"><input value={name} onChange={e => setName(e.target.value)} className={inputCls} /></Row>
        <Row label="Code"><input value={code} onChange={e => setCode(e.target.value)} disabled={!!initial} className={inputCls + ' font-mono'} /></Row>
        <Row label="Kind">
          <select value={kind} onChange={e => setKind(e.target.value as ScoringKind)} className={inputCls} disabled={!!initial}>
            <option value="numeric">Numeric (percentage / out-of-N)</option>
            <option value="scale">Scale (1–N with labels)</option>
            <option value="letter">Letter (A–E)</option>
            <option value="descriptor">Descriptor (qualitative)</option>
          </select>
        </Row>
        <Row label="Description"><textarea value={description ?? ''} onChange={e => setDescription(e.target.value)} rows={2} className={inputCls} /></Row>

        {err && <ErrorBox msg={err} />}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="text-xs text-slate-500 hover:text-slate-700">Cancel</button>
          <button onClick={save} disabled={busy || !name.trim() || !code} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">
            {busy ? 'Saving…' : initial ? 'Save changes' : 'Create scoring model'}
          </button>
        </div>

        {initial && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-3 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Grade mappings</div>
            {grades.map(g => (
              <div key={g.id} className="grid grid-cols-12 items-center gap-1 text-[11px] p-2 border border-slate-100 dark:border-slate-800 rounded">
                <span className="col-span-1 font-bold">{g.code}</span>
                <span className="col-span-3">{g.label}</span>
                <span className="col-span-2 font-mono text-slate-400">{g.lowerBound ?? '—'} – {g.upperBound ?? '—'}</span>
                <span className="col-span-5 text-slate-500 truncate">{g.descriptor ?? ''}</span>
                <button onClick={() => delGrade(g.id)} className="col-span-1 text-rose-500"><Trash2 size={11} /></button>
              </div>
            ))}
            <button onClick={addGrade} className="w-full py-1 text-[11px] text-indigo-600 hover:underline">+ add grade mapping</button>
            <p className="text-[10px] text-slate-400">Use the API for full per-grade editing in Phase 1. Inline grade editor lands in Phase 2.</p>
          </div>
        )}
      </div>
    </Drawer>
  );
}

// ─── Assignments panel ────────────────────────────────────────────────────

function AssignmentsPanel() {
  const [assignments, setAssignments] = useState<ClassFrameworkAssignment[]>([]);
  const [frameworks,  setFrameworks]  = useState<AssessmentFramework[]>([]);
  const [classes, setClasses]         = useState<Array<{ id: number; name: string }>>([]);
  const [terms,   setTerms]           = useState<Array<{ id: number; name: string }>>([]);
  const [loading, setLoading]         = useState(true);
  const [adding, setAdding]           = useState<{ classId?: number; frameworkId?: number; termId?: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, f, c, t] = await Promise.all([
        fetch('/api/cafe/class-assignments').then(r => r.json()),
        fetch('/api/cafe/frameworks').then(r => r.json()),
        fetch('/api/classes').then(r => r.json()).catch(() => ({ classes: [] })),
        fetch('/api/terms').then(r => r.json()).catch(() => ({ terms: [] })),
      ]);
      if (a?.success) setAssignments(a.assignments);
      if (f?.success) setFrameworks(f.frameworks);
      // /api/classes and /api/terms response shapes vary; we defensively map.
      const cList = (c?.classes ?? c?.data ?? []) as Array<{ id: number; name?: string; class_name?: string }>;
      const tList = (t?.terms   ?? t?.data ?? []) as Array<{ id: number; name?: string; term_name?: string }>;
      setClasses(cList.map(x => ({ id: Number(x.id), name: String(x.name ?? x.class_name ?? `Class #${x.id}`) })));
      setTerms(tList.map(x => ({ id: Number(x.id), name: String(x.name ?? x.term_name ?? `Term #${x.id}`) })));
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function addAssignment() {
    if (!adding?.classId || !adding.frameworkId || !adding.termId) return;
    setErr(null);
    const r = await fetch('/api/cafe/class-assignments', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(adding),
    });
    const d = await r.json();
    if (!r.ok || !d.success) { setErr(d?.error || 'Failed'); return; }
    setAdding(null);
    load();
  }
  async function delAssignment(a: ClassFrameworkAssignment) {
    if (!confirm('Remove this assignment?')) return;
    const sp = new URLSearchParams({ class_id: String(a.classId), term_id: String(a.termId) });
    if (a.subjectId != null) sp.set('subject_id', String(a.subjectId));
    await fetch(`/api/cafe/class-assignments?${sp}`, { method: 'DELETE' });
    load();
  }

  if (loading) return <Spinner />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{assignments.length} assignment{assignments.length === 1 ? '' : 's'}</p>
        <button onClick={() => setAdding({})} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-xs font-semibold rounded hover:bg-indigo-500">
          <Plus size={12} /> New assignment
        </button>
      </div>

      {err && <ErrorBox msg={err} />}

      {assignments.length === 0 ? (
        <EmptyHint label="No frameworks assigned to any class yet." />
      ) : (
        <div className="border border-slate-200 dark:border-slate-700 rounded divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
          {assignments.map(a => {
            const cls = classes.find(c => c.id === a.classId)?.name ?? `Class #${a.classId}`;
            const trm = terms.find(t => t.id === a.termId)?.name ?? `Term #${a.termId}`;
            const fw  = frameworks.find(f => f.id === a.frameworkId)?.name ?? `Framework #${a.frameworkId}`;
            return (
              <div key={a.id} className="flex items-center gap-3 p-3 text-xs">
                <GraduationCap size={14} className="text-indigo-500" />
                <div className="flex-1">
                  <span className="font-semibold">{cls}</span> · {trm}
                  {a.subjectId != null && <> · subject #{a.subjectId}</>}
                  <span className="text-slate-400"> → </span>
                  <span className="text-indigo-600">{fw}</span>
                </div>
                <button onClick={() => delAssignment(a)} className="p-1 text-rose-500"><Trash2 size={11} /></button>
              </div>
            );
          })}
        </div>
      )}

      {adding && (
        <Drawer onClose={() => setAdding(null)} title="New assignment">
          <div className="space-y-3 text-xs">
            <Row label="Class">
              <select value={adding.classId ?? ''} onChange={e => setAdding({ ...adding, classId: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
                <option value="">— class —</option>
                {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Row>
            <Row label="Term">
              <select value={adding.termId ?? ''} onChange={e => setAdding({ ...adding, termId: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
                <option value="">— term —</option>
                {terms.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Row>
            <Row label="Framework">
              <select value={adding.frameworkId ?? ''} onChange={e => setAdding({ ...adding, frameworkId: e.target.value ? Number(e.target.value) : undefined })} className={inputCls}>
                <option value="">— framework —</option>
                {frameworks.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </Row>
            <div className="flex justify-end gap-2">
              <button onClick={() => setAdding(null)} className="text-xs text-slate-500">Cancel</button>
              <button onClick={addAssignment} disabled={!adding.classId || !adding.frameworkId || !adding.termId} className="px-3 py-1.5 text-xs bg-indigo-600 text-white rounded disabled:opacity-40">
                Assign
              </button>
            </div>
          </div>
        </Drawer>
      )}
    </div>
  );
}

// ─── Primitives ────────────────────────────────────────────────────────────

const inputCls = 'w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-auto"
           onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-3 border-b border-slate-100 dark:border-slate-800">
          <h2 className="font-bold text-sm text-slate-800 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600"><X size={14} /></button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

function TabPill({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick} disabled={disabled}
      className={[
        'px-2.5 py-1 text-xs font-medium border-b-2 -mb-px',
        active ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
               : 'border-transparent text-slate-500 hover:text-slate-700',
        disabled ? 'opacity-40 cursor-not-allowed' : '',
      ].join(' ')}
    >{children}</button>
  );
}

function Spinner() {
  return <div className="flex items-center gap-2 text-xs text-slate-400 py-4"><Loader2 size={12} className="animate-spin" /> Loading…</div>;
}
function ErrorBox({ msg }: { msg: string }) {
  return <div className="p-2 text-xs text-rose-700 bg-rose-50 dark:bg-rose-900/20 rounded">{msg}</div>;
}
function EmptyHint({ label }: { label: string }) {
  return <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded text-slate-400 text-xs">{label}</div>;
}

// ─── Promotion rule panel (CAFE Phase 5) ──────────────────────────────────

import { VisibilityRuleEditor } from '@/components/drce/editor/VisibilityRuleEditor';
import type { VisibilityRule } from '@/lib/drce/visibility';

function PromotionPanel() {
  const [rule, setRule] = useState<VisibilityRule | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Dry-run state
  const [snapshots, setSnapshots] = useState<Array<{ snapshotId: string; label: string }>>([]);
  const [chosenSnapshotId, setChosenSnapshotId] = useState<string>('');
  const [evalResult, setEvalResult] = useState<null | {
    totalCandidates: number; promotedCount: number; heldCount: number;
    ruleConfigured: boolean; ruleSummary: string | null;
    perStudent: Array<{ studentName: string; className: string; total: number; eligibility: string }>;
  }>(null);
  const [evaluating, setEvaluating] = useState(false);

  // Load existing rule from school settings.
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch('/api/cafe/school-settings');
        const d = await r.json();
        if (d?.success) setRule((d.settings.promotionRuleJson as unknown as VisibilityRule | null) ?? null);
      } catch (e) { setErr((e as Error).message); }
      finally { setLoading(false); }
    })();
    // Load recent snapshots for the dry-run picker.
    (async () => {
      try {
        const r = await fetch('/api/snapshots?limit=20');
        const d = await r.json();
        const list = (d?.snapshots ?? d?.data ?? []) as Array<{ snapshotId?: string; id?: string; termName?: string; yearName?: string }>;
        setSnapshots(list.slice(0, 20).map(s => ({
          snapshotId: String(s.snapshotId ?? s.id),
          label: `${s.snapshotId ?? s.id} · ${s.termName ?? ''} ${s.yearName ?? ''}`.trim(),
        })));
      } catch { /* non-fatal */ }
    })();
  }, []);

  async function saveRule() {
    setSaving(true); setErr(null); setSavedNote(null);
    try {
      const r = await fetch('/api/cafe/school-settings', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotion_rule_json: rule, promotionRuleJson: rule }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || 'Save failed');
      setSavedNote('Promotion rule saved.');
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  async function dryRun() {
    if (!chosenSnapshotId) return;
    setEvaluating(true); setErr(null); setEvalResult(null);
    try {
      const r = await fetch('/api/cafe/promotion/evaluate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ snapshotId: chosenSnapshotId, ruleOverride: rule }),
      });
      const d = await r.json();
      if (!r.ok || !d?.success) throw new Error(d?.error || 'Evaluation failed');
      setEvalResult(d.evaluation);
    } catch (e) { setErr((e as Error).message); }
    finally { setEvaluating(false); }
  }

  if (loading) return <Spinner />;
  return (
    <div className="space-y-4 max-w-3xl">
      <div className="p-3 rounded border border-indigo-200 bg-indigo-50 dark:bg-indigo-900/10 dark:border-indigo-900/40 text-xs text-indigo-800 dark:text-indigo-300">
        Build a rule that decides which learners get promoted at term end.
        Same editor as per-section conditional visibility — no new rule language.
        Example: <strong>average ≥ 50 AND assessment.classPosition ≤ 40</strong>.
        Dry-run against any snapshot before relying on it.
      </div>

      <VisibilityRuleEditor value={rule} onChange={setRule} />

      <div className="flex items-center gap-2">
        <button onClick={saveRule} disabled={saving}
          className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">
          {saving ? 'Saving…' : 'Save promotion rule'}
        </button>
        {savedNote && <span className="text-xs text-emerald-600">{savedNote}</span>}
      </div>

      <hr className="border-slate-200 dark:border-slate-700" />

      <div>
        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Dry-run against a snapshot</h3>
        <div className="flex items-center gap-2 mb-3">
          <select value={chosenSnapshotId} onChange={e => setChosenSnapshotId(e.target.value)}
            className="flex-1 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900">
            <option value="">— pick a snapshot —</option>
            {snapshots.map(s => <option key={s.snapshotId} value={s.snapshotId}>{s.label}</option>)}
          </select>
          <button onClick={dryRun} disabled={!chosenSnapshotId || evaluating}
            className="px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded disabled:opacity-40">
            {evaluating ? 'Running…' : 'Run'}
          </button>
        </div>

        {evalResult && (
          <div className="space-y-2 border border-slate-200 dark:border-slate-700 rounded p-3 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-600 dark:text-slate-300">
              <strong className="text-slate-800 dark:text-slate-100">{evalResult.totalCandidates}</strong> candidates ·{' '}
              <span className="text-emerald-600 font-semibold">{evalResult.promotedCount} promoted</span> ·{' '}
              <span className="text-rose-600 font-semibold">{evalResult.heldCount} held</span>
              {!evalResult.ruleConfigured && <> · <span className="text-amber-600">no rule — every learner returned as "no_rule"</span></>}
            </div>
            <div className="max-h-72 overflow-y-auto border-t border-slate-100 dark:border-slate-800 pt-2 space-y-0.5">
              {evalResult.perStudent.slice(0, 100).map((s, i) => (
                <div key={i} className="flex items-center gap-2 text-[11px] py-0.5">
                  <span className={[
                    'inline-block w-14 text-center px-1 py-0.5 rounded text-[9px] font-semibold uppercase',
                    s.eligibility === 'promote' ? 'bg-emerald-100 text-emerald-700' :
                    s.eligibility === 'hold' ? 'bg-rose-100 text-rose-700' :
                    'bg-slate-100 text-slate-500',
                  ].join(' ')}>{s.eligibility}</span>
                  <span className="flex-1 truncate">{s.studentName}</span>
                  <span className="text-slate-400 w-20 truncate">{s.className}</span>
                  <span className="text-slate-500 font-mono">{s.total}</span>
                </div>
              ))}
              {evalResult.perStudent.length > 100 && (
                <div className="text-[10px] text-slate-400 pt-1">… plus {evalResult.perStudent.length - 100} more</div>
              )}
            </div>
          </div>
        )}
      </div>

      {err && <ErrorBox msg={err} />}
    </div>
  );
}
