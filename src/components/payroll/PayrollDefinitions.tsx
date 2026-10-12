"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const PayrollDefinitions: React.FC = () => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/payroll_definitions.php`, fetcher);
  const defs=data?.data||[];
  const [form,setForm]=useState({ name:'', type:'' });
  const add=async()=>{ if(!form.name||!form.type) return; await fetch(`${API_BASE}/payroll_definitions.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(form)}); setForm({ name:'', type:'' }); mutate(); };
  return (
    <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10 space-y-4">
      <h2 className="font-semibold text-sm">{t('payroll.definitions')}</h2>
      <div className="grid sm:grid-cols-5 gap-2 text-xs">
        <input placeholder={t('payroll.name')} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.type')} value={form.type} onChange={e=>setForm({...form,type:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.name||!form.type} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="grid sm:grid-cols-4 gap-3 text-xs">
        {defs.map((d:any)=>(
          <div key={d.id} className="p-3 rounded border bg-white/50 dark:bg-slate-800/50">
            <div className="font-medium">{d.name}</div>
            <div className="text-[10px] text-gray-500">{d.type}</div>
          </div>
        ))}
        {defs.length===0 && <div className="text-gray-400 text-xs">{t('payroll.no_definitions')}</div>}
      </div>
    </div>
  );
};