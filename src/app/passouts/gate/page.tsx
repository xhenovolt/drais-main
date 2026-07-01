'use client';

/**
 * Pass-out Gate mode — mobile-first officer screen. Fingerprint scans on a
 * gate-tagged device pop the verdict automatically (live popup); this page is
 * the manual fallback: search a learner and verify. Big, glanceable result.
 */
import React, { useCallback, useState } from 'react';
import { Search, Loader2, DoorOpen } from 'lucide-react';

const COLOR: Record<string, string> = { allowed: 'bg-emerald-600', denied: 'bg-rose-600', review: 'bg-amber-500' };

export default function GatePage() {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [verdict, setVerdict] = useState<any>(null);

  const search = useCallback(async (term: string) => {
    setQ(term); setVerdict(null);
    if (term.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/students/enrolled?search=${encodeURIComponent(term)}`, { cache: 'no-store' });
    setResults(((await r.json()).data || []).slice(0, 8));
  }, []);

  const verify = useCallback(async (student: any) => {
    setBusy(true); setResults([]); setQ('');
    try {
      const r = await fetch('/api/passouts/gate', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: student.id }) });
      const j = await r.json();
      setVerdict({ ...j, name: student.display_name || `${student.first_name} ${student.last_name}`, admission_no: student.admission_no, class_name: student.class_name });
    } finally { setBusy(false); }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900 px-4 py-6">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-200"><DoorOpen className="w-6 h-6 text-indigo-600" /><h1 className="text-lg font-bold">Gate — Pass-out</h1></div>

        <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800">
          <Search className="w-5 h-5 text-gray-400" />
          <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Search learner…" className="flex-1 bg-transparent outline-none text-base" />
        </div>

        {results.length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700">
            {results.map((s) => (
              <button key={s.id} onClick={() => verify(s)} className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="font-medium">{s.display_name || `${s.first_name} ${s.last_name}`}</div>
                <div className="text-xs text-gray-400">{s.admission_no} · {s.class_name}</div>
              </button>
            ))}
          </div>
        )}

        {busy && <div className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin text-indigo-600 inline" /></div>}

        {verdict && !busy && (
          <div className="rounded-2xl overflow-hidden shadow-lg">
            <div className={`${COLOR[verdict.decision] || 'bg-gray-500'} text-white p-6 text-center`}>
              <div className="text-3xl font-extrabold tracking-wide">{verdict.title}</div>
              <div className="text-sm opacity-90 mt-1">{verdict.reason}</div>
            </div>
            <div className="bg-white dark:bg-gray-800 p-4 space-y-1.5 text-sm">
              <div className="text-lg font-bold text-gray-900 dark:text-white">{verdict.name}</div>
              <div className="text-gray-500">{verdict.admission_no} · {verdict.class_name}</div>
              {verdict.passout?.destination && <div><span className="text-gray-400">Destination:</span> {verdict.passout.destination}</div>}
              {verdict.passout?.approved_until && <div><span className="text-gray-400">Valid until:</span> {new Date(verdict.passout.approved_until).toLocaleString()}</div>}
              {verdict.passout?.expected_return_at && <div><span className="text-gray-400">Expected return:</span> {new Date(verdict.passout.expected_return_at).toLocaleString()}</div>}
              {verdict.decision === 'allowed' && verdict.passout?.guardian_phone && <div><span className="text-gray-400">Guardian:</span> {verdict.passout.guardian_phone}</div>}
              <button onClick={() => setVerdict(null)} className="mt-3 w-full py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 font-medium">Next learner</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
