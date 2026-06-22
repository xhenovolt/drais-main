'use client';

/**
 * Tahfiz Participants — the canonical Tahfiz learner surface (Phase 1).
 * Mark existing students as Tahfiz participants (academic+tahfiz or tahfiz-only),
 * suspend / withdraw / remove — WITHOUT ever deleting the student record.
 */
import { useEffect, useState, useCallback } from 'react';
import { UserPlus, Search, RefreshCw, X, Check, Pause, Play, LogOut, Award } from 'lucide-react';

const j = (u, opts) => fetch(u, opts).then(r => r.json());

const STATUS_STYLE = {
  active:    'bg-emerald-100 text-emerald-700',
  suspended: 'bg-amber-100 text-amber-700',
  withdrawn: 'bg-slate-200 text-slate-600',
  completed: 'bg-blue-100 text-blue-700',
};

export default function TahfizParticipantsPage() {
  const [participants, setParticipants] = useState(null);
  const [summary, setSummary] = useState(null);
  const [msg, setMsg] = useState('');
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    const [list, sum] = await Promise.all([
      j('/api/tahfiz/enrollments').catch(() => null),
      j('/api/tahfiz/enrollments?summary=1').catch(() => null),
    ]);
    setParticipants(list?.participants ?? []);
    setSummary(sum?.summary ?? null);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function act(id, action) {
    const r = await j(`/api/tahfiz/enrollments/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) }).catch(() => null);
    setMsg(r?.success ? `Marked ${r.status}` : (r?.error || 'Failed')); load();
  }
  async function remove(id) {
    if (!confirm('Remove this learner from Tahfiz? (The student record is kept.)')) return;
    const r = await j(`/api/tahfiz/enrollments/${id}`, { method: 'DELETE' }).catch(() => null);
    setMsg(r?.success ? 'Removed from Tahfiz' : (r?.error || 'Failed')); load();
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-3 mb-1">
        <h1 className="text-xl font-bold text-slate-800 dark:text-white">Tahfiz Participants</h1>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300"><RefreshCw className="w-4 h-4" /> Refresh</button>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold"><UserPlus className="w-4 h-4" /> Add participant</button>
        </div>
      </div>
      <p className="text-xs text-slate-400 mb-4">Enrolling here marks an existing student as a Tahfiz learner — it never creates or deletes student records.</p>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-5">
        <SummaryCard label="Total" value={summary?.total} tone="text-slate-800 dark:text-white" />
        <SummaryCard label="Active" value={summary?.active} tone="text-emerald-600" />
        <SummaryCard label="Suspended" value={summary?.suspended} tone="text-amber-600" />
        <SummaryCard label="Academic + Tahfiz" value={summary?.academic_plus_tahfiz} tone="text-indigo-600" />
        <SummaryCard label="Tahfiz only" value={summary?.tahfiz_only} tone="text-blue-600" />
      </div>

      {msg && <div className="mb-3 text-sm rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300">{msg}</div>}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 dark:bg-slate-800 text-left text-slate-500">
            <tr><th className="px-4 py-2.5">Learner</th><th className="px-4 py-2.5">Class</th><th className="px-4 py-2.5">Track</th><th className="px-4 py-2.5">Program</th><th className="px-4 py-2.5">Status</th><th className="px-4 py-2.5 text-right">Actions</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {!participants ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">Loading…</td></tr>
            ) : participants.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-slate-400">No Tahfiz participants yet. Click “Add participant”.</td></tr>
            ) : participants.map(p => (
              <tr key={p.id}>
                <td className="px-4 py-2.5 font-medium text-slate-800 dark:text-slate-100">{p.learner_name}<div className="text-[11px] text-slate-400">{p.admission_no || ''}</div></td>
                <td className="px-4 py-2.5 text-slate-500">{p.class_name || '—'}</td>
                <td className="px-4 py-2.5 text-slate-500">{p.track === 'tahfiz_only' ? 'Tahfiz only' : 'Academic + Tahfiz'}</td>
                <td className="px-4 py-2.5 text-slate-500 capitalize">{p.program}</td>
                <td className="px-4 py-2.5"><span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[p.status] || ''}`}>{p.status}</span></td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {p.status === 'active'
                      ? <IconBtn title="Suspend" onClick={() => act(p.id, 'suspend')}><Pause className="w-4 h-4 text-amber-600" /></IconBtn>
                      : <IconBtn title="Reactivate" onClick={() => act(p.id, 'reactivate')}><Play className="w-4 h-4 text-emerald-600" /></IconBtn>}
                    <IconBtn title="Mark completed" onClick={() => act(p.id, 'complete')}><Award className="w-4 h-4 text-blue-600" /></IconBtn>
                    <IconBtn title="Withdraw" onClick={() => act(p.id, 'withdraw')}><LogOut className="w-4 h-4 text-slate-500" /></IconBtn>
                    <IconBtn title="Remove from Tahfiz" onClick={() => remove(p.id)}><X className="w-4 h-4 text-rose-600" /></IconBtn>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {adding && <AddParticipant onClose={() => setAdding(false)} onAdded={() => { setAdding(false); setMsg('Participant added'); load(); }} />}
    </div>
  );
}

function SummaryCard({ label, value, tone }) {
  return <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5"><p className="text-[11px] text-slate-400">{label}</p><p className={`text-xl font-bold ${tone}`}>{value ?? '—'}</p></div>;
}
function IconBtn({ title, onClick, children }) {
  return <button title={title} onClick={onClick} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">{children}</button>;
}

function AddParticipant({ onClose, onAdded }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [track, setTrack] = useState('academic_plus_tahfiz');
  const [program, setProgram] = useState('hifz');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      const d = await j(`/api/students/list?search=${encodeURIComponent(q)}&limit=20`).catch(() => null);
      setResults(d?.data ?? []);
    }, 250);
    return () => clearTimeout(t);
  }, [q]);

  async function enroll(studentId) {
    setBusy(true); setErr('');
    const r = await j('/api/tahfiz/enrollments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: studentId, track, program }) }).catch(() => null);
    setBusy(false);
    if (r?.success) onAdded(); else setErr(r?.error || 'Failed to enroll');
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-slate-800 dark:text-white">Add Tahfiz participant</h2>
          <button onClick={onClose} className="p-1 text-slate-400"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex gap-2 mb-3">
          <select value={track} onChange={e => setTrack(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-sm">
            <option value="academic_plus_tahfiz">Academic + Tahfiz</option>
            <option value="tahfiz_only">Tahfiz only</option>
          </select>
          <select value={program} onChange={e => setProgram(e.target.value)} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 text-sm">
            <option value="hifz">Hifz</option>
            <option value="nazirah">Nazirah</option>
            <option value="qiraat">Qira'at</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 mb-2">
          <Search className="w-4 h-4 text-slate-400" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search student by name or admission no…" className="flex-1 bg-transparent py-2.5 text-sm outline-none text-slate-800 dark:text-white" />
        </div>
        {err && <p className="text-xs text-rose-600 mb-2">{err}</p>}
        <div className="max-h-64 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
          {q.trim().length < 2 && <p className="text-xs text-slate-400 py-6 text-center">Type at least 2 characters.</p>}
          {results.map(s => (
            <button key={s.id} disabled={busy} onClick={() => enroll(s.id)} className="w-full flex items-center justify-between px-2 py-2 text-left hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
              <span className="text-sm text-slate-700 dark:text-slate-200">{[s.first_name, s.last_name].filter(Boolean).join(' ') || s.name || `#${s.id}`}<span className="text-[11px] text-slate-400"> · {s.admission_no || ''}</span></span>
              <Check className="w-4 h-4 text-indigo-600" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
