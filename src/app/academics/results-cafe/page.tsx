'use client';
/**
 * /academics/results-cafe — Phase 3 component result entry.
 *
 * Pick (class, subject, term) → grid of (student × component) where each
 * cell renders the input matching its component's scoring model:
 *   • numeric / scale → number input with min/max enforcement
 *   • letter           → dropdown of configured letters
 *   • descriptor       → text input or dropdown of choices
 *
 * The legacy /academics/results page stays untouched — schools using
 * traditional result_types continue using it. Schools using CAFE come here.
 */
import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Loader2, Save, GraduationCap, AlertTriangle, Check, RefreshCw,
} from 'lucide-react';
import type {
  AssessmentFramework, ScoringModel, AssessmentComponent,
} from '@/lib/cafe/types';
import { useI18n } from '@/components/i18n/I18nProvider';

interface StudentRow {
  id: number;
  fullName: string;
  admissionNo: string | null;
  photoUrl: string | null;
}
interface ValueCell {
  score:     number | null;
  valueText: string | null;
  gradeCode: string | null;
  remarks:   string | null;
}
interface GridResponse {
  success: boolean;
  framework: AssessmentFramework | null;
  students: StudentRow[];
  values:   Record<string, ValueCell>;
}

export default function ResultsCAFEEntryPage() {
  const { t } = useI18n();
  const [classes, setClasses]   = useState<Array<{ id: number; name: string }>>([]);
  const [subjects, setSubjects] = useState<Array<{ id: number; name: string }>>([]);
  const [terms, setTerms]       = useState<Array<{ id: number; name: string }>>([]);
  const [classId, setClassId]   = useState<number | ''>('');
  const [subjectId, setSubjectId] = useState<number | ''>('');
  const [termId, setTermId]     = useState<number | ''>('');
  const [grid, setGrid]         = useState<GridResponse | null>(null);
  const [draft, setDraft]       = useState<Record<string, ValueCell>>({});
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [err, setErr]           = useState<string | null>(null);
  const [msg, setMsg]           = useState<string | null>(null);
  // Phase 5 — entry mode (Components / Generic Skills / Projects).
  const [entryMode, setEntryMode] = useState<'components' | 'skills' | 'projects'>('components');

  // Bootstrap pickers.
  useEffect(() => {
    (async () => {
      try {
        const [c, t] = await Promise.all([
          fetch('/api/classes').then(r => r.json()).catch(() => ({})),
          fetch('/api/terms').then(r => r.json()).catch(() => ({})),
        ]);
        const cList = (c?.classes ?? c?.data ?? []) as Array<{ id: number; name?: string; class_name?: string }>;
        const tList = (t?.terms   ?? t?.data ?? []) as Array<{ id: number; name?: string; term_name?: string }>;
        setClasses(cList.map(x => ({ id: Number(x.id), name: String(x.name ?? x.class_name ?? `Class #${x.id}`) })));
        setTerms(tList.map(x => ({ id: Number(x.id), name: String(x.name ?? x.term_name ?? `Term #${x.id}`) })));
      } catch (e) { setErr((e as Error).message); }
    })();
  }, []);

  // Subjects for the selected class.
  useEffect(() => {
    if (!classId) { setSubjects([]); return; }
    (async () => {
      try {
        const r = await fetch(`/api/class-subjects?class_id=${classId}`);
        const d = await r.json();
        const list = (d?.subjects ?? d?.data ?? []) as Array<{ id: number; subject_id?: number; name?: string; subject_name?: string }>;
        setSubjects(list.map(x => ({
          id:   Number(x.subject_id ?? x.id),
          name: String(x.name ?? x.subject_name ?? `Subject #${x.subject_id ?? x.id}`),
        })));
      } catch { /* non-fatal */ }
    })();
  }, [classId]);

  const loadGrid = useCallback(async () => {
    if (!classId || !subjectId || !termId) return;
    setLoading(true); setErr(null); setMsg(null);
    try {
      const r = await fetch(`/api/cafe/results/grid?class_id=${classId}&subject_id=${subjectId}&term_id=${termId}`);
      const d = await r.json() as GridResponse;
      if (!r.ok || !d.success) throw new Error((d as unknown as { error?: string })?.error || 'Failed to load grid');
      setGrid(d);
      setDraft({ ...d.values });
    } catch (e) { setErr((e as Error).message); }
    finally { setLoading(false); }
  }, [classId, subjectId, termId]);
  useEffect(() => { void loadGrid(); }, [loadGrid]);

  const components = useMemo(() => grid?.framework?.components ?? [], [grid]);

  function setCell(studentId: number, componentId: number, patch: Partial<ValueCell>) {
    const key = `${studentId}:${componentId}`;
    setDraft(d => ({
      ...d,
      [key]: { score: null, valueText: null, gradeCode: null, remarks: null, ...d[key], ...patch },
    }));
  }

  async function save() {
    if (!grid?.framework || !classId || !subjectId || !termId) return;
    setSaving(true); setErr(null); setMsg(null);
    const cells = Object.entries(draft).map(([key, v]) => {
      const [studentId, componentId] = key.split(':').map(Number);
      return {
        studentId, classId: Number(classId), subjectId: Number(subjectId),
        termId: Number(termId), componentId,
        score: v.score, valueText: v.valueText, remarks: v.remarks,
      };
    });
    try {
      const r = await fetch('/api/cafe/results/cells', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cells }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Save failed');
      const skippedCount = Array.isArray(d.skipped) ? d.skipped.length : 0;
      setMsg(skippedCount > 0
        ? `Saved ${d.written}; ${skippedCount} cell(s) skipped (check tooltips).`
        : `Saved ${d.written} cell(s).`);
      await loadGrid();
    } catch (e) { setErr((e as Error).message); }
    finally { setSaving(false); }
  }

  const dirty = grid && JSON.stringify(draft) !== JSON.stringify(grid.values);

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
          <GraduationCap size={22} className="text-indigo-500" /> {`CAFE — ${t('academic.result')}`}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Enter component-level scores for any (class, subject, term) covered by an
          assessment framework. Schools without a framework assigned use the legacy
          <a href="/academics/results" className="text-indigo-600 hover:underline ml-1">Results page</a>.
        </p>
      </header>

      {/* Picker row */}
      <div className="grid grid-cols-3 gap-3">
        <Picker label={t('orgUnits.class')} value={classId} onChange={setClassId} options={classes} />
        <Picker label={t('academic.subject')} value={subjectId} onChange={setSubjectId} options={subjects} disabled={!classId} />
        <Picker label={t('academicTime.term')} value={termId} onChange={setTermId} options={terms} />
      </div>

      {/* Phase 5 entry tabs */}
      <EntryModeTabs
        mode={entryMode}
        onChange={setEntryMode}
      />

      {err && <Banner kind="error">{err}</Banner>}
      {msg && <Banner kind="success">{msg}</Banner>}

      {loading ? (
        <Spinner />
      ) : !classId || !subjectId || !termId ? (
        <Empty label="Pick a class, subject, and term to begin." />
      ) : !grid?.framework ? (
        <NoFrameworkHint />
      ) : entryMode === 'skills' ? (
        <SkillsEntryPanel studentList={grid.students} termId={Number(termId)} />
      ) : entryMode === 'projects' ? (
        <ProjectsEntryPanel studentList={grid.students} termId={Number(termId)} />
      ) : (
        <>
          <div className="flex items-center justify-between border border-slate-200 dark:border-slate-700 rounded p-2 bg-white dark:bg-slate-900">
            <div className="text-xs text-slate-500">
              Framework: <strong className="text-slate-700 dark:text-slate-200">{grid.framework.name}</strong>
              {' · '}{components.length} component{components.length === 1 ? '' : 's'}
              {' · '}{grid.students.length} student{grid.students.length === 1 ? '' : 's'}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={loadGrid} className="text-xs text-slate-500 hover:text-slate-700 inline-flex items-center gap-1">
                <RefreshCw size={11} /> Refresh
              </button>
              <button
                onClick={save} disabled={!dirty || saving}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 size={11} className="animate-spin" /> : <Save size={11} />}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </div>

          {/* Grid */}
          <div className="overflow-auto border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                <tr>
                  <th className="text-left p-2 font-semibold text-slate-600 dark:text-slate-300">Student</th>
                  {components.map(c => (
                    <th key={c.id} className="p-2 font-semibold text-slate-600 dark:text-slate-300 text-left">
                      <div className="flex flex-col">
                        <span>{c.name}</span>
                        <span className="text-[10px] font-normal text-slate-400">
                          weight: {c.weight} · {c.scoringModel?.kind ?? '—'}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {grid.students.map(s => (
                  <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="p-2 font-medium text-slate-800 dark:text-slate-100">
                      <div>{s.fullName}</div>
                      <div className="text-[10px] text-slate-400">{s.admissionNo ?? `#${s.id}`}</div>
                    </td>
                    {components.map(c => (
                      <td key={c.id} className="p-1.5 align-top">
                        <CellInput
                          component={c}
                          value={draft[`${s.id}:${c.id}`] ?? null}
                          onChange={patch => setCell(s.id, c.id, patch)}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Cell input — scoring-model-aware ─────────────────────────────────────

function CellInput({ component, value, onChange }: {
  component: AssessmentComponent;
  value: ValueCell | null;
  onChange: (patch: Partial<ValueCell>) => void;
}) {
  const model = component.scoringModel as ScoringModel | undefined;
  const kind = model?.kind ?? 'numeric';
  const cfg  = (model?.config ?? {}) as { min?: number; max?: number; letters?: string[]; choices?: Array<{ value: string; label: string }> };

  if (kind === 'numeric' || kind === 'scale') {
    return (
      <input
        type="number"
        value={value?.score ?? ''}
        min={cfg.min}
        max={cfg.max}
        step={kind === 'scale' ? 1 : 0.1}
        onChange={e => onChange({ score: e.target.value === '' ? null : Number(e.target.value) })}
        title={`min: ${cfg.min ?? '—'} · max: ${cfg.max ?? '—'}`}
        className="w-20 px-1.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400 text-center"
      />
    );
  }
  if (kind === 'letter') {
    const letters = cfg.letters ?? [];
    return (
      <select
        value={value?.valueText ?? ''}
        onChange={e => onChange({ valueText: e.target.value || null })}
        className="px-1.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
      >
        <option value="">—</option>
        {letters.map(l => <option key={l} value={l}>{l}</option>)}
      </select>
    );
  }
  // descriptor
  const choices = cfg.choices ?? [];
  if (choices.length) {
    return (
      <select
        value={value?.valueText ?? ''}
        onChange={e => onChange({ valueText: e.target.value || null })}
        className="px-1.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900"
      >
        <option value="">—</option>
        {choices.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
    );
  }
  return (
    <input
      type="text"
      value={value?.valueText ?? ''}
      onChange={e => onChange({ valueText: e.target.value || null })}
      placeholder="—"
      className="w-32 px-1.5 py-1 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-400"
    />
  );
}

// ─── Primitives ───────────────────────────────────────────────────────────

function Picker({ label, value, onChange, options, disabled }: {
  label: string; value: number | ''; onChange: (v: number | '') => void;
  options: Array<{ id: number; name: string }>; disabled?: boolean;
}) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-wide text-slate-500 mb-0.5">{label}</label>
      <select
        value={value} disabled={disabled}
        onChange={e => onChange(e.target.value ? Number(e.target.value) : '')}
        className="w-full px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 disabled:bg-slate-100 dark:disabled:bg-slate-800"
      >
        <option value="">— pick {label.toLowerCase()} —</option>
        {options.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
      </select>
    </div>
  );
}

function Banner({ kind, children }: { kind: 'error' | 'success'; children: React.ReactNode }) {
  const cls = kind === 'error'
    ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 border-rose-200 dark:border-rose-900/40'
    : 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 border-emerald-200 dark:border-emerald-900/40';
  return <div className={`p-2.5 rounded border text-xs ${cls}`}>
    {kind === 'error' ? <AlertTriangle size={12} className="inline mr-1" /> : <Check size={12} className="inline mr-1" />}
    {children}
  </div>;
}
function Spinner() { return <div className="flex items-center gap-2 text-xs text-slate-400 py-6"><Loader2 size={12} className="animate-spin" /> Loading…</div>; }
function Empty({ label }: { label: string }) { return <div className="p-12 text-center border border-dashed border-slate-200 dark:border-slate-700 rounded text-slate-400 text-sm">{label}</div>; }
function NoFrameworkHint() {
  return (
    <div className="p-6 rounded border border-amber-200 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-300">
      <strong>No framework assigned</strong> to this (class, term). Configure one at{' '}
      <a href="/admin/cafe" className="text-indigo-600 hover:underline">/admin/cafe → Class assignments</a>{' '}
      or use the <a href="/academics/results" className="text-indigo-600 hover:underline">legacy results page</a> for traditional entry.
    </div>
  );
}

// ─── Phase 5 — Entry mode tabs + skills + projects panels ────────────────

function EntryModeTabs({ mode, onChange }: {
  mode: 'components' | 'skills' | 'projects';
  onChange: (m: 'components' | 'skills' | 'projects') => void;
}) {
  return (
    <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-slate-700">
      {[
        { id: 'components' as const, label: 'Components' },
        { id: 'skills'     as const, label: 'Generic Skills' },
        { id: 'projects'   as const, label: 'Projects' },
      ].map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={[
            'px-3 py-1.5 text-xs font-medium border-b-2 -mb-px transition-colors',
            mode === t.id
              ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200',
          ].join(' ')}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

interface SkillEntry { code: string; label: string; score: number | null; valueText: string | null; gradeCode: string | null }
interface ProjEntry  { id: number; title: string; descriptor: string | null; outcome: string | null; evidenceUrl: string | null; gradeCode: string | null }

function SkillsEntryPanel({ studentList, termId }: { studentList: StudentRow[]; termId: number }) {
  const [pickedStudent, setPickedStudent] = useState<number | null>(studentList[0]?.id ?? null);
  const [skills, setSkills] = useState<SkillEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftCode, setDraftCode] = useState('');
  const [draftLabel, setDraftLabel] = useState('');
  const [draftValue, setDraftValue] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!pickedStudent || !termId) return;
    setLoading(true); setErr(null);
    fetch(`/api/cafe/skills?student_id=${pickedStudent}&term_id=${termId}`)
      .then(r => r.json())
      .then(d => { if (d?.success) setSkills(d.skills as SkillEntry[]); })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [pickedStudent, termId]);

  async function addSkill() {
    if (!pickedStudent || !draftLabel.trim()) return;
    setErr(null);
    const r = await fetch('/api/cafe/skills', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: pickedStudent, termId, code: draftCode || draftLabel,
        label: draftLabel, valueText: draftValue || null,
      }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) { setErr(d?.error || 'Failed'); return; }
    setDraftCode(''); setDraftLabel(''); setDraftValue('');
    fetch(`/api/cafe/skills?student_id=${pickedStudent}&term_id=${termId}`)
      .then(r => r.json())
      .then(d => { if (d?.success) setSkills(d.skills); });
  }
  async function removeSkill(code: string) {
    if (!pickedStudent) return;
    await fetch(`/api/cafe/skills?student_id=${pickedStudent}&term_id=${termId}&code=${encodeURIComponent(code)}`, { method: 'DELETE' });
    setSkills(s => s.filter(x => x.code !== code));
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded p-3 bg-white dark:bg-slate-900 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Picker label={t('people.learner')} value={pickedStudent ?? ''} onChange={v => setPickedStudent(v ? Number(v) : null)}
          options={studentList.map(s => ({ id: s.id, name: s.fullName }))} />
      </div>
      {loading ? <Spinner /> : (
        <>
          <div className="space-y-1">
            {skills.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No skills entered for this learner this term.</p>
            ) : skills.map(s => (
              <div key={s.code} className="flex items-center gap-2 p-1.5 border border-slate-100 dark:border-slate-800 rounded text-xs">
                <span className="font-semibold flex-1">{s.label}</span>
                <span className="text-slate-500">{s.valueText ?? s.gradeCode ?? (s.score ?? '')}</span>
                <button onClick={() => removeSkill(s.code)} className="text-rose-500">×</button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input value={draftLabel} onChange={e => setDraftLabel(e.target.value)} placeholder="Skill (e.g. Communication)"
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900" />
            <input value={draftCode} onChange={e => setDraftCode(e.target.value)} placeholder="code (optional)"
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900 font-mono" />
            <div className="flex gap-2">
              <input value={draftValue} onChange={e => setDraftValue(e.target.value)} placeholder="value / descriptor"
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900" />
              <button onClick={addSkill} disabled={!draftLabel.trim() || !pickedStudent}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">Add</button>
            </div>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </>
      )}
    </div>
  );
}

function ProjectsEntryPanel({ studentList, termId }: { studentList: StudentRow[]; termId: number }) {
  const [pickedStudent, setPickedStudent] = useState<number | null>(studentList[0]?.id ?? null);
  const [projects, setProjects] = useState<ProjEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDesc, setDraftDesc] = useState('');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!pickedStudent || !termId) return;
    setLoading(true); setErr(null);
    fetch(`/api/cafe/projects?student_id=${pickedStudent}&term_id=${termId}`)
      .then(r => r.json())
      .then(d => { if (d?.success) setProjects(d.projects as ProjEntry[]); })
      .catch(e => setErr((e as Error).message))
      .finally(() => setLoading(false));
  }, [pickedStudent, termId]);

  async function addProject() {
    if (!pickedStudent || !draftTitle.trim()) return;
    const r = await fetch('/api/cafe/projects', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: pickedStudent, termId, title: draftTitle, descriptor: draftDesc || null }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) { setErr(d?.error || 'Failed'); return; }
    setDraftTitle(''); setDraftDesc('');
    fetch(`/api/cafe/projects?student_id=${pickedStudent}&term_id=${termId}`)
      .then(r => r.json())
      .then(d => { if (d?.success) setProjects(d.projects); });
  }
  async function deleteProject(id: number) {
    await fetch(`/api/cafe/projects?id=${id}`, { method: 'DELETE' });
    setProjects(p => p.filter(x => x.id !== id));
  }

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded p-3 bg-white dark:bg-slate-900 space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <Picker label={t('people.learner')} value={pickedStudent ?? ''} onChange={v => setPickedStudent(v ? Number(v) : null)}
          options={studentList.map(s => ({ id: s.id, name: s.fullName }))} />
      </div>
      {loading ? <Spinner /> : (
        <>
          {projects.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No projects entered for this learner this term.</p>
          ) : projects.map(p => (
            <div key={p.id} className="p-2 border border-slate-100 dark:border-slate-800 rounded">
              <div className="flex items-start gap-2 text-xs">
                <div className="flex-1">
                  <div className="font-semibold">{p.title}</div>
                  {p.descriptor && <div className="text-slate-500 mt-0.5">{p.descriptor}</div>}
                </div>
                <button onClick={() => deleteProject(p.id)} className="text-rose-500">×</button>
              </div>
            </div>
          ))}
          <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input value={draftTitle} onChange={e => setDraftTitle(e.target.value)} placeholder="Project title"
              className="px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900" />
            <div className="flex gap-2">
              <input value={draftDesc} onChange={e => setDraftDesc(e.target.value)} placeholder="Descriptor (optional)"
                className="flex-1 px-2 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900" />
              <button onClick={addProject} disabled={!draftTitle.trim() || !pickedStudent}
                className="px-3 py-1.5 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500 disabled:opacity-40">Add</button>
            </div>
          </div>
          {err && <p className="text-xs text-rose-600">{err}</p>}
        </>
      )}
    </div>
  );
}
