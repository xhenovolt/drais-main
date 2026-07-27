'use client';

/** All schools with operational vitals — click through for the operations view. */
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { School, HardDrive, Loader2, Search, ChevronLeft, ChevronRight, Plus, Copy, Check, X } from 'lucide-react';
import { ExportButtons } from '@/app/control/_components/ExportButtons';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then(r => r.json());
const ago = (d: string | null) => {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 48 * 60) return `${Math.round(min / 60)}h ago`;
  return `${Math.round(min / 1440)}d ago`;
};

const DAY = 86_400_000;
/** At-a-glance subscription timing so operators never open a school just to see
 *  when it renews — the lever that makes the console scale to thousands. */
function subInfo(sub: any): null | { pct: number; daysLeft: number; label: string; tone: 'ok' | 'warn' | 'danger' | 'expired'; isTrial: boolean; end: number } {
  const endRaw = sub?.end || sub?.trial_end;
  if (!endRaw) return null; // one-time / unset — no countdown to show
  const end = new Date(endRaw).getTime();
  if (Number.isNaN(end)) return null;
  const now = Date.now();
  const startMs = sub?.start && !Number.isNaN(new Date(sub.start).getTime()) ? new Date(sub.start).getTime() : end - 30 * DAY;
  const total = Math.max(1, end - startMs);
  const pct = Math.min(100, Math.max(0, Math.round(((now - startMs) / total) * 100)));
  const daysLeft = Math.ceil((end - now) / DAY);
  const tone = daysLeft < 0 ? 'expired' : daysLeft <= 7 ? 'danger' : daysLeft <= 30 ? 'warn' : 'ok';
  const label = daysLeft < 0 ? `expired ${Math.abs(daysLeft)}d ago` : daysLeft === 0 ? 'expires today' : `${daysLeft}d left`;
  return { pct, daysLeft, label, tone, isTrial: !sub?.end && !!sub?.trial_end, end };
}

export default function ControlSchools() {
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');

  // Debounce search → one query on pause; any filter change resets to page 1.
  useEffect(() => {
    const t = setTimeout(() => { setQ(input.trim()); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [input]);
  useEffect(() => { setPage(1); }, [showDeleted]);

  const params = new URLSearchParams({ page: String(page), limit: '25' });
  if (showDeleted) params.set('include_deleted', '1');
  if (q) params.set('q', q);
  const { data, isLoading, mutate } = useSWR<any>(`/api/control-center/schools?${params}`, fetcher, { keepPreviousData: true });
  const rows = data?.rows || [];
  const pg = data?.pagination || { page: 1, total: 0, totalPages: 1, limit: 25 };
  const [wizard, setWizard] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Search name, code, district…"
              className="pl-8 pr-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-200 w-64 max-w-full"
            />
          </div>
          <p className="text-sm text-slate-400 whitespace-nowrap">{Number(pg.total).toLocaleString()} school{pg.total === 1 ? '' : 's'} {showDeleted ? '(incl. deleted)' : ''}</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setWizard(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium">
            <Plus className="w-3.5 h-3.5" /> New school
          </button>
          <label className="flex items-center gap-1.5 text-xs text-slate-400">
            <input type="checkbox" checked={showDeleted} onChange={e => setShowDeleted(e.target.checked)} /> Show deleted
          </label>
          <ExportButtons filename="drais-schools" rows={rows} columns={[
            { key: 'name', label: 'School' }, { key: 'status', label: 'Status' },
            { key: 'learners', label: 'Learners' }, { key: 'staff', label: 'Staff' },
            { key: 'devices', label: 'Devices online', value: (r) => `${r.devices.online}/${r.devices.total}` },
            { key: 'plan', label: 'Plan', value: (r) => r.subscription?.plan || '' },
            { key: 'sub_status', label: 'Sub status', value: (r) => r.subscription?.status || '' },
            { key: 'district', label: 'District' }, { key: 'country', label: 'Country' },
            { key: 'last_sync', label: 'Last sync' },
          ]} />
        </div>
      </div>
      {isLoading && <div className="py-12 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400 inline" /></div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {rows.map((s: any) => (
          <Link key={s.id} href={`/control/schools/${s.id}`}
            className={`block bg-slate-900 border rounded-xl p-4 transition-colors hover:border-indigo-600 ${s.deleted_at ? 'border-rose-900/60 opacity-70' : 'border-slate-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <School className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                <span className="font-semibold text-slate-100 truncate">{s.name}</span>
              </div>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                s.deleted_at ? 'bg-rose-500/20 text-rose-300'
                  : s.status === 'active' ? 'bg-emerald-500/20 text-emerald-300'
                    : s.status === 'archived' ? 'bg-slate-600/40 text-slate-300'
                      : 'bg-amber-500/20 text-amber-300'}`}>{s.deleted_at ? 'deleted' : s.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-3 text-center">
              <div><div className="text-lg font-bold text-slate-100 tabular-nums">{s.learners.toLocaleString()}</div><div className="text-[10px] text-slate-500">learners</div></div>
              <div><div className="text-lg font-bold text-slate-100 tabular-nums">{s.staff.toLocaleString()}</div><div className="text-[10px] text-slate-500">staff</div></div>
              <div>
                <div className={`text-lg font-bold tabular-nums ${s.devices.total && s.devices.online < s.devices.total ? 'text-amber-300' : 'text-slate-100'}`}>
                  {s.devices.online}/{s.devices.total}
                </div>
                <div className="text-[10px] text-slate-500 flex items-center justify-center gap-0.5"><HardDrive className="w-3 h-3" /> devices</div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 text-[11px] text-slate-500">
              <span>Sub: {s.subscription.plan || '—'} ({s.subscription.status || '—'})</span>
              <span>Last sync: {ago(s.last_sync)}</span>
            </div>
            {(() => {
              const si = subInfo(s.subscription);
              if (!si) return null;
              const bar = si.tone === 'expired' ? 'bg-rose-600' : si.tone === 'danger' ? 'bg-rose-500' : si.tone === 'warn' ? 'bg-amber-500' : 'bg-emerald-500';
              const txt = si.tone === 'expired' ? 'text-rose-400' : si.tone === 'danger' ? 'text-rose-300' : si.tone === 'warn' ? 'text-amber-300' : 'text-emerald-300';
              return (
                <div className="mt-2" title={`${si.isTrial ? 'Trial' : 'Subscription'} ends ${new Date(si.end).toLocaleDateString()}`}>
                  <div className="flex items-center justify-between text-[10px] mb-0.5">
                    <span className="text-slate-500">{si.isTrial ? 'Trial' : 'Subscription'}</span>
                    <span className={txt}>{si.label}{si.tone !== 'expired' && ` · ${new Date(si.end).toLocaleDateString()}`}</span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                    <div className={`h-full ${bar} rounded-full transition-all`} style={{ width: `${si.tone === 'expired' ? 100 : si.pct}%` }} />
                  </div>
                </div>
              );
            })()}
            {s.modules.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {s.modules.map((m: string) => (
                  <span key={m} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">✓ {m}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
      {!isLoading && rows.length === 0 && (
        <p className="py-12 text-center text-slate-500 text-sm">No schools match your search.</p>
      )}
      {/* Pager */}
      <div className="flex items-center justify-end gap-2">
        <button
          disabled={pg.page <= 1}
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
        ><ChevronLeft className="w-3.5 h-3.5" /> Prev</button>
        <span className="text-xs text-slate-500">Page {pg.page} of {pg.totalPages}</span>
        <button
          disabled={pg.page >= pg.totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-700"
        >Next <ChevronRight className="w-3.5 h-3.5" /></button>
      </div>

      {wizard && <ProvisionWizard onClose={() => setWizard(false)} onProvisioned={() => mutate()} />}
    </div>
  );
}

/** One-click new-school provisioning (P20). */
function ProvisionWizard({ onClose, onProvisioned }: { onClose: () => void; onProvisioned: () => void }) {
  const { data: plansData } = useSWR<any>('/api/control-center/plans', fetcher);
  const plans = plansData?.plans || plansData?.rows || [];
  const [form, setForm] = useState({ name: '', adminName: '', adminEmail: '', adminPhone: '', planCode: '', shortCode: '', district: '', country: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ school_id: number; admin_email: string; temp_password: string; plan: string | null } | null>(null);
  const [copied, setCopied] = useState(false);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/control-center/schools/provision', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!j.success) { setError(j.error || 'Provisioning failed'); return; }
      setDone(j);
      onProvisioned();
    } catch (e: any) {
      setError(e?.message || 'Provisioning failed');
    } finally { setBusy(false); }
  };

  const field = (key: keyof typeof form, label: string, opts: { type?: string; required?: boolean; placeholder?: string } = {}) => (
    <label className="text-[11px] text-slate-400 block">
      {label}{opts.required && <span className="text-rose-400"> *</span>}
      <input
        type={opts.type || 'text'} value={form[key]} placeholder={opts.placeholder}
        onChange={(e) => set(key, e.target.value)}
        className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100"
      />
    </label>
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800">
          <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2"><School className="w-4 h-4 text-indigo-400" /> Provision a new school</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-800 text-slate-400"><X className="w-4 h-4" /></button>
        </div>

        {done ? (
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium"><Check className="w-4 h-4" /> School #{done.school_id} created{done.plan ? ` on the ${done.plan} plan` : ''}.</div>
            <p className="text-xs text-slate-400">Share these first-login credentials with the school. They&apos;ll be required to set a new password on first sign-in.</p>
            <div className="bg-slate-800/70 rounded-lg p-3 space-y-1.5 text-sm">
              <div className="flex justify-between gap-2"><span className="text-slate-500">Email</span><span className="text-slate-200 font-mono">{done.admin_email}</span></div>
              <div className="flex justify-between gap-2 items-center">
                <span className="text-slate-500">Temp password</span>
                <span className="flex items-center gap-2">
                  <span className="text-slate-100 font-mono font-semibold tracking-wide">{done.temp_password}</span>
                  <button
                    onClick={() => { navigator.clipboard?.writeText(`${done.admin_email} / ${done.temp_password}`); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
                    className="p-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-300" title="Copy email + password">
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </span>
              </div>
            </div>
            <p className="text-[11px] text-amber-300/90">This password is shown once — copy it now.</p>
            <div className="flex justify-end gap-2">
              <a href={`/control/schools/${done.school_id}`} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs">Open school</a>
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Done</button>
            </div>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {field('name', 'School name', { required: true, placeholder: 'e.g. Kampala Modern High' })}
            <div className="grid grid-cols-2 gap-3">
              {field('shortCode', 'Short code', { placeholder: 'KMH' })}
              <label className="text-[11px] text-slate-400 block">
                Plan
                <select value={form.planCode} onChange={(e) => set('planCode', e.target.value)}
                  className="mt-0.5 w-full px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-sm text-slate-100">
                  <option value="">Trial (no plan)</option>
                  {plans.map((p: any) => <option key={p.code} value={p.code}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {field('district', 'District')}
              {field('country', 'Country', { placeholder: 'Uganda' })}
            </div>
            <div className="border-t border-slate-800 pt-3 mt-1">
              <p className="text-[11px] text-slate-500 mb-2 uppercase tracking-wide">First admin (school owner)</p>
              {field('adminName', 'Full name', { required: true, placeholder: 'Jane Doe' })}
              <div className="grid grid-cols-2 gap-3 mt-3">
                {field('adminEmail', 'Email', { required: true, type: 'email', placeholder: 'admin@school.ug' })}
                {field('adminPhone', 'Phone')}
              </div>
            </div>
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs">Cancel</button>
              <button onClick={submit} disabled={busy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium disabled:opacity-50">
                {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />} Provision school
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
