'use client';

/**
 * Control Center → SMS → School routing.
 * Decide which SMS provider/account each school sends through — one school, a selection, or all — including
 * "school A uses whatever school B uses". No secret is ever copied or shown.
 */
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, CircleAlert, Loader2, RefreshCw, Search, ShieldCheck } from 'lucide-react';

const fetcher = async (url: string) => {
  const r = await fetch(url, { cache: 'no-store' });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error || `HTTP ${r.status}`);
  return b;
};
const inputClass = 'px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm';

type Mode = 'inherit' | 'central' | 'own' | 'same_as';
interface School {
  id: number; name: string; mode: Mode; centralProviderId: number | null; sourceSchoolId: number | null; sourceSchoolName: string | null;
  hasOwnCredentials: boolean; smsEnabled: boolean; effective: { label: string; detail: string; ok: boolean };
}
interface Provider { id: number; type: string; name: string; enabled: boolean; active: boolean; status: string }

const MODE_TEXT: Record<Mode, string> = {
  inherit: 'Default (as before)',
  central: 'A provider',
  own: "The school's own account",
  same_as: 'The same as another school',
};

export default function SmsRoutingPage() {
  const { data, error, isLoading, mutate } = useSWR<{ schools: School[]; providers: Provider[]; canManage: boolean; activeProviderId: number | null }>(
    '/api/control-center/sms/routing', fetcher, { refreshInterval: 30_000, shouldRetryOnError: false },
  );
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<Mode>('same_as');
  const [providerId, setProviderId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [checks, setChecks] = useState<Record<number, { busy?: boolean; ok?: boolean; message?: string }>>({});

  const schools = data?.schools ?? [];
  const providers = (data?.providers ?? []).filter((p) => p.enabled);
  const shown = useMemo(() => schools.filter((s) => !search.trim() || s.name.toLowerCase().includes(search.toLowerCase())), [schools, search]);
  const canManage = !!data?.canManage;

  const toggle = (id: number) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const apply = async (schoolIds: number[] | 'all') => {
    const count = schoolIds === 'all' ? schools.length : schoolIds.length;
    const what = mode === 'inherit' ? 'go back to the default'
      : mode === 'central' ? `use ${providers.find((p) => String(p.id) === providerId)?.name ?? 'the chosen provider'}`
      : mode === 'own' ? 'use their own accounts'
      : `use the same provider as ${schools.find((s) => String(s.id) === sourceId)?.name ?? 'the chosen school'}`;
    if (!confirm(`Make ${schoolIds === 'all' ? 'ALL ' + count : count} school${count === 1 ? '' : 's'} ${what}?\n\nNew messages follow this straight away. Nothing already sent is affected.`)) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/control-center/sms/routing', {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ schoolIds, mode, centralProviderId: providerId ? Number(providerId) : undefined, sourceSchoolId: sourceId ? Number(sourceId) : undefined }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error || 'Could not save');
      setMsg({ ok: true, text: `Saved — ${b.updated} school${b.updated === 1 ? '' : 's'} updated.` });
      setSelected(new Set());
      await mutate();
    } catch (e: any) { setMsg({ ok: false, text: e.message || 'Could not save' }); }
    finally { setBusy(false); }
  };

  const verify = async (id: number) => {
    setChecks((c) => ({ ...c, [id]: { busy: true } }));
    try {
      const r = await fetch('/api/control-center/sms/routing/verify', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ schoolId: id }) });
      const b = await r.json();
      setChecks((c) => ({ ...c, [id]: { ok: b.ok, message: b.message } }));
    } catch { setChecks((c) => ({ ...c, [id]: { ok: false, message: 'Check failed' } })); }
  };

  return (
    <div className="space-y-5 max-w-6xl">
      <div>
        <Link href="/control/sms" className="text-xs text-slate-400 hover:text-slate-200">← SMS</Link>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2 mt-1"><ShieldCheck className="w-6 h-6 text-indigo-400" /> School SMS routing</h1>
        <p className="text-sm text-slate-400 mt-1 max-w-3xl">
          Choose which SMS provider or account each school sends through: one school, a selection, or all. A school can also use{' '}
          <b>the same provider as another school</b> — no password is copied; it simply follows that school&apos;s account. Schools left on
          <b> Default</b> behave exactly as before.
        </p>
      </div>

      {isLoading && <div className="text-slate-400 text-sm flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading…</div>}
      {error && <div className="text-red-300 text-sm bg-red-900/20 rounded-lg p-3">{(error as Error).message}</div>}

      {data && (
        <>
          <section className="rounded-xl border border-slate-700 bg-slate-900 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-white">Change routing {canManage ? '' : '(view only)'}</h2>
            <div className="flex flex-wrap items-end gap-3">
              <label className="text-xs text-slate-400">Send messages through
                <select disabled={!canManage} value={mode} onChange={(e) => setMode(e.target.value as Mode)} className={`${inputClass} block mt-1`}>
                  {(Object.keys(MODE_TEXT) as Mode[]).map((m) => <option key={m} value={m}>{MODE_TEXT[m]}</option>)}
                </select>
              </label>
              {mode === 'central' && (
                <label className="text-xs text-slate-400">Provider
                  <select disabled={!canManage} value={providerId} onChange={(e) => setProviderId(e.target.value)} className={`${inputClass} block mt-1`}>
                    <option value="">Choose…</option>
                    {providers.map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? ' (platform default)' : ''}</option>)}
                  </select>
                </label>
              )}
              {mode === 'same_as' && (
                <label className="text-xs text-slate-400">School to copy
                  <select disabled={!canManage} value={sourceId} onChange={(e) => setSourceId(e.target.value)} className={`${inputClass} block mt-1 max-w-xs`}>
                    <option value="">Choose…</option>
                    {schools.map((s) => <option key={s.id} value={s.id}>{s.name}{s.hasOwnCredentials ? '' : ' (no account of its own)'}</option>)}
                  </select>
                </label>
              )}
              <button disabled={!canManage || busy || selected.size === 0 || (mode === 'central' && !providerId) || (mode === 'same_as' && !sourceId)}
                onClick={() => apply([...selected])}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium disabled:opacity-40">
                Apply to {selected.size} selected
              </button>
              <button disabled={!canManage || busy || (mode === 'central' && !providerId) || (mode === 'same_as' && !sourceId)}
                onClick={() => apply('all')}
                className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800 text-sm disabled:opacity-40">
                Apply to ALL schools
              </button>
            </div>
            {msg && <p className={`text-sm ${msg.ok ? 'text-emerald-400' : 'text-red-300'}`}>{msg.text}</p>}
          </section>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-500" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a school…" className={`${inputClass} pl-9 w-64`} />
            </div>
            <button onClick={() => setSelected(new Set(shown.map((s) => s.id)))} className="text-xs text-slate-300 underline">Select all shown</button>
            <button onClick={() => setSelected(new Set())} className="text-xs text-slate-400 underline">Clear</button>
            <button onClick={() => mutate()} className="ml-auto inline-flex items-center gap-1 text-xs text-slate-300"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr><th className="px-3 py-2 w-8" /><th className="px-3 py-2 text-left">School</th><th className="px-3 py-2 text-left">Sends through</th><th className="px-3 py-2 text-left">Own account</th><th className="px-3 py-2 text-left">Check</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {shown.map((s) => {
                  const c = checks[s.id];
                  return (
                    <tr key={s.id} className="bg-slate-900 align-top">
                      <td className="px-3 py-2"><input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} aria-label={`Select ${s.name}`} disabled={!canManage} /></td>
                      <td className="px-3 py-2 text-slate-100">{s.name}{!s.smsEnabled && <span className="ml-2 text-[10px] text-amber-400">SMS switched off</span>}</td>
                      <td className="px-3 py-2">
                        <div className={`font-medium ${s.effective.ok ? 'text-slate-100' : 'text-red-300'}`}>{s.mode === 'same_as' && s.sourceSchoolName ? `Same as ${s.sourceSchoolName}` : s.effective.label}</div>
                        <div className="text-xs text-slate-400 max-w-md">{s.mode === 'same_as' ? s.effective.label + ' · ' + s.effective.detail : s.effective.detail}</div>
                      </td>
                      <td className="px-3 py-2 text-xs text-slate-400">{s.hasOwnCredentials ? 'Has credentials' : '—'}</td>
                      <td className="px-3 py-2">
                        <button onClick={() => verify(s.id)} disabled={c?.busy} className="text-xs text-indigo-300 hover:text-indigo-200 underline disabled:opacity-50">{c?.busy ? 'Checking…' : 'Check account'}</button>
                        {c && !c.busy && (
                          <div className={`text-xs mt-1 flex items-start gap-1 ${c.ok ? 'text-emerald-400' : 'text-red-300'}`}>
                            {c.ok ? <CheckCircle2 className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <CircleAlert className="w-3.5 h-3.5 mt-0.5 shrink-0" />}{c.message}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && <tr><td colSpan={5} className="px-3 py-8 text-center text-slate-500">No schools match.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-500">“Check account” only asks the provider whether the credentials are accepted; it never sends an SMS.</p>
        </>
      )}
    </div>
  );
}
