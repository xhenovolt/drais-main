'use client';

/**
 * Gate Verification (Phase 7) — the guard verifies IDENTITY, never paper.
 *
 * Fingerprint scans on a gate-tagged device pop the verdict automatically
 * (live popup path). This page covers the other two methods:
 *   · Student ID — type/scan the admission number
 *   · Manual lookup — name search (permission-gated server-side)
 *
 * Output is deliberately boring: a huge green AUTHORIZED or red
 * NOT AUTHORIZED with the learner's photo and the pass facts.
 */
import React, { useCallback, useState } from 'react';
import { Search, Loader2, DoorOpen, CreditCard, Fingerprint, User } from 'lucide-react';

const COLOR: Record<string, string> = { allowed: 'bg-emerald-600', denied: 'bg-rose-600', review: 'bg-amber-500' };

export default function GatePage() {
  const [mode, setMode] = useState<'card' | 'manual'>('card');
  const [q, setQ] = useState('');
  const [cardNo, setCardNo] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<any>(null);

  const search = useCallback(async (term: string) => {
    setQ(term); setVerdict(null);
    if (term.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/students/enrolled?search=${encodeURIComponent(term)}`, { cache: 'no-store' });
    setResults(((await r.json()).data || []).slice(0, 8));
  }, []);

  const runGate = useCallback(async (body: any) => {
    setBusy(true); setResults([]); setQ(''); setCardNo('');
    try {
      const r = await fetch('/api/passouts/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { setVerdict({ decision: 'denied', title: 'ERROR', reason: j.error || 'Request failed' }); return; }
      setVerdict(j);
    } finally { setBusy(false); }
  }, []);

  const verifyByCard = useCallback(() => {
    if (cardNo.trim()) runGate({ admission_no: cardNo.trim() });
  }, [cardNo, runGate]);

  const learnerName = verdict?.learner?.name || verdict?.name;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200">
          <DoorOpen className="w-6 h-6 text-indigo-600" />
          <h1 className="text-lg font-bold">Gate Verification</h1>
        </div>
        <p className="text-xs text-gray-500 flex items-center gap-1.5">
          <Fingerprint className="w-3.5 h-3.5" /> Fingerprint scans on a gate device verify automatically — use the options below otherwise.
        </p>

        {/* Method tabs */}
        <div className="flex gap-2">
          {([['card', 'Student ID', CreditCard], ['manual', 'Search learner', User]] as const).map(([key, label, Icon]) => (
            <button
              key={key}
              onClick={() => { setMode(key); setVerdict(null); setResults([]); }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-sm font-medium border ${
                mode === key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'
              }`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {mode === 'card' ? (
          <div className="flex gap-2">
            <input
              autoFocus value={cardNo}
              onChange={(e) => { setCardNo(e.target.value); setVerdict(null); }}
              onKeyDown={(e) => e.key === 'Enter' && verifyByCard()}
              placeholder="Type or scan student ID number…"
              className="flex-1 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-base"
            />
            <button onClick={verifyByCard} disabled={!cardNo.trim() || busy}
              className="px-4 py-2.5 rounded-xl bg-indigo-600 text-white font-medium disabled:opacity-50">Verify</button>
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
            <Search className="w-5 h-5 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Search learner…" className="flex-1 bg-transparent outline-none text-base" />
          </div>
        )}

        {results.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {results.map((s) => (
              <button key={s.id} onClick={() => runGate({ student_id: s.id })} className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="font-medium">{s.display_name || `${s.first_name} ${s.last_name}`}</div>
                <div className="text-xs text-gray-400">{s.admission_no} · {s.class_name}</div>
              </button>
            ))}
          </div>
        )}

        {busy && <div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 inline" /></div>}

        {verdict && !busy && (
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <div className={`${COLOR[verdict.decision] || 'bg-gray-500'} text-white p-8 text-center`}>
              <div className="text-4xl font-extrabold tracking-wide">{verdict.title}</div>
              <div className="text-sm opacity-90 mt-2">{verdict.reason}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 space-y-2 text-sm">
              <div className="flex items-center gap-3">
                {verdict.learner?.photo_url ? (
                  <img src={verdict.learner.photo_url} alt="" className="w-14 h-14 rounded-full object-cover border-2 border-gray-200 dark:border-gray-600" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center"><User className="w-7 h-7 text-gray-400" /></div>
                )}
                <div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">{learnerName}</div>
                  <div className="text-gray-500">
                    {(verdict.learner?.admission_no || verdict.admission_no) ?? ''}
                    {(verdict.learner?.class_name || verdict.class_name) ? ` · ${verdict.learner?.class_name || verdict.class_name}` : ''}
                  </div>
                </div>
              </div>
              {verdict.passout?.passout_no && <div><span className="text-gray-400">Pass:</span> <span className="font-mono">{verdict.passout.passout_no}</span></div>}
              {verdict.passout?.reason && <div><span className="text-gray-400">Reason:</span> {verdict.passout.reason}</div>}
              {verdict.passout?.destination && <div><span className="text-gray-400">Destination:</span> {verdict.passout.destination}</div>}
              {(verdict.passout?.is_emergency || verdict.passout?.is_medical) && (
                <div className="flex gap-1.5">
                  {verdict.passout.is_emergency ? <span className="text-[11px] px-2 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-medium">EMERGENCY</span> : null}
                  {verdict.passout.is_medical ? <span className="text-[11px] px-2 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-medium">MEDICAL</span> : null}
                </div>
              )}
              {verdict.outcome === 'exit_allowed' && <div><span className="text-gray-400">Leaving:</span> {new Date().toLocaleTimeString()}</div>}
              {verdict.passout?.actual_exit_at && verdict.outcome !== 'exit_allowed' && <div><span className="text-gray-400">Left at:</span> {new Date(verdict.passout.actual_exit_at).toLocaleString()}</div>}
              {verdict.passout?.approved_until && <div><span className="text-gray-400">Valid until:</span> {new Date(verdict.passout.approved_until).toLocaleString()}</div>}
              {verdict.passout?.expected_return_at && <div><span className="text-gray-400">Expected return:</span> {new Date(verdict.passout.expected_return_at).toLocaleString()}</div>}
              {verdict.approved_by_name && <div><span className="text-gray-400">Approved by:</span> {verdict.approved_by_name}</div>}
              <button onClick={() => setVerdict(null)} className="mt-3 w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 font-medium">Next learner</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
