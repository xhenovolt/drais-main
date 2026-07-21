'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import { showToast } from '@/lib/toast';
import { Loader2, Wand2, AlertTriangle } from 'lucide-react';
import type { SnapshotRow, SnapshotType } from '@/lib/snapshots/types';

interface YearRow      { id: number; name: string; status?: string }
interface TermRow      { id: number; name: string; academic_year_id?: number }
interface ResultTypeRow{ id: number; name: string }
interface ClassRow     { id: number; name: string }

export interface GenerateSnapshotModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  defaultType?:  SnapshotType;
}

type Step = 'form' | 'generating' | 'success' | 'error' | 'choice';

interface ChoiceContext {
  code:     'GENERATION_IN_PROGRESS' | 'READY_SNAPSHOT_EXISTS';
  message:  string;
  inflight?: { snapshotId: string; generatedBy: number; generatedAt: string; ageMs: number } | null;
  existing?: SnapshotRow[];
}

export function GenerateSnapshotModal(props: GenerateSnapshotModalProps) {
  const { isOpen, onClose, defaultType = 'secular' } = props;
  const router = useRouter();

  const [years, setYears]               = useState<YearRow[]>([]);
  const [terms, setTerms]               = useState<TermRow[]>([]);
  const [resultTypes, setResultTypes]   = useState<ResultTypeRow[]>([]);
  const [classes, setClasses]           = useState<ClassRow[]>([]);
  const [loadingFacets, setLoadingFacets] = useState(false);

  const [type, setType]                 = useState<SnapshotType>(defaultType);
  const [yearId, setYearId]             = useState<number | ''>('');
  const [termId, setTermId]             = useState<number | ''>('');
  const [resultTypeId, setResultTypeId] = useState<number | ''>('');
  const [classIds, setClassIds]         = useState<number[]>([]);

  const [step, setStep]                 = useState<Step>('form');
  const [errorMsg, setErrorMsg]         = useState<string>('');
  const [errorStack, setErrorStack]     = useState<string>('');
  const [generated, setGenerated]       = useState<{ snapshotId: string; counts: any } | null>(null);
  const [choice, setChoice]             = useState<ChoiceContext | null>(null);
  const [flushing, setFlushing]         = useState(false);
  const [inflightSnapshotId, setInflightSnapshotId] = useState<string | null>(null);
  const [polledRow, setPolledRow] = useState<SnapshotRow | null>(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setType(defaultType);
    setStep('form');
    setErrorMsg('');
    setErrorStack('');
    setGenerated(null);
    setChoice(null);
  }, [isOpen, defaultType]);

  // Load facets when modal opens
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoadingFacets(true);
    Promise.all([
      fetch('/api/academic_years').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/terms').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/result_types').then(r => r.json()).catch(() => ({ data: [] })),
      fetch('/api/classes').then(r => r.json()).catch(() => ({ data: [] })),
    ]).then(([y, t, rt, c]) => {
      if (cancelled) return;
      setYears(extractRows(y));
      setTerms(extractRows(t));
      setResultTypes(extractRows(rt));
      setClasses(extractRows(c));
      setLoadingFacets(false);
    });
    return () => { cancelled = true; };
  }, [isOpen]);

  const filteredTerms = useMemo(() => {
    if (yearId === '') return terms;
    return terms.filter(t => !t.academic_year_id || t.academic_year_id === yearId);
  }, [terms, yearId]);

  const canSubmit = yearId !== '' && termId !== '' && step === 'form';

  async function runGenerate(opts: { force: boolean }) {
    setStep('generating');
    setErrorMsg('');
    setErrorStack('');
    try {
      const res = await fetch('/api/snapshots/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          termId,
          yearId,
          resultTypeId: resultTypeId === '' ? null : resultTypeId,
          classIds: classIds.length ? classIds : undefined,
          force: opts.force,
        }),
      });
      const json = await res.json();

      if (res.status === 409 && (json?.code === 'GENERATION_IN_PROGRESS' || json?.code === 'READY_SNAPSHOT_EXISTS')) {
        setChoice({
          code:     json.code,
          message:  json.message ?? '',
          inflight: json.inflight ?? null,
          existing: json.existing ?? [],
        });
        setStep('choice');
        return;
      }

      if (!res.ok) {
        setStep('error');
        setErrorMsg(json?.message || json?.error || `Generation failed (${res.status})`);
        if (json?.stack) setErrorStack(String(json.stack));
        return;
      }

      // Server may either complete generation synchronously (ready) and
      // return counts, or it may return a snapshotId for an async-inflight
      // generation. Handle both: if snapshotId present, poll status until
      // it leaves 'generating'. Otherwise treat as immediate success.
      if (json?.snapshotId) {
        setInflightSnapshotId(String(json.snapshotId));
        // optimistic counts when available
        if (json.counts) setGenerated({ snapshotId: json.snapshotId, counts: json.counts });
        setStep('generating');
        showToast('success', 'Generation started — inspecting progress');
        return;
      }

      setGenerated({ snapshotId: json.snapshotId, counts: json.counts });
      setStep('success');
      showToast('success', 'Snapshot generated');
    } catch (e: any) {
      setStep('error');
      setErrorMsg(e?.message || 'Network error');
    }
  }

  // Polling effect: when `inflightSnapshotId` is set, poll status endpoint
  // until snapshot row moves out of 'generating'. Updates `polledRow`.
  useEffect(() => {
    if (!inflightSnapshotId) return;
    let cancelled = false;
    let timer: NodeJS.Timeout | null = null;

    const pollOnce = async () => {
      try {
        const res = await fetch(`/api/snapshots/${encodeURIComponent(inflightSnapshotId)}/status`);
        if (!res.ok) return;
        const j = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (j?.row) setPolledRow(j.row as SnapshotRow);
        const status = j?.row?.status;
        if (status && status !== 'generating') {
          // finished — update UI accordingly
          if (status === 'ready') {
            setGenerated({ snapshotId: inflightSnapshotId, counts: {
              classes: j.row.classCount, students: j.row.studentCount, subjects: j.row.resultCount, results: j.row.resultCount,
            } });
            setStep('success');
          } else {
            setStep('error');
            setErrorMsg(`Generation ended with status ${status}`);
          }
          setInflightSnapshotId(null);
          return;
        }
      } catch (e) {
        // ignore transient network errors while polling
      }
      if (cancelled) return;
      timer = setTimeout(pollOnce, 1500);
    };

    pollOnce();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [inflightSnapshotId]);

  async function viewExisting() {
    const target = choice?.existing?.[0]?.snapshotId
      ?? choice?.inflight?.snapshotId;
    if (!target) return;
    router.push(`/academics/report-cards/${type}/${encodeURIComponent(target)}`);
    onClose();
  }

  async function flushAndRegenerate() {
    if (!choice) return;
    if (!confirm('Delete all existing report snapshots for this term/type and regenerate? This cannot be undone.')) return;
    setFlushing(true);
    try {
      const res = await fetch('/api/snapshots/flush', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          termId,
          yearId,
          resultTypeId: resultTypeId === '' ? null : resultTypeId,
          status: ['ready', 'failed', 'cancelled', 'stale'],
          cancelInflight: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStep('error');
        setErrorMsg(json?.error || json?.message || `Flush failed (${res.status})`);
        return;
      }
      showToast('success', `Flushed ${json.removed ?? 0} snapshot(s)`);
      await runGenerate({ force: true });
    } catch (e: any) {
      setStep('error');
      setErrorMsg(e?.message || 'Flush failed');
    } finally {
      setFlushing(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={step === 'generating' ? () => undefined : onClose} size="lg">
      <ModalHeader>
        <div className="flex items-center gap-2">
          <Wand2 className="w-5 h-5" />
          <span>Generate Report Snapshot</span>
        </div>
      </ModalHeader>
      <ModalBody>
        {step === 'form' && (
          <div className="space-y-3">
            <Field label="Curriculum">
              <select
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                value={type}
                onChange={e => setType(e.target.value as SnapshotType)}
              >
                <option value="secular">Secular</option>
                <option value="theology">Theology</option>
                <option value="mixed">Mixed (all subjects)</option>
              </select>
            </Field>

            <Field label="Academic Year">
              <select
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                value={yearId}
                onChange={e => setYearId(e.target.value ? Number(e.target.value) : '')}
                disabled={loadingFacets}
              >
                <option value="">Select year…</option>
                {years.map(y => (
                  <option key={y.id} value={y.id}>{y.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Term">
              <select
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                value={termId}
                onChange={e => setTermId(e.target.value ? Number(e.target.value) : '')}
                disabled={loadingFacets}
              >
                <option value="">Select term…</option>
                {filteredTerms.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </Field>

            <Field label="Result Type (optional)">
              <select
                className="w-full rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
                value={resultTypeId}
                onChange={e => setResultTypeId(e.target.value ? Number(e.target.value) : '')}
                disabled={loadingFacets}
              >
                <option value="">All result types</option>
                {resultTypes.map(r => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </Field>

            <Field label={`Classes (${classIds.length === 0 ? 'all' : classIds.length} selected)`}>
              <div className="max-h-40 overflow-y-auto rounded border border-slate-300 dark:border-slate-700 p-2 grid grid-cols-2 gap-1 bg-white dark:bg-slate-800">
                {classes.map(c => {
                  const checked = classIds.includes(c.id);
                  return (
                    <label key={c.id} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={e => {
                          setClassIds(prev =>
                            e.target.checked
                              ? [...prev, c.id]
                              : prev.filter(x => x !== c.id),
                          );
                        }}
                      />
                      <span className="truncate">{c.name}</span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-1 text-xs text-slate-500">
                Leave empty to include every class with results in this term.
              </div>
            </Field>
          </div>
        )}

        {step === 'generating' && (
          <div className="py-6 text-sm text-slate-600">
            <div className="flex items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin" />
              <div>
                <div className="font-medium">Generating snapshot — fetching learners, computing rankings…</div>
                <div className="text-xs text-slate-500">This may take a minute for large schools. You can cancel or wait to inspect progress.</div>
              </div>
            </div>

            {polledRow && (
              <div className="mt-4 rounded border border-slate-200 dark:border-slate-700 p-3 bg-white dark:bg-slate-800 text-xs">
                <div className="mb-2">Status: <span className="font-medium">{polledRow.status}</span></div>
                <div className="grid grid-cols-2 gap-2">
                  <div><b>Snapshot</b><div className="font-mono text-[12px] break-all">{polledRow.snapshotId}</div></div>
                  <div><b>Generated</b><div>{polledRow.generatedAt ? new Date(polledRow.generatedAt).toLocaleString() : '—'}</div></div>
                  <div><b>Classes</b><div>{polledRow.classCount}</div></div>
                  <div><b>Students</b><div>{polledRow.studentCount}</div></div>
                </div>
                <div className="mt-3 flex gap-2">
                  {polledRow.status === 'generating' && (
                    <button
                      onClick={async () => {
                        try {
                          const r = await fetch(`/api/snapshots/${encodeURIComponent(polledRow.snapshotId)}/cancel`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'cancelled via UI' }) });
                          if (r.ok) {
                            setStep('error');
                            setErrorMsg('Generation cancelled');
                            setInflightSnapshotId(null);
                          } else {
                            showToast('error', 'Failed to cancel');
                          }
                        } catch (e) { showToast('error', 'Network error'); }
                      }}
                      className="px-3 py-1.5 rounded border text-sm bg-rose-600 text-white hover:bg-rose-700"
                    >
                      Cancel generation
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!polledRow?.snapshotId) return;
                      router.push(`/academics/report-cards/${type}/${polledRow.snapshotId}`);
                      onClose();
                    }}
                    className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm"
                  >
                    Inspect snapshot
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'choice' && choice && (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 p-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
              <div className="text-sm text-amber-900 dark:text-amber-200">
                {choice.code === 'GENERATION_IN_PROGRESS' && (
                  <>
                    <div className="font-semibold">A generation is already in progress</div>
                    {choice.inflight ? (
                      <div className="mt-1 text-xs">
                        Started {formatAge(choice.inflight.ageMs)} ago by user #{choice.inflight.generatedBy}.
                      </div>
                    ) : null}
                  </>
                )}
                {choice.code === 'READY_SNAPSHOT_EXISTS' && (
                  <>
                    <div className="font-semibold">Reports already exist for this term/type</div>
                    <div className="mt-1 text-xs">
                      {choice.existing?.length ?? 0} ready snapshot(s) already generated.
                    </div>
                  </>
                )}
              </div>
            </div>

            {choice.existing && choice.existing.length > 0 && (
              <div className="rounded border border-slate-300 dark:border-slate-700 max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-left">
                    <tr>
                      <th className="px-2 py-1">Snapshot</th>
                      <th className="px-2 py-1">Generated</th>
                      <th className="px-2 py-1">Classes</th>
                      <th className="px-2 py-1">Students</th>
                    </tr>
                  </thead>
                  <tbody>
                    {choice.existing.slice(0, 10).map(r => (
                      <tr key={r.snapshotId} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="px-2 py-1 font-mono truncate max-w-[140px]" title={r.snapshotId}>{r.snapshotId.slice(0, 8)}…</td>
                        <td className="px-2 py-1">{new Date(r.generatedAt).toLocaleString()}</td>
                        <td className="px-2 py-1">{r.classCount}</td>
                        <td className="px-2 py-1">{r.studentCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="text-sm text-slate-600 dark:text-slate-300">
              Choose how to proceed:
            </div>
            {choice.code === 'GENERATION_IN_PROGRESS' && choice.inflight?.snapshotId && (
              <div className="mt-2">
                <button
                  onClick={() => {
                    setInflightSnapshotId(choice.inflight!.snapshotId);
                    setStep('generating');
                  }}
                  className="px-3 py-1.5 text-sm rounded bg-emerald-600 text-white"
                >
                  Wait & Inspect
                </button>
              </div>
            )}
          </div>
        )}

        {step === 'success' && generated && (
          <div className="py-6 space-y-3">
            <div className="text-emerald-600 font-semibold">Snapshot ready ✓</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 space-y-1">
              <div><b>Classes:</b> {generated.counts.classes}</div>
              <div><b>Students:</b> {generated.counts.students}</div>
              <div><b>Subjects:</b> {generated.counts.subjects}</div>
              <div><b>Result rows:</b> {generated.counts.results}</div>
            </div>
            <div className="text-xs font-mono text-slate-500 break-all">{generated.snapshotId}</div>
          </div>
        )}

        {step === 'error' && (
          <div className="py-6 space-y-2">
            <div className="text-rose-600 font-semibold">Generation failed</div>
            <div className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap">{errorMsg}</div>
            {errorStack && (
              <details className="mt-2">
                <summary className="text-xs text-slate-500 cursor-pointer">Stack trace (dev only)</summary>
                <pre className="mt-1 text-[11px] font-mono bg-slate-100 dark:bg-slate-800 p-2 rounded overflow-x-auto">{errorStack}</pre>
              </details>
            )}
          </div>
        )}
      </ModalBody>
      <ModalFooter>
        {step === 'form' && (
          <>
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-sm rounded border border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={() => runGenerate({ force: false })}
              disabled={!canSubmit || loadingFacets}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Generate
            </button>
          </>
        )}
        {step === 'generating' && (
          <button disabled className="px-3 py-1.5 text-sm rounded bg-slate-300 text-white">Working…</button>
        )}
        {step === 'choice' && choice && (
          <>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border">Cancel</button>
            {(choice.existing?.length || choice.inflight) ? (
              <button onClick={viewExisting} className="px-3 py-1.5 text-sm rounded border border-blue-300 text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40">
                View Existing
              </button>
            ) : null}
            <button
              onClick={flushAndRegenerate}
              disabled={flushing}
              className="px-3 py-1.5 text-sm rounded border border-rose-300 text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
            >
              {flushing ? 'Flushing…' : 'Flush & Regenerate'}
            </button>
            <button
              onClick={() => runGenerate({ force: true })}
              className="px-3 py-1.5 text-sm rounded bg-amber-600 text-white hover:bg-amber-700"
            >
              {choice.code === 'GENERATION_IN_PROGRESS' ? 'Cancel & Regenerate' : 'Regenerate'}
            </button>
          </>
        )}
        {step === 'success' && generated && (
          <>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border">Close</button>
            <button
              onClick={() => {
                router.push(`/academics/report-cards/${type}/${generated.snapshotId}`);
                onClose();
              }}
              className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white"
            >
              Open snapshot
            </button>
          </>
        )}
        {step === 'error' && (
          <>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border">Close</button>
            <button onClick={() => setStep('form')} className="px-3 py-1.5 text-sm rounded bg-slate-700 text-white">Retry</button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}

function formatAge(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60)   return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60)   return `${m}m`;
  const h = Math.round(m / 60);
  return `${h}h`;
}

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{props.label}</div>
      {props.children}
    </label>
  );
}

function extractRows<T = any>(payload: any): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (Array.isArray(payload?.data)) return payload.data as T[];
  if (Array.isArray(payload?.rows)) return payload.rows as T[];
  return [];
}
