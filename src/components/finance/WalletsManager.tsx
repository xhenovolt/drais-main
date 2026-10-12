"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE = process.env.NEXT_PUBLIC_PHP_API_BASE || 'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const WalletsManager: React.FC = () => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/wallets.php`, fetcher);
  const wallets = data?.data||[];
  const [form,setForm]=useState({ name:'', method:'cash', currency:'UGX', opening_balance:''});
  const add=async()=>{ if(!form.name) return; await fetch(`${API_BASE}/wallets.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...form,opening_balance: parseFloat(form.opening_balance||'0')})}); setForm({ name:'', method:'cash', currency:'UGX', opening_balance:''}); mutate(); };
  return (
    <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10 space-y-4">
      <h2 className="font-semibold text-sm">{t('finance.wallets')}</h2>
      <div className="grid sm:grid-cols-5 gap-2 text-xs">
        <input placeholder={t('finance.wallet_name')} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.method')} value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.currency')} value={form.currency} onChange={e=>setForm({...form,currency:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.opening_balance')} value={form.opening_balance} onChange={e=>setForm({...form,opening_balance:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white">{t('common.add')}</button>
      </div>
      <div className="grid sm:grid-cols-4 gap-3 text-xs">
        {wallets.map((w:any)=>(
          <div key={w.id} className="p-3 rounded border bg-white/50 dark:bg-slate-800/50">
            <div className="font-medium">{w.name}</div>
            <div className="text-[10px] text-gray-500">{w.method} • {w.currency}</div>
            <div className="text-[10px]">{t('finance.opening')}: {w.opening_balance}</div>
          </div>
        ))}
        {wallets.length===0 && <div className="text-gray-400 text-xs">{t('finance.no_wallets')}</div>}
      </div>
    </div>
  );
};