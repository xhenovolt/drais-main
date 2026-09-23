'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { CheckCircle2, CircleAlert, Loader2, Plus, RefreshCw, Send, ShieldCheck, Trash2, Zap } from 'lucide-react';

const fetcher = async (url: string) => {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Provider API returned HTTP ${response.status}`);
    return body;
  } finally {
    window.clearTimeout(timeout);
  }
};
const inputClass = 'w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-100 text-sm';
type ProviderForm = { provider_type: string; display_name: string; apiKey: string; username: string; password: string; senderId: string; baseUrl: string; clientId: string; clientSecret: string };
const emptyForm = (): ProviderForm => ({ provider_type: 'yoola', display_name: '', apiKey: '', username: '', password: '', senderId: '', baseUrl: '', clientId: '', clientSecret: '' });

export default function SmsProvidersPage() {
  const { data, error, isLoading, mutate } = useSWR<any>('/api/control-center/sms/providers', fetcher, { refreshInterval: 30_000, shouldRetryOnError: false });
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(emptyForm());
  const [tests, setTests] = useState<Record<number, { phone: string; message: string }>>({});
  const [results, setResults] = useState<Record<number, any>>({});

  const call = async (key: string, url: string, options?: RequestInit) => {
    setBusy(key);
    try {
      const response = await fetch(url, options);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Operation failed');
      await mutate();
      return body;
    } catch (error: any) {
      window.alert(error.message || 'Operation failed');
      return null;
    } finally {
      setBusy(null);
    }
  };

  const configFromForm = () => Object.fromEntries(
    Object.entries({ apiKey: form.apiKey, username: form.username, password: form.password, senderId: form.senderId, baseUrl: form.baseUrl, clientId: form.clientId, clientSecret: form.clientSecret })
      .filter(([, value]) => value.trim()),
  );

  const saveNew = async () => {
    const result = await call('add', '/api/control-center/sms/providers', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider_type: form.provider_type, display_name: form.display_name || undefined, config: configFromForm() }),
    });
    if (result?.ok) { setShowAdd(false); setForm(emptyForm()); }
  };

  const saveEdit = async () => {
    if (!editingId) return;
    const result = await call(`edit-${editingId}`, `/api/control-center/sms/providers/${editingId}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ display_name: form.display_name || undefined, config: configFromForm() }),
    });
    if (result?.ok) { setEditingId(null); setForm(emptyForm()); }
  };

  const sendTest = async (id: number) => {
    const values = tests[id] || { phone: '', message: 'DRAIS Control Center SMS provider test' };
    setBusy(`test-${id}`);
    try {
      const response = await fetch(`/api/control-center/sms/providers/${id}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(values),
      });
      const result = await response.json();
      setResults((current) => ({ ...current, [id]: result }));
    } finally {
      setBusy(null);
    }
  };

  const updateTest = (id: number, patch: Partial<{ phone: string; message: string }>) => {
    setTests((current) => ({ ...current, [id]: { phone: '', message: 'DRAIS Control Center SMS provider test', ...current[id], ...patch } }));
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">SMS Infrastructure</h1>
          <p className="text-sm text-slate-400 mt-1">Central providers serve every DRAIS school.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/control/sms" className="px-3 py-2 rounded-lg bg-slate-800 text-sm text-slate-300">Economics</Link>
          <button onClick={() => { setShowAdd((value) => !value); setEditingId(null); }} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-indigo-600 text-sm text-white"><Plus className="w-4 h-4" /> Add provider</button>
        </div>
      </div>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-100"><ShieldCheck className="w-4 h-4 text-indigo-300" /> Supported SMS providers</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(data?.supported || []).map((item: any) => (
            <button key={item.type} onClick={() => { setForm({ ...emptyForm(), provider_type: item.type }); setShowAdd(true); setEditingId(null); }} className="text-left p-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700">
              <div className="text-sm text-slate-100">{item.name}</div>
              <div className="text-[11px] text-slate-400 mt-1">Requires: {item.required_fields.join(', ')}</div>
              <div className="text-[11px] text-indigo-300 mt-2">Configure provider</div>
            </button>
          ))}
        </div>
      </section>

      {error && <section className="bg-rose-950/40 border border-rose-800/60 rounded-xl p-4"><div className="text-sm font-semibold text-rose-200">Provider list could not load</div><p className="text-xs text-rose-300 mt-1">{error.name === 'AbortError' ? 'The provider API timed out after 15 seconds.' : error.message}. Check that you are signed in to the Control Center, then reload.</p><button onClick={() => mutate()} className="mt-3 px-3 py-2 rounded-lg bg-rose-900 text-xs text-rose-100">Retry</button></section>}

      {showAdd && (
        <section className="bg-slate-900 border border-indigo-700/50 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-100">Add centralized provider</h2>
          <p className="text-xs text-slate-400">Secrets are encrypted before storage and never returned to the browser.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400">Provider<select className={`${inputClass} mt-1`} value={form.provider_type} onChange={(event) => setForm({ ...form, provider_type: event.target.value })}><option value="yoola">Yoola SMS</option><option value="ugatext">UgaText</option><option value="africas_talking">Africa&apos;s Talking</option></select></label>
            <label className="text-xs text-slate-400">Display name<input className={`${inputClass} mt-1`} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label>
            <label className="text-xs text-slate-400">API key<input type="password" className={`${inputClass} mt-1`} value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} /></label>
            <label className="text-xs text-slate-400">Username<input className={`${inputClass} mt-1`} value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} /></label>
            <label className="text-xs text-slate-400">Sender ID<input className={`${inputClass} mt-1`} value={form.senderId} onChange={(event) => setForm({ ...form, senderId: event.target.value })} /></label>
            <label className="text-xs text-slate-400">Base URL<input className={`${inputClass} mt-1`} value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} placeholder="Provider default" /></label>
            {form.provider_type === 'ugatext' && <><label className="text-xs text-slate-400">Client ID<input className={`${inputClass} mt-1`} value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} /></label><label className="text-xs text-slate-400">Client Secret<input type="password" className={`${inputClass} mt-1`} value={form.clientSecret} onChange={(event) => setForm({ ...form, clientSecret: event.target.value })} /></label></>}
          </div>
          <button onClick={saveNew} disabled={busy === 'add'} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-600 text-sm text-white disabled:opacity-50">{busy === 'add' ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} Validate and save</button>
        </section>
      )}

      {editingId && (
        <section className="bg-slate-900 border border-amber-700/50 rounded-xl p-4 space-y-3">
          <h2 className="font-semibold text-slate-100">Update provider configuration</h2>
          <p className="text-xs text-slate-400">Leave secret fields blank to keep the existing encrypted value.</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3"><label className="text-xs text-slate-400">Display name<input className={`${inputClass} mt-1`} value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} /></label><label className="text-xs text-slate-400">API key<input type="password" className={`${inputClass} mt-1`} value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} placeholder="Leave blank to keep" /></label><label className="text-xs text-slate-400">Client ID<input className={`${inputClass} mt-1`} value={form.clientId} onChange={(event) => setForm({ ...form, clientId: event.target.value })} placeholder="Leave blank to keep" /></label><label className="text-xs text-slate-400">Client Secret<input type="password" className={`${inputClass} mt-1`} value={form.clientSecret} onChange={(event) => setForm({ ...form, clientSecret: event.target.value })} placeholder="Leave blank to keep" /></label></div>
          <div className="flex gap-2"><button onClick={saveEdit} disabled={!!busy} className="px-3 py-2 rounded-lg bg-amber-600 text-sm text-white">Save changes</button><button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-lg bg-slate-800 text-sm text-slate-300">Cancel</button></div>
        </section>
      )}

      {isLoading && <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />}
      {!isLoading && !(data?.providers || []).length && <div className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-400">No centralized providers configured.</div>}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {(data?.providers || []).map((provider: any) => {
          const test = tests[provider.id] || { phone: '', message: 'DRAIS Control Center SMS provider test' };
          const result = results[provider.id];
          return (
            <section key={provider.id} className={`bg-slate-900 border rounded-xl p-4 space-y-4 ${provider.active ? 'border-emerald-600/70' : 'border-slate-800'}`}>
              <div className="flex items-start justify-between gap-3"><div><div className="flex items-center gap-2"><h2 className="font-semibold text-slate-100">{provider.display_name}</h2>{provider.active && <span className="text-[10px] uppercase px-2 py-1 rounded bg-emerald-500/15 text-emerald-300">Active</span>}</div><p className="text-xs text-slate-400 mt-1">{provider.provider_type}</p></div><div className={`inline-flex items-center gap-1 text-xs ${provider.status === 'connected' || provider.status === 'configured' ? 'text-emerald-300' : 'text-amber-300'}`}>{provider.status === 'connected' ? <CheckCircle2 className="w-4 h-4" /> : <CircleAlert className="w-4 h-4" />} {String(provider.status).replaceAll('_', ' ')}</div></div>
              <div className="grid grid-cols-2 gap-3 text-xs"><div><div className="text-slate-500">Balance</div><div className="text-slate-200 mt-1">{provider.balance ? `${provider.balance.currency || ''} ${provider.balance.amount}` : 'Unavailable / not checked'}</div></div><div><div className="text-slate-500">Last successful SMS</div><div className="text-slate-200 mt-1">{provider.last_success_at || 'None recorded'}</div></div><div><div className="text-slate-500">Configured fields</div><div className="text-slate-300 mt-1">{Object.keys(provider.config || {}).map((key) => `${key}: ${provider.config[key]}`).join(' · ') || 'None'}</div></div><div><div className="text-slate-500">Last provider ID</div><div className="text-slate-300 mt-1">{provider.last_provider_message_id || 'None'}</div></div></div>
              <div className="flex flex-wrap gap-2"><button onClick={() => { setEditingId(provider.id); setShowAdd(false); setForm({ ...emptyForm(), display_name: provider.display_name, provider_type: provider.provider_type }); }} className="px-2 py-1.5 rounded bg-slate-800 text-xs text-slate-200">Edit</button><button onClick={() => call(`enabled-${provider.id}`, `/api/control-center/sms/providers/${provider.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: provider.enabled ? 'disable' : 'enable' }) })} disabled={!!busy || provider.active} className="px-2 py-1.5 rounded bg-slate-800 text-xs text-slate-200 disabled:opacity-40">{provider.enabled ? 'Disable' : 'Enable'}</button><button onClick={() => call(`balance-${provider.id}`, `/api/control-center/sms/providers/${provider.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'check_balance' }) })} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-slate-800 text-xs text-slate-200"><RefreshCw className="w-3 h-3" /> Check balance</button>{!provider.active && <button onClick={() => window.confirm(`Activate ${provider.display_name} for all DRAIS schools?`) && call(`activate-${provider.id}`, `/api/control-center/sms/providers/${provider.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action: 'activate' }) })} disabled={!!busy} className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-indigo-600 text-xs text-white"><Zap className="w-3 h-3" /> Activate</button>}<button onClick={() => window.confirm(`Delete ${provider.display_name}?`) && call(`delete-${provider.id}`, `/api/control-center/sms/providers/${provider.id}`, { method: 'DELETE' })} disabled={!!busy || provider.active} className="inline-flex items-center gap-1 px-2 py-1.5 rounded bg-rose-950 text-xs text-rose-200 disabled:opacity-40"><Trash2 className="w-3 h-3" /> Delete</button></div>
              <div className="border-t border-slate-800 pt-3 space-y-2"><div className="text-xs font-semibold text-slate-300">Controlled provider test</div><div className="grid grid-cols-1 md:grid-cols-[10rem_1fr_auto] gap-2"><input className={inputClass} placeholder="0741341483" value={test.phone} onChange={(event) => updateTest(provider.id, { phone: event.target.value })} /><input className={inputClass} maxLength={160} value={test.message} onChange={(event) => updateTest(provider.id, { message: event.target.value })} /><button onClick={() => sendTest(provider.id)} disabled={!!busy || !test.phone || !test.message} className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded bg-amber-600 text-xs text-white disabled:opacity-40">{busy === `test-${provider.id}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send test</button></div>{result && <div className={`text-xs p-2 rounded ${result.accepted_by_provider ? 'bg-emerald-950/50 text-emerald-200' : 'bg-rose-950/50 text-rose-200'}`}>{result.accepted_by_provider ? `Provider accepted · ID ${result.provider_message_id || 'none'} · status ${result.delivery_status || 'not available'}` : `Provider rejected · ${result.error || 'unknown error'}`}</div>}</div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
