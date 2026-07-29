"use client";

/**
 * Push Templates — the enterprise deployment operation for centralized
 * biometric identity (audit: docs/audits/BIOMETRIC_CENTRALIZATION_AUDIT.md,
 * Phase 5). Enroll once, in DRAIS; deploy the stored template to any
 * authorized device without re-enrollment.
 *
 * Flow: pick a scope → preview (counts, estimate, conflicts) → confirm →
 * queue → poll a synchronization report. Delivery itself rides the
 * existing device-heartbeat command channel (zk_device_commands /
 * template_distributions) — this modal is the operator surface on top of
 * machinery that already existed (template-distribution.ts).
 */
import React, { useCallback, useEffect, useState } from 'react';
import useSWR from 'swr';
import {
  X, UploadCloud, Loader2, Users, GraduationCap, Briefcase, Clock, GitCompare,
  CheckCircle2, XCircle, RefreshCw, AlertTriangle,
} from 'lucide-react';
import { apiFetch } from '@/lib/apiClient';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

type ScopeKind = 'all' | 'role_staff' | 'role_student' | 'selected' | 'modified_since' | 'diff_only';

const SCOPE_OPTIONS: Array<{ key: ScopeKind; label: string; icon: any; hint: string }> = [
  { key: 'all', label: 'All templates assigned to this school', icon: Users, hint: 'Every active/pending enrollment in this school' },
  { key: 'diff_only', label: 'Synchronize differences only', icon: GitCompare, hint: 'Only people the device has never confirmed (recommended for routine syncs)' },
  { key: 'role_staff', label: 'Staff only', icon: Briefcase, hint: '' },
  { key: 'role_student', label: 'Learners only', icon: GraduationCap, hint: '' },
  { key: 'modified_since', label: 'Recently modified users', icon: Clock, hint: 'Enrollment or template changed within the window below' },
  { key: 'selected', label: 'Only selected users', icon: Users, hint: 'Search and pick specific people' },
];

function toScopePayload(kind: ScopeKind, days: number, personIds: number[]): any {
  switch (kind) {
    case 'all': return { type: 'all' };
    case 'role_staff': return { type: 'role', role: 'staff' };
    case 'role_student': return { type: 'role', role: 'student' };
    case 'diff_only': return { type: 'diff_only' };
    case 'modified_since': return { type: 'modified_since', sinceIso: new Date(Date.now() - days * 86400_000).toISOString() };
    case 'selected': return { type: 'selected', personIds };
  }
}

export default function PushTemplatesModal({
  sn, deviceName, onClose,
}: {
  sn: string;
  deviceName?: string | null;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'scope' | 'preview' | 'running' | 'report'>('scope');
  const [scopeKind, setScopeKind] = useState<ScopeKind>('diff_only');
  const [days, setDays] = useState(7);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<'staff' | 'student'>('staff');
  const [picked, setPicked] = useState<Array<{ id: number; name: string }>>([]);

  const { data: staffData } = useSWR<any>(scopeKind === 'selected' && role === 'staff' && q.length > 1 ? `/api/staff?search=${encodeURIComponent(q)}&limit=8` : null, fetcher);
  const { data: stuData } = useSWR<any>(scopeKind === 'selected' && role === 'student' && q.length > 1 ? `/api/students/enrolled?search=${encodeURIComponent(q)}&limit=8` : null, fetcher);
  const searchResults = ((role === 'staff' ? staffData?.data : stuData?.data) || []).map((s: any) => ({
    id: s.person_id ?? s.id, name: [s.first_name, s.last_name].filter(Boolean).join(' ') || s.display_name,
  }));

  const [preview, setPreview] = useState<any>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<any>(null);
  const [report, setReport] = useState<any>(null);
  const [polling, setPolling] = useState(false);

  const runPreview = useCallback(async () => {
    setError(null); setLoadingPreview(true);
    try {
      const scope = toScopePayload(scopeKind, days, picked.map((p) => p.id));
      const res = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/push-templates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope, preview: true }), silent: true,
      });
      setPreview(res);
      setStep('preview');
    } catch (e: any) {
      setError(e?.message || 'Preview failed');
    } finally { setLoadingPreview(false); }
  }, [sn, scopeKind, days, picked]);

  const runPush = useCallback(async () => {
    setError(null); setStep('running');
    try {
      const scope = toScopePayload(scopeKind, days, picked.map((p) => p.id));
      const res = await apiFetch<any>(`/api/attendance/devices/${encodeURIComponent(sn)}/push-templates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scope }), successMessage: 'Templates queued for deployment',
      });
      setPushResult(res);
      setStep('report');
    } catch (e: any) {
      setError(e?.message || 'Push failed');
      setStep('preview');
    }
  }, [sn, scopeKind, days, picked]);

  const fetchReport = useCallback(async () => {
    if (!pushResult?.started_at) return;
    setPolling(true);
    try {
      const res = await fetch(`/api/attendance/devices/${encodeURIComponent(sn)}/push-templates/report?since=${encodeURIComponent(pushResult.started_at)}`).then((r) => r.json());
      setReport(res);
    } catch { /* keep last report */ } finally { setPolling(false); }
  }, [sn, pushResult]);

  useEffect(() => { if (step === 'report') fetchReport(); }, [step, fetchReport]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <UploadCloud className="w-6 h-6 text-indigo-600" />
            <div>
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Push Templates — {deviceName || 'Device'}</h2>
              <p className="text-xs font-mono text-gray-400">{sn}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-800"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {step === 'scope' && (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">Choose who this deployment covers. Nothing is written to the device until you confirm the preview.</p>
              <div className="space-y-1.5">
                {SCOPE_OPTIONS.map(({ key, label, icon: Icon, hint }) => (
                  <button key={key} onClick={() => setScopeKind(key)}
                    className={`w-full flex items-start gap-2.5 text-left px-3 py-2 rounded-lg border ${scopeKind === key ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-800'}`}>
                    <Icon className="w-4 h-4 mt-0.5 shrink-0 text-indigo-500" />
                    <span>
                      <span className="block text-sm font-medium text-gray-800 dark:text-gray-100">{label}</span>
                      {hint && <span className="block text-[11px] text-gray-400">{hint}</span>}
                    </span>
                  </button>
                ))}
              </div>

              {scopeKind === 'modified_since' && (
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-gray-500">Within the last</span>
                  <input type="number" min={1} max={90} value={days} onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                    className="w-16 px-2 py-1 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-center" />
                  <span className="text-gray-500">day(s)</span>
                </div>
              )}

              {scopeKind === 'selected' && (
                <div className="space-y-2">
                  <div className="flex rounded-lg border border-gray-200 dark:border-gray-600 overflow-hidden text-xs w-fit">
                    {(['staff', 'student'] as const).map((r) => (
                      <button key={r} onClick={() => setRole(r)} className={`px-2.5 py-1.5 ${role === r ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300'}`}>{r === 'staff' ? 'Staff' : 'Learner'}</button>
                    ))}
                  </div>
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a person…"
                    className="w-full px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-sm" />
                  {searchResults.length > 0 && (
                    <div className="max-h-28 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 rounded-lg border border-gray-100 dark:border-gray-700">
                      {searchResults.map((r: any) => (
                        <button key={r.id} onClick={() => { if (!picked.some((p) => p.id === r.id)) setPicked([...picked, r]); setQ(''); }}
                          className="w-full text-left px-2 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-700">{r.name}</button>
                      ))}
                    </div>
                  )}
                  {picked.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {picked.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs">
                          {p.name}
                          <button onClick={() => setPicked(picked.filter((x) => x.id !== p.id))}><X className="w-3 h-3" /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <button onClick={runPreview} disabled={loadingPreview || (scopeKind === 'selected' && picked.length === 0)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {loadingPreview ? <Loader2 className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />} Preview deployment
              </button>
            </>
          )}

          {step === 'preview' && preview && (
            <>
              <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                <Row label="Machine" value={preview.machine} />
                <Row label="Scope" value={preview.scopeDescription} />
                <Row label="People in scope" value={String(preview.people)} />
                <Row label="Templates to upload" value={String(preview.templatesToUpload)} emphasize />
                <Row label="Already loaded" value={String(preview.alreadyLoaded)} />
                <Row label="Estimated time" value={`~${preview.estimatedSeconds}s`} />
                <Row label="Potential conflicts" value={preview.conflicts > 0 ? `${preview.conflicts} previously failed` : 'None'} warn={preview.conflicts > 0} />
              </div>
              {preview.templatesToUpload === 0 && (
                <p className="text-xs text-gray-400">Nothing to push — everything in this scope is already loaded on this device.</p>
              )}
              <div className="flex gap-2">
                <button onClick={() => setStep('scope')} className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300">Back</button>
                <button onClick={runPush} disabled={preview.templatesToUpload === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                  <UploadCloud className="w-4 h-4" /> Confirm & push {preview.templatesToUpload} template(s)
                </button>
              </div>
            </>
          )}

          {step === 'running' && (
            <div className="flex items-center justify-center h-32 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Queuing deployment…</div>
          )}

          {step === 'report' && (
            <>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Delivery rides the device's own heartbeat poll — this isn't instant. Refresh to check progress.
              </p>
              {!report ? (
                <div className="flex items-center justify-center h-24 text-gray-400"><Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading report…</div>
              ) : (
                <>
                  <div className="rounded-lg border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700 text-sm">
                    <Row label="Templates uploaded" value={String(report.total)} />
                    <Row label="Succeeded" value={String(report.succeeded)} icon={<CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />} />
                    <Row label="Failed" value={String(report.failed)} warn={report.failed > 0} icon={report.failed > 0 ? <XCircle className="w-3.5 h-3.5 text-rose-500" /> : undefined} />
                    <Row label="Pending" value={String(report.pending)} />
                    <Row label="Duration" value={`${Math.round(report.duration_ms / 1000)}s`} />
                  </div>
                  {report.failures?.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase">Failures</p>
                      {report.failures.map((f: any, i: number) => (
                        <div key={i} className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 flex items-center justify-between">
                          <span>{f.person} (finger {f.finger_index})</span>
                          <span className="text-rose-500">{f.reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={fetchReport} disabled={polling}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-sm text-gray-600 dark:text-gray-300 disabled:opacity-50">
                    {polling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />} Refresh status
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, emphasize, warn, icon }: { label: string; value: string; emphasize?: boolean; warn?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2">
      <span className="text-gray-500 dark:text-gray-400">{label}</span>
      <span className={`flex items-center gap-1.5 font-medium ${warn ? 'text-amber-600' : emphasize ? 'text-indigo-600' : 'text-gray-800 dark:text-gray-100'}`}>
        {icon}{value}
      </span>
    </div>
  );
}
