'use client';

/**
 * Pass-outs — learner movement management.
 *
 * Deliberately boring: verify identity FIRST (student ID or search), see the
 * full learner panel (photo, guardian, history, active pass), then create.
 * Approval follows the school's configured workflow. The gate + SMS act only
 * on verified facts.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  DoorOpen, Loader2, Plus, Check, X, Search, ShieldCheck, RadioTower,
  User, CreditCard, Settings2, AlertTriangle, Clock, Phone,
} from 'lucide-react';
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
  const [showSettings, setShowSettings] = useState(false);

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
    const j = await r.json();
    if (j.success) { toast.success(j.message || `${action}d`); load(); } else toast.error(j.error || 'Failed');
  }, [load]);

  const cards = [
    ['pending', 'Pending', dash?.pending], ['approved', 'Approved', dash?.approved],
    ['used', 'Outside now', dash?.currently_out], ['overdue', 'Overdue', dash?.overdue],
    ['', 'Exits today', dash?.exits_today], ['', 'Returns today', dash?.returns_today],
    ['', 'Late returns', dash?.late_returns_today], ['', 'Denied today', dash?.denied_today],
  ] as const;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><DoorOpen className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
          <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Pass-outs</h1><p className="text-sm text-gray-500">Verified learner movement — identity first, gate enforced, parents informed.</p></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href="/passouts/gate" className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><RadioTower className="w-4 h-4" /> Gate mode</a>
          <button onClick={() => setShowDevices(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><ShieldCheck className="w-4 h-4" /> Gate devices</button>
          <button onClick={() => setShowSettings(true)} className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-sm"><Settings2 className="w-4 h-4" /> Settings</button>
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium"><Plus className="w-4 h-4" /> New pass-out</button>
        </div>
      </div>

      {/* Counts */}
      <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
        {cards.map(([k, label, n]) => (
          <button key={label} onClick={() => setFilter(filter === k ? '' : (k as string))} className={`rounded-xl border p-2.5 text-left ${filter === k && k ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'} bg-white dark:bg-gray-800`}>
            <div className="text-[11px] text-gray-500 truncate">{label}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-white">{n ?? 0}</div>
          </button>
        ))}
      </div>

      {/* Intelligence: who is outside right now + who is due back */}
      {(dash?.outside_now?.length > 0 || dash?.expected_back_today?.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-1.5"><DoorOpen className="w-4 h-4 text-indigo-500" /> Outside school now ({dash.outside_now.length})</p>
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {dash.outside_now.map((r: any) => (
                <div key={r.id} className="flex items-center justify-between text-xs">
                  <span className="truncate text-gray-700 dark:text-gray-200">
                    {r.name} <span className="text-gray-400">{r.class_name || ''}</span>
                    {Number(r.is_emergency) ? <span className="ml-1 text-rose-600 font-semibold">EMG</span> : null}
                    {Number(r.is_medical) ? <span className="ml-1 text-sky-600 font-semibold">MED</span> : null}
                  </span>
                  <span className={`whitespace-nowrap ${r.status === 'overdue' ? 'text-rose-600 font-semibold' : 'text-gray-400'}`}>
                    {r.status === 'overdue' ? 'OVERDUE' : r.expected_return_at ? `back ${new Date(r.expected_return_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'out'}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2 flex items-center gap-1.5"><Clock className="w-4 h-4 text-amber-500" /> Frequent leavers (30 days)</p>
            {(!dash?.frequent_leavers || dash.frequent_leavers.length === 0)
              ? <p className="text-xs text-gray-400">None — no learner has left more than once.</p>
              : (
                <div className="space-y-1.5 max-h-52 overflow-y-auto">
                  {dash.frequent_leavers.map((r: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="truncate text-gray-700 dark:text-gray-200">{r.name} <span className="text-gray-400">{r.class_name || ''}</span></span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{r.passes}×</span>
                    </div>
                  ))}
                </div>
              )}
          </div>
        </div>
      )}

      {/* List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500"><tr>
            <th className="px-3 py-2 text-left">Pass No</th><th className="px-3 py-2 text-left">Learner</th><th className="px-3 py-2 text-left">Class</th>
            <th className="px-3 py-2 text-left">Reason</th><th className="px-3 py-2 text-left">Valid until</th><th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>}
            {!loading && rows.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">No pass-outs.</td></tr>}
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-gray-100 dark:border-gray-700/50">
                <td className="px-3 py-2 font-mono text-xs text-gray-500">{r.passout_no || `#${r.id}`}</td>
                <td className="px-3 py-2 font-medium text-gray-800 dark:text-gray-100">
                  {r.student_name}<span className="text-gray-400 text-xs ml-1">{r.admission_no}</span>
                  {Number(r.is_emergency) ? <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300 font-semibold">EMG</span> : null}
                  {Number(r.is_medical) ? <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 font-semibold">MED</span> : null}
                </td>
                <td className="px-3 py-2 text-gray-500">{r.class_name || '—'}</td>
                <td className="px-3 py-2 text-gray-500 max-w-[160px] truncate">{r.reason || '—'}{r.destination ? ` → ${r.destination}` : ''}</td>
                <td className="px-3 py-2 text-gray-500 text-xs">{r.approved_until ? new Date(r.approved_until).toLocaleString() : '—'}</td>
                <td className="px-3 py-2">
                  <span className={`text-[11px] px-2 py-0.5 rounded capitalize ${STATUS[r.status] || ''}`}>{r.status}</span>
                  {r.status === 'pending' && r.first_approved_by ? <span className="ml-1 text-[10px] text-emerald-600">1/2 approved</span> : null}
                  {r.status === 'returned' && Number(r.returned_late) ? <span className="ml-1 text-[10px] text-rose-600">late</span> : null}
                </td>
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
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}

/* ── Verify-first create flow (Phases 4–5) ──────────────────────────────── */
function CreateModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [tab, setTab] = useState<'card' | 'manual'>('card');
  const [cardNo, setCardNo] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [panel, setPanel] = useState<any>(null); // verified learner panel
  const [form, setForm] = useState<any>({
    reason: '', destination: '', approved_until: '', expected_return_at: '',
    accompanied_by: '', transport_method: '', notes: '',
    is_emergency: false, is_medical: false, approve_now: true,
  });
  const [busy, setBusy] = useState(false);

  const search = useCallback(async (term: string) => {
    setQ(term);
    if (term.trim().length < 2) { setResults([]); return; }
    const r = await fetch(`/api/students/enrolled?search=${encodeURIComponent(term)}`, { cache: 'no-store' });
    setResults(((await r.json()).data || []).slice(0, 8));
  }, []);

  const verify = useCallback(async (body: any) => {
    setVerifying(true); setResults([]);
    try {
      const r = await fetch('/api/passouts/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok || !j.verified) { toast.error(j.reason || j.error || 'Verification failed'); return; }
      setPanel(j);
    } finally { setVerifying(false); }
  }, []);

  const submit = useCallback(async () => {
    if (!panel) return;
    setBusy(true);
    try {
      const r = await fetch('/api/passouts', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          student_id: panel.student.id, ...form,
          approved_until: form.approved_until || null, expected_return_at: form.expected_return_at || null,
          verify_method: panel.method,
        }),
      });
      const j = await r.json();
      if (j.success) { toast.success(`Pass ${j.passout_no || ''} ${j.status}`); onDone(); } else toast.error(j.error || 'Failed');
    } finally { setBusy(false); }
  }, [panel, form, onDone]);

  const S = panel?.student;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-lg space-y-3 my-8" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">New pass-out</h2>

        {!panel ? (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">Verify the learner's identity first — by student ID or search.</p>
            <div className="flex gap-2">
              {([['card', 'Student ID', CreditCard], ['manual', 'Search', Search]] as const).map(([key, label, Icon]) => (
                <button key={key} onClick={() => setTab(key)} className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-sm font-medium border ${tab === key ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-gray-700 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-gray-600'}`}>
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
            {tab === 'card' ? (
              <div className="flex gap-2">
                <input autoFocus value={cardNo} onChange={(e) => setCardNo(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && cardNo.trim() && verify({ method: 'card', admission_no: cardNo.trim() })}
                  placeholder="Student ID / admission number…"
                  className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
                <button onClick={() => verify({ method: 'card', admission_no: cardNo.trim() })} disabled={!cardNo.trim() || verifying}
                  className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
                  {verifying ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Verify'}
                </button>
              </div>
            ) : (
              <div>
                <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700">
                  <Search className="w-4 h-4 text-gray-400" />
                  <input autoFocus value={q} onChange={(e) => search(e.target.value)} placeholder="Search learner by name or reg no…" className="flex-1 bg-transparent text-sm outline-none" />
                </div>
                <div className="mt-2 max-h-56 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                  {results.map((s) => (
                    <button key={s.id} onClick={() => verify({ method: 'manual', student_id: s.id })} className="w-full text-left px-2 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm">
                      {s.display_name || `${s.first_name} ${s.last_name}`} <span className="text-gray-400 text-xs">{s.admission_no} · {s.class_name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {/* Verified learner panel — the operator KNOWS this is the right child */}
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900/40 space-y-2">
              <div className="flex items-center gap-3">
                {S.photo_url
                  ? <img src={S.photo_url} alt="" className="w-12 h-12 rounded-full object-cover border-2 border-emerald-400" />
                  : <div className="w-12 h-12 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center"><User className="w-6 h-6 text-gray-400" /></div>}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 dark:text-white truncate">{S.name}
                    <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 font-medium uppercase">verified · {panel.method}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {S.admission_no} · {S.class_name || 'no class'}{S.stream_name ? ` (${S.stream_name})` : ''} · {S.gender || '—'}
                    {panel.attendance_today ? ` · today: ${panel.attendance_today}` : ''}
                  </div>
                </div>
                <button onClick={() => setPanel(null)} className="text-xs text-indigo-600 whitespace-nowrap">change</button>
              </div>
              {panel.guardian && (
                <div className="text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-gray-400" />
                  {panel.guardian.name || 'Guardian'}{panel.guardian.relationship ? ` (${panel.guardian.relationship})` : ''} · {panel.guardian.phone || 'no phone — SMS will not send'}
                </div>
              )}
              {panel.total_passouts > 0 && <div className="text-xs text-gray-400">{panel.total_passouts} previous pass-out{panel.total_passouts === 1 ? '' : 's'}</div>}
              {panel.outstanding_return && (
                <div className="text-xs text-rose-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> Learner is currently OUT and has not returned — a new pass cannot be issued.</div>
              )}
              {panel.active_passout && !panel.outstanding_return && (
                <div className="text-xs text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> An active pass ({panel.active_passout.status}) already exists — creating another will supersede it at the gate.</div>
              )}
            </div>

            {/* Pass details */}
            <input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason (e.g. Medical appointment)" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <input value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} placeholder="Destination" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            <div className="grid grid-cols-2 gap-2">
              <label className="text-xs text-gray-500">Valid until<input type="datetime-local" value={form.approved_until} onChange={(e) => setForm({ ...form, approved_until: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
              <label className="text-xs text-gray-500">Expected return<input type="datetime-local" value={form.expected_return_at} onChange={(e) => setForm({ ...form, expected_return_at: e.target.value })} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" /></label>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={form.accompanied_by} onChange={(e) => setForm({ ...form, accompanied_by: e.target.value })} placeholder="Accompanied by (optional)" className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
              <select value={form.transport_method} onChange={(e) => setForm({ ...form, transport_method: e.target.value })} className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm text-gray-600 dark:text-gray-300">
                <option value="">Transport (optional)</option>
                <option>Walking</option><option>Parent vehicle</option><option>School vehicle</option><option>Boda/Taxi</option><option>Ambulance</option>
              </select>
            </div>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} placeholder="Supporting notes (optional)" className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm resize-none" />
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_emergency} onChange={(e) => setForm({ ...form, is_emergency: e.target.checked })} /> <span className="text-rose-600 font-medium">Emergency</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.is_medical} onChange={(e) => setForm({ ...form, is_medical: e.target.checked })} /> <span className="text-sky-600 font-medium">Medical</span></label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.approve_now} onChange={(e) => setForm({ ...form, approve_now: e.target.checked })} /> Approve immediately</label>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
          <button onClick={submit} disabled={busy || !panel || panel.outstanding_return}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">
            {busy && <Loader2 className="w-4 h-4 animate-spin" />}Create pass-out
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── School settings (Phase 9) — notification + approval configuration ──── */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [s, setS] = useState<any>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => { fetch('/api/passouts/settings', { cache: 'no-store' }).then((r) => r.json()).then((j) => setS(j.settings)); }, []);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const r = await fetch('/api/passouts/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(s) });
      if ((await r.json()).success) { toast.success('Settings saved'); onClose(); } else toast.error('Failed');
    } finally { setSaving(false); }
  }, [s, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">Pass-out settings</h2>
        {!s ? <div className="py-8 text-center"><Loader2 className="w-5 h-5 animate-spin inline text-indigo-600" /></div> : (
          <>
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-gray-500 uppercase">Parent SMS (sent only after verified gate events)</p>
              {([
                ['notify_exit', 'Notify parent when learner exits the gate'],
                ['notify_return', 'Notify parent when learner returns'],
                ['emergency_only', 'Only notify for emergency / medical passes'],
                ['notifications_disabled', 'Disable ALL pass-out notifications'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center justify-between text-sm">
                  <span className={key === 'notifications_disabled' ? 'text-rose-600' : ''}>{label}</span>
                  <input type="checkbox" checked={!!s[key]} onChange={(e) => setS({ ...s, [key]: e.target.checked })} className="w-4 h-4" />
                </label>
              ))}
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-gray-500 uppercase">Approval workflow</p>
              <select value={s.approval_mode} onChange={(e) => setS({ ...s, approval_mode: e.target.value })} className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
                <option value="single">Single approval (any approver)</option>
                <option value="two_step">Two-step (two different approvers required)</option>
              </select>
              <p className="text-[11px] text-gray-400">Two-step: e.g. class teacher approves first, then an administrator finalizes. The gate only opens after the final approval.</p>
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={onClose} className="px-4 py-2 text-sm text-gray-500">Cancel</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium disabled:opacity-50">{saving && <Loader2 className="w-4 h-4 animate-spin" />}Save</button>
            </div>
          </>
        )}
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
        <p className="text-xs text-gray-500">Turn a device into a pass-out gate — its fingerprint scans then show the AUTHORIZED / NOT AUTHORIZED verdict in the live popup.</p>
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
