'use client';

/**
 * Pass-outs — dashboard + list + create. Headteacher/admin create & approve
 * permission slips; the gate popup then decides ALLOWED/NOT ALLOWED on scan.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { DoorOpen, Loader2, Plus, Check, X, Search, ShieldCheck, RadioTower } from 'lucide-react';
import { toast } from 'react-hot-toast';

const STATUS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  approved: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  used: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  returned: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  overdue: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
  rejected: 'bg-gray-100 text-gray-500', cancelled: 'bg-gray-100 text-gray-500',
};

export default function PassoutsPage() {
  const [dash, setDash] = useState<any>(null);
  const [rows, setRows] = useState<any[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [showDevices, setShowDevices] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, l] = await Promise.all([
        fetch('/api/passouts?dashboard=1', { cache: 'no-store' }).then((r) => r.json()),
        fetch(`/api/passouts${filter ? `?status=${filter}` : ''}`, { cache: 'no-store' }).then((r) => r.json()),
      ]);
      setDash(d.dashboard); setRows(l.rows || []);
    } finally { setLoading(false); }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (id: number, action: string) => {
    const r = await fetch(`/api/passouts/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    if ((await r.json()).success) { toast.success(action + 'd'); load(); } else toast.error('Failed');
  }, [load]);

  const cards = [
    ['approved', 'Approved', dash?.approved], ['pending', 'Pending', dash?.pending],
    ['used', 'Currently out', dash?.currently_out], ['overdue', 'Overdue', dash?.overdue],
    ['returned', 'Returned', dash?.returned], ['', 'Denied today', dash?.denied_today],
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><DoorOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Pass-outs</h1><p className="text-sm text-gray-500">Permission slips verified at the gate by fingerprint.</p></div>
        </div>
        <div className="flex items-center gap-2">
          <a href="/passouts/gate" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RadioTower className="w-4 h-4" /> Gate mode</a>
          <button onClick={() => setShowDevices(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><ShieldCheck className="w-4 h-4" /> Gate devices</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> New pass-out</button>
        </div>
      </div>

      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {cards.map(([k, label, n]) => (
          <button key={label} onClick={() => setFilter(filter === k ? '' : (k as string))} className={`rounded-xl border p-3 text-left ${filter === k && k ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'} bg-white dark:bg-gray-800`}>
            <div className="text-xs text-gray-500 truncate">{label}</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{n ?? 0}</div>
          </button>
        ))}
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr><th className="px-3 py-2 text-left">Learner</th><th className="px-3 py-2 text-left">Class</th><th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Valid until</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2"></th></tr></thead>
          <tbody>
            {loading && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">No pass-outs.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">{r.student_name}<span className="text-gray-400 text-xs ml-1">{r.admission_no}</span></td>
                <td className="px-3 py-2 text-gray-500">{r.class_name || '—'}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{r.reason || '—'}{r.destination ? ` → ${r.destination}` : ''}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{r.approved_until ? new Date(r.approved_until).toLocaleString() : '—'}</td>
                <td className="px-3 py-2"><span className={`text-[11px] px-2 py-0.5 rounded capitalize ${STATUS[r.status] || ''}`}>{r.status}</span></td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {r.status === 'pending' && (
                    <span className="inline-flex gap-1">
                      <button onClick={() => act(r.id, 'approve')} title="Approve" className="p-1 rounded bg-emerald-600 text-white"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => act(r.id, 'reject')} title="Reject" className="p-1 rounded bg-rose-600 text-white"><X className="w-3.5 h-3.5" /></button>
                    </span>
                  )}
                  {(r.status === 'approved' || r.status === 'pending') && <button onClick={() => act(r.id, 'cancel')} className="text-xs text-gray-500 ml-2 hover:underline">cancel</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
      {showDevices && <DevicesModal onClose={() => setShowDevices(false)} />}
    </div>
  );
}

function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [picked, setPicked] = useState<any>(null);
  const [form, setForm] = useState<any>({ reason: '', destination: '', approved_until: '', expected_return_at: '', approve_now: true });
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/students/enrolled?search=${encodeURIComponent(term)}`, { cache: 'no-store' });
    const j = await r.json();
    setResults((j.data || []).slice(0, 8));
  }, []);

  const submit = useCallback(async () => {
    if (!picked) { toast.error('Pick a learner'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/passouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ student_id: picked.id, ...form, approved_until: form.approved_until || null, expected_return_at: form.expected_return_at || null }) });
      const j = await r.json();
      if (j.success) { toast.success(`Pass-out ${j.status}`); onDone(); } else toast.error(j.error || 'Failed');
    } finally { setBusy(false); }
  }, [picked, form, onDone]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">New pass-out</h2>
        {!picked ? (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700"><Search className="w-4 h-4 text-gray-400" /><input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Search learner by name or reg no…" className="flex-1 bg-transparent text-sm outline-none" /></div>
            <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
              {results.map((s) => (
                <button key={s.id} onClick={() => setPicked(s)} className="w-full text-left px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                  {s.display_name || `${s.first_name} ${s.last_name}`} <span className="text-gray-400 text-xs">{s.admission_no} · {s.class_name}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2 rounded-lg bg-gray-50 dark:bg-gray-900/40 text-sm">
              <span className="font-medium">{picked.display_name || `${picked.first_name} ${picked.last_name}`} <span className="text-gray-400 text-xs">{picked.admission_no}</span></span>
              <button onClick={() => setPicked(null)} className="text-xs text-indigo-600">change</button>
            </div>
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason (e.g. Clinic visit)" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Destination" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Valid until<input type="datetime-local" value={form.approved_until} onChange={(e) => setForm({ ...form, approved_until: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Expected return<input type="datetime-local" value={form.expected_return_at} onChange={(e) => setForm({ ...form, expected_return_at: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.approve_now} onChange={(e) => setForm({ ...form, approve_now: e.target.checked })} /> Approve immediately</label>
          </div>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          <button onClick={submit} disabled={busy || !picked} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Create</button>
        </div>
      </div>
    </div>
  );
}

function DevicesModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const load = useCallback(async () => { const r = await fetch('/api/passouts/devices', { cache: 'no-store' }); setRows((await r.json()).rows || []); }, []);
  useEffect(() => { load(); }, [load]);
  const toggle = useCallback(async (sn: string, on: boolean) => {
    await fetch('/api/passouts/devices', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sn, passout_enabled: on }) });
    setRows((p) => p.map((d) => d.sn === sn ? { ...d, passout_enabled: on ? 1 : 0 } : d)); toast.success('Updated');
  }, []);
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Gate devices</h2>
        <p className="text-xs text-gray-500">Turn a device into a pass-out gate — its fingerprint scans then show the ALLOWED / NOT ALLOWED verdict in the live popup.</p>
        <div className="divide-y divide-gray-100 dark:divide-gray-700 max-h-72 overflow-y-auto">
          {rows.length === 0 && <p className="py-6 text-center text-gray-400 text-sm">No devices.</p>}
          {rows.map((d) => (
            <label key={d.sn} className="flex items-center justify-between py-2.5">
              <span className="text-sm"><span className="font-medium">{d.device_name || d.sn}</span><span className="text-gray-400 text-xs ml-1">{d.device_type || 'device'} · {d.is_online ? 'online' : 'offline'}</span></span>
              <input type="checkbox" checked={Number(d.passout_enabled) === 1} onChange={(e) => toggle(d.sn, e.target.checked)} className="w-5 h-5" />
            </label>
          ))}
        </div>
        <div className="flex justify-end"><button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-100 dark:bg-gray-700">Done</button></div>
      </div>
    </div>
  );
}
