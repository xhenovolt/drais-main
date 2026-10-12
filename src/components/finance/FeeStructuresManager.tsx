"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const FeeStructuresManager: React.FC = () => {
  const { t } = useI18n();
  const [filters,setFilters]=useState({ term_id:'', class_id:'' });
  const qs = `term_id=${filters.term_id||''}&class_id=${filters.class_id||''}`;
  const { data, mutate } = useSWR(`${API_BASE}/fee_structures.php?${qs}`, fetcher);
  const rows=data?.data||[];
  const [form,setForm]=useState({ term_id:'', class_id:'', item:'', amount:'' });
  const add=async()=>{ if(!form.term_id||!form.class_id||!form.item) return; await fetch(`${API_BASE}/fee_structures.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ term_id:parseInt(form.term_id,10), class_id:parseInt(form.class_id,10), item:form.item, amount:parseFloat(form.amount||'0') })}); setForm({ term_id:'', class_id:'', item:'', amount:''}); mutate(); };
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('finance.fee_structures')}</h1>
      <div className="grid md:grid-cols-5 gap-2 text-xs p-4 rounded border bg-white/60 dark:bg-slate-900/60">
        <input placeholder={t('finance.term_id')} value={form.term_id} onChange={e=>setForm({...form,term_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.class_id')} value={form.class_id} onChange={e=>setForm({...form,class_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.item')} value={form.item} onChange={e=>setForm({...form,item:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.term_id||!form.class_id||!form.item} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/60 dark:bg-slate-900/60 text-xs">
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-5 gap-2 px-3 py-2">
            <span>{r.term_id}</span>
            <span>{r.class_id}</span>
            <span className="col-span-2 truncate">{r.item}</span>
            <span className="text-right font-medium">{r.amount}</span>
          </div>
        ))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('finance.no_fee_structures')}</div>}
      </div>
    </div>
  );
};