"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const StaffSalaryManager: React.FC<{ staffId:number }> = ({ staffId }) => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/staff_salaries.php?staff_id=${staffId}`, fetcher);
  const rows=data?.data||[];
  const [form,setForm]=useState({ definition_id:'', amount:'', month:'', period_month:'' });
  const add=async()=>{ if(!form.definition_id||!form.amount) return; await fetch(`${API_BASE}/staff_salaries.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ staff_id:staffId, definition_id:parseInt(form.definition_id,10), amount:parseFloat(form.amount||'0'), month:form.month||undefined, period_month: form.period_month||undefined })}); setForm({ definition_id:'', amount:'', month:'', period_month:''}); mutate(); };
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{t('payroll.salaries')}</h3>
      <div className="grid grid-cols-5 gap-2 text-xs">
        <input placeholder={t('payroll.definition_id')} value={form.definition_id} onChange={e=>setForm({...form,definition_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.month')} value={form.month} onChange={e=>setForm({...form,month:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.period_month')} value={form.period_month} onChange={e=>setForm({...form,period_month:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.definition_id||!form.amount} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs max-h-48 overflow-auto">
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-5 gap-2 px-3 py-2">
            <span className="font-mono text-[11px]">{r.definition_id}</span>
            <span>{r.amount}</span>
            <span>{r.month||'-'}</span>
            <span>{r.period_month||'-'}</span>
            <span className="text-[10px]">{r.id}</span>
          </div>
        ))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('payroll.no_salaries')}</div>}
      </div>
    </div>
  );
};