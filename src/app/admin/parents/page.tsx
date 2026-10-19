'use client';
/**
 * Admin → Parents. Staff search a parent by phone, see linked learners, and
 * manage access: revoke/approve links (school-scoped), and — for super-admins —
 * suspend/activate, correct phone, merge duplicates, view login history.
 */
import React, { useState } from 'react';
import { Search, Phone, ShieldOff, ShieldCheck, GitMerge, Pencil, History, Loader, X, Check } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

/** Server English in Arabic → the page's own message. */
const serverText = (s: unknown, fallback: string) => (typeof s === 'string' && s && !(uiIsArabic() && isEnglishText(s)) ? s : fallback);

const j = (u: string, opts?: RequestInit) => fetch(u, opts).then(r => r.json());

interface Link { link_id: number; learner_name: string; school_name: string; relationship: string | null; status: string; }
interface Parent { id: number; phone: string; full_name: string | null; status: string; locked: boolean; last_login_at: string | null; links: Link[]; }

export default function AdminParentsPage() {
  const { t, lang, digits } = useI18n();
  const when = (v: string) => (lang === 'ar' ? new Date(v).toLocaleString('ar-EG') : new Date(v).toLocaleString());
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [parents, setParents] = useState<Parent[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [msg, setMsg] = useState('');
  const [history, setHistory] = useState<{ id: number; rows: any[] } | null>(null);

  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setMsg(''); setHistory(null);
    try {
      const d = await j(`/api/admin/parents/search?phone=${encodeURIComponent(phone)}`);
      if (d.error) { setMsg(serverText(d.error, t('staffPages.parents.failed', "The action could not be completed."))); setParents([]); return; }
      setParents(Array.isArray(d.parents) ? d.parents : []); setCanManage(d.can_manage_accounts);
    } finally { setBusy(false); }
  }

  async function linkAction(linkId: number, action: 'revoke' | 'approve') {
    const d = await j(`/api/admin/parent-links/${linkId}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
    setMsg(d.error ? serverText(d.error, t('staffPages.parents.failed', "The action could not be completed.")) : t(`staffPages.parents.link.${action}`)); search();
  }
  async function acct(id: number, action: string, extra?: any) {
    const d = await j(`/api/admin/parents/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...extra }) });
    setMsg(d.error ? serverText(d.error, t('staffPages.parents.failed', "The action could not be completed.")) : t(`staffPages.parents.acct.${action}`, `Account ${action.replace('_', ' ')} done`)); search();
  }
  async function merge(id: number) {
    const into = prompt(t('staffPages.parents.mergeInto', "Merge this account INTO which parent id?"));
    if (!into) return;
    const d = await j(`/api/admin/parents/${id}/merge`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ into: Number(into) }) });
    setMsg(d.error ? serverText(d.error, t('staffPages.parents.failed', "The action could not be completed.")) : t('staffPages.parents.merged', { moved: d.links_moved, dropped: d.links_dropped_as_duplicate })); search();
  }
  async function correctPhone(id: number) {
    const np = prompt(t('staffPages.parents.newPhone', "New phone number for this parent:"));
    if (!np) return;
    acct(id, 'correct_phone', { phone: np });
  }
  async function showHistory(id: number) {
    const d = await j(`/api/admin/parents/${id}`);
    setHistory({ id, rows: Array.isArray(d.login_history) ? d.login_history : [] });
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-1">{t('staffPages.parents.title', "Parents & Guardians")}</h1>
      <p className="text-xs text-slate-400 mb-4">{t('staffPages.parents.subtitle', "Search a parent by phone to view linked learners and manage portal access.")}</p>

      <form onSubmit={search} className="flex gap-2 mb-4">
        <div className="flex-1 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3 bg-white dark:bg-slate-900">
          <Phone className="w-4 h-4 text-slate-400" />
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder={t('staffPages.parents.phonePh', "Phone number (min 4 digits)")} dir="ltr"
            className="flex-1 bg-transparent py-2.5 text-sm outline-none text-slate-800 dark:text-white" />
        </div>
        <button type="submit" disabled={busy} className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
          {busy ? <Loader className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />} {t('staffPages.parents.search', "Search")}
        </button>
      </form>

      {msg && <div className="mb-3 text-xs rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-slate-600 dark:text-slate-300">{msg}</div>}

      {parents && parents.length === 0 && <p className="text-sm text-slate-400 py-8 text-center">{t('staffPages.parents.none', "No matching parents.")}</p>}

      <div className="space-y-4">
        {parents?.map(p => (
          <div key={p.id} className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
            <div className="flex items-start justify-between gap-2 mb-3">
              <div>
                <p className="font-bold text-slate-800 dark:text-white"><span dir="ltr">{digits(p.phone)}</span> <span className="text-[11px] text-slate-400">#{digits(p.id)}</span></p>
                <p className="text-[11px] text-slate-400">{p.full_name || t('staffPages.parents.noName', "No name")} · {t('staffPages.parents.lastLogin', { when: p.last_login_at ? when(p.last_login_at) : t('staffPages.parents.never', 'never') })}</p>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.status === 'suspended' ? 'bg-rose-100 text-rose-700' : p.locked ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                {p.status === 'suspended' ? t('staffPages.parents.suspended', "SUSPENDED") : p.locked ? t('staffPages.parents.locked', "LOCKED") : t('staffPages.parents.active', "ACTIVE")}
              </span>
            </div>

            <div className="rounded-xl border border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 mb-3">
              {p.links.length === 0 && <p className="text-xs text-slate-400 px-3 py-2">{t('staffPages.parents.noLinks', "No links in your school.")}</p>}
              {p.links.map(l => (
                <div key={l.link_id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div>
                    <p className="font-medium text-slate-700 dark:text-slate-200">{l.learner_name}</p>
                    <p className="text-[10px] text-slate-400">{l.school_name}{l.relationship ? ` · ${t(`staffPages.parents.rel.${String(l.relationship).trim().toLowerCase()}`, l.relationship)}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-semibold ${l.status === 'active' ? 'text-emerald-600' : l.status === 'pending' ? 'text-amber-600' : 'text-slate-400'}`}>{t(`staffPages.parents.status.${l.status}`, l.status)}</span>
                    {l.status === 'pending' && <button onClick={() => linkAction(l.link_id, 'approve')} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded" title={t('staffPages.parents.approve', "Approve")}><Check className="w-3.5 h-3.5" /></button>}
                    {l.status !== 'revoked' && <button onClick={() => linkAction(l.link_id, 'revoke')} className="p-1 text-rose-600 hover:bg-rose-50 rounded" title={t('staffPages.parents.revoke', "Revoke")}><X className="w-3.5 h-3.5" /></button>}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <button onClick={() => showHistory(p.id)} className="flex items-center gap-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300"><History className="w-3 h-3" /> {t('staffPages.parents.history', "History")}</button>
              {canManage && <>
                {p.status === 'suspended'
                  ? <button onClick={() => acct(p.id, 'activate')} className="flex items-center gap-1 text-[11px] rounded-lg border border-emerald-200 px-2 py-1 text-emerald-700"><ShieldCheck className="w-3 h-3" /> {t('staffPages.parents.activate', "Activate")}</button>
                  : <button onClick={() => acct(p.id, 'suspend')} className="flex items-center gap-1 text-[11px] rounded-lg border border-rose-200 px-2 py-1 text-rose-700"><ShieldOff className="w-3 h-3" /> {t('staffPages.parents.suspend', "Suspend")}</button>}
                <button onClick={() => correctPhone(p.id)} className="flex items-center gap-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300"><Pencil className="w-3 h-3" /> {t('staffPages.parents.correctPhone', "Correct phone")}</button>
                <button onClick={() => merge(p.id)} className="flex items-center gap-1 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-slate-600 dark:text-slate-300"><GitMerge className="w-3 h-3" /> {t('staffPages.parents.merge', "Merge")}</button>
              </>}
            </div>

            {history?.id === p.id && (
              <div className="mt-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-3">
                <p className="text-[11px] font-semibold text-slate-500 mb-1">{t('staffPages.parents.loginHistory', "Login history")}</p>
                {history.rows.length === 0 ? <p className="text-[11px] text-slate-400">{t('staffPages.parents.noLogins', "No logins recorded.")}</p> : history.rows.map((h, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] text-slate-500 py-0.5">
                    <span>{h.at ? when(h.at) : '—'}</span>
                    <span className="text-slate-400"><span dir="ltr">{h.ip || '—'}</span> {h.active ? t('staffPages.parents.activeSession', "· active") : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
