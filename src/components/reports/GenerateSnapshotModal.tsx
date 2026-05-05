'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Modal, { ModalBody, ModalFooter, ModalHeader } from '@/components/ui/Modal';
import { showToast } from '@/lib/toast';
import { Loader2, Wand2 } from 'lucide-react';
import type { SnapshotType } from '@/lib/snapshots/types';

interface YearRow      { id: number; name: string; status?: string }
interface TermRow      { id: number; name: string; academic_year_id?: number }
interface ResultTypeRow{ id: number; name: string }
interface ClassRow     { id: number; name: string }

export interface GenerateSnapshotModalProps {
  isOpen:        boolean;
  onClose:       () => void;
  defaultType?:  SnapshotType;
}

type Step = 'form' | 'generating' | 'success' | 'error';

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
  const [generated, setGenerated]       = useState<{ snapshotId: string; counts: any } | null>(null);

  // Reset on open
  useEffect(() => {
    if (!isOpen) return;
    setType(defaultType);
    setStep('form');
    setErrorMsg('');
    setGenerated(null);
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

  async function submit() {
    setStep('generating');
    setErrorMsg('');
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
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setStep('error');
        setErrorMsg(json?.message || json?.error || `Generation failed (${res.status})`);
        showToast('error', errorMsg || 'Generation failed');
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

  function viewSnapshot() {
    if (!generated) return;
    router.push(`/academics/report-cards/${type}/${generated.snapshotId}`);
    onClose();
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
          <div className="py-12 text-center text-sm text-slate-600">
            <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin" />
            Generating snapshot — fetching learners, computing rankings…
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
              onClick={submit}
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
        {step === 'success' && (
          <>
            <button onClick={onClose} className="px-3 py-1.5 text-sm rounded border">Close</button>
            <button onClick={viewSnapshot} className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white">Open snapshot</button>
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
