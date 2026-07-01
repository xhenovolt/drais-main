'use client';

/**
 * Visitation cards — issue parent/guardian cards and verify them at the gate.
 * Scan/enter a card UID → VISIT ALLOWED / DENIED / UNKNOWN CARD.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { IdCard, Loader2, Plus, Search, ScanLine, Ban, RotateCcw } from 'lucide-react';
import { toast } from 'react-hot-toast';

const CARD_STATUS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  suspended: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  lost: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  expired: 'bg-gray-100 text-gray-500',
};
const COLOR: Record<string, string> = { allowed: 'bg-emerald-600', denied: 'bg-rose-600', review: 'bg-amber-500' };

export default function VisitationPage() {
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showIssue, setShowIssue] = useState(false);
  const [uid, setUid] = useState('');
  const [verdict, setVerdict] = useState<any>(null);
  const [verifying, setVerifying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await fetch('/api/visitation', { cache: 'no-store' }); setRows((await r.json()).rows || []); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const verify = useCallback(async () => {
    if (!uid.trim()) return;
    setVerifying(true); setVerdict(null);
    try {
      const r = await fetch('/api/visitation/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ card_uid: uid.trim() }) });
      setVerdict(await r.json());
    } finally { setVerifying(false); }
  }, [uid]);

  const setStatus = useCallback(async (id: number, status: string) => {
    await fetch(`/api/visitation/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) });
    toast.success('Updated'); load();
  }, [load]);

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><IdCard className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Visitation Cards</h1><p className="text-sm text-gray-500">Issue guardian cards; verify visits/pickups at the gate.</p></div>
        </div>
        <button onClick={() => setShowIssue(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> Issue card</button>
      </div>

      {/* Verify */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 space-y-3">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-200 flex items-center gap-2"><ScanLine className="w-4 h-4" /> Verify a card</p>
        <div className="flex gap-2">
          <input autoFocus value={uid} onChange={(e) => setUid(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && verify()} placeholder="Scan or type card UID…" className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
          <button onClick={verify} disabled={verifying} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}</button>
        </div>
        {verdict && (
          <div className="rounded-xl overflow-hidden">
            <div className={`${COLOR[verdict.decision] || 'bg-gray-500'} text-white p-4 text-center`}>
              <div className="text-2xl font-extrabold">{verdict.title}</div>
              <div className="text-sm opacity-90">{verdict.reason}</div>
            </div>
            {verdict.card && (
              <div className="bg-gray-50 dark:bg-gray-900/40 p-3 text-sm space-y-0.5">
                {verdict.card.guardian_name && <div><span className="text-gray-400">Guardian:</span> {verdict.card.guardian_name}</div>}
                {verdict.card.student_name && <div><span className="text-gray-400">Learner:</span> {verdict.card.student_name} {verdict.card.class_name ? `· ${verdict.card.class_name}` : ''}</div>}
                <div><span className="text-gray-400">Card:</span> {verdict.card.card_uid} · <span className="capitalize">{verdict.card.status}</span></div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cards list */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr><th className="px-3 py-2 text-left">Card UID</th><th className="px-3 py-2 text-left">Guardian</th><th className="px-3 py-2 text-left">Learner</th><th className="px-3 py-2 text-left">Type</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No cards issued.</td></tr>}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-3 py-2 font-mono text-xs">{c.card_uid}</td>
                <td className="px-3 py-2">{c.guardian_name || '—'}</td>
                <td className="px-3 py-2 text-gray-500">{c.student_name || '—'}</td>
                <td className="px-3 py-2 text-gray-500">{c.card_type}</td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded capitalize ${CARD_STATUS[c.status] || ''}`}>{c.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {c.status === 'active'
                    ? <button onClick={() => setStatus(c.id, 'suspended')} className="text-xs text-amber-600 inline-flex items-center gap-1"><Ban className="w-3.5 h-3.5" /> suspend</button>
                    : <button onClick={() => setStatus(c.id, 'active')} className="text-xs text-emerald-600 inline-flex items-center gap-1"><RotateCcw className="w-3.5 h-3.5" /> activate</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showIssue && <IssueModal onClose={() => setShowIssue(false)} onDone={() => { setShowIssue(false); load(); }} />}
    </div>
  );
}

function IssueModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [form, setForm] = useState<any>({ card_uid: '', card_type: 'zkteco_rfid', notes: '', expires_at: '' });
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [student, setStudent] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/students/enrolled?search=${encodeURIComponent(term)}`, { cache: 'no-store' });
    setResults(((await r.json()).data || []).slice(0, 6));
  }, []);

  const submit = useCallback(async () => {
    if (!form.card_uid.trim()) { toast.error('Card UID required'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/visitation', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, student_id: student?.id ?? null, expires_at: form.expires_at || null }) });
      const j = await r.json();
      if (j.success) { toast.success('Card issued'); onDone(); } else toast.error(j.error || 'Failed');
    } finally { setBusy(false); }
  }, [form, student, onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Issue visitation card</h2>
        <input value={form.card_uid} onChange={(e) => setForm({ ...form, card_uid: e.target.value })} placeholder="Card UID (scan the RFID card)" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
        <select value={form.card_type} onChange={(e) => setForm({ ...form, card_type: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
          <option value="zkteco_rfid">ZKTeco RFID</option><option value="manual">Manual</option><option value="qr">QR</option>
        </select>
        {student ? (
          <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm"><span>{student.display_name || `${student.first_name} ${student.last_name}`}</span><button onClick={() => setStudent(null)} className="text-xs text-indigo-600">change</button></div>
        ) : (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input value={q} onChange={(e) => search(e.target.value)} placeholder="Link to learner (optional)…" className="flex-1 bg-transparent text-sm outline-none" /></div>
            {results.length > 0 && <div className="mt-1 max-h-40 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">{results.map((s) => <button key={s.id} onClick={() => { setStudent(s); setResults([]); setQ(''); }} className="w-full text-left px-2 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">{s.display_name || `${s.first_name} ${s.last_name}`} <span className="text-gray-400 text-xs">{s.admission_no}</span></button>)}</div>}
          </div>
        )}
        <label className="text-xs text-gray-500 block">Expires (optional)<input type="date" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button><button onClick={submit} disabled={busy} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Issue</button></div>
      </div>
    </div>
  );
}
