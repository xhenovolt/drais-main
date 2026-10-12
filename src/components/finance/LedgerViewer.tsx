"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const LedgerViewer: React.FC = () => {
  const { t } = useI18n();
  const [filters,setFilters]=useState({ wallet_id:'', student_id:'', staff_id:'' });
  const qs = Object.entries(filters).filter(([,v])=>v).map(([k,v])=>`${k}=${v}`).join('&');
  const { data, mutate } = useSWR(`${API_BASE}/ledger.php?${qs}`, fetcher);
  const rows=data?.data||[];
  const [form,setForm]=useState({ wallet_id:'', category_id:'', tx_type:'in', amount:'', reference:'', description:'' });
  const add=async()=>{ if(!form.wallet_id||!form.category_id||!form.tx_type||!form.amount) return; await fetch(`${API_BASE}/ledger.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ wallet_id:parseInt(form.wallet_id,10), category_id:parseInt(form.category_id,10), tx_type:form.tx_type, amount:parseFloat(form.amount||'0'), reference:form.reference||undefined, description:form.description||undefined, student_id: filters.student_id||undefined, staff_id: filters.staff_id||undefined })}); setForm({ wallet_id:'', category_id:'', tx_type:'in', amount:'', reference:'', description:''}); mutate(); };
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('finance.ledger')}</h1>
      <div className="grid md:grid-cols-5 gap-2 text-xs p-4 rounded border bg-white/60 dark:bg-slate-900/60">
        <input placeholder={t('finance.wallet_id')} value={filters.wallet_id} onChange={e=>setFilters({...filters,wallet_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.student_id')} value={filters.student_id} onChange={e=>setFilters({...filters,student_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.staff_id')} value={filters.staff_id} onChange={e=>setFilters({...filters,staff_id:e.target.value})} className="px-2 py-1 rounded border" />
      </div>
      <div className="p-4 rounded border bg-white/60 dark:bg-slate-900/60 space-y-2 text-xs">
        <div className="grid md:grid-cols-6 gap-2">
          <input placeholder={t('finance.wallet_id')} value={form.wallet_id} onChange={e=>setForm({...form,wallet_id:e.target.value})} className="px-2 py-1 rounded border" />
            <input placeholder={t('finance.category_id')} value={form.category_id} onChange={e=>setForm({...form,category_id:e.target.value})} className="px-2 py-1 rounded border" />
            <select value={form.tx_type} onChange={e=>setForm({...form,tx_type:e.target.value})} className="px-2 py-1 rounded border"><option value="in">{t('finance.inflow')}</option><option value="out">{t('finance.outflow')}</option></select>
            <input placeholder={t('finance.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
            <input placeholder={t('finance.reference')} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} className="px-2 py-1 rounded border" />
            <input placeholder={t('finance.description')} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} className="px-2 py-1 rounded border" />
        </div>
        <button onClick={add} disabled={!form.wallet_id||!form.category_id||!form.amount} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('finance.add_entry')}</button>
      </div>
      <div className="rounded border divide-y bg-white/60 dark:bg-slate-900/60 text-xs max-h-96 overflow-auto">
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-8 gap-2 px-3 py-2">
            <span className="font-mono text-[11px] col-span-1">{r.id}</span>
            <span className="col-span-1">{r.wallet_id}</span>
            <span className="col-span-1">{r.category_id}</span>
            <span className="col-span-1">{r.tx_type}</span>
            <span className="col-span-1">{r.amount}</span>
            <span className="col-span-1 truncate">{r.reference||'-'}</span>
            <span className="col-span-1 truncate">{r.description||'-'}</span>
            <span className="col-span-1 text-[10px]">{r.created_at}</span>
          </div>
        ))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('finance.no_ledger')}</div>}
      </div>
    </div>
  );
};