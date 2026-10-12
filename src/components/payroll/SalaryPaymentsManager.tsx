"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const SalaryPaymentsManager: React.FC<{ staffId:number }> = ({ staffId }) => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/salary_payments.php?staff_id=${staffId}`, fetcher);
  const rows=data?.data||[];
  const [form,setForm]=useState({ amount:'', wallet_id:'1', method:'cash', reference:'' });
  const add=async()=>{ if(!form.amount) return; await fetch(`${API_BASE}/salary_payments.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ staff_id:staffId, wallet_id:parseInt(form.wallet_id,10), amount:parseFloat(form.amount||'0'), method:form.method, reference:form.reference })}); setForm({ amount:'', wallet_id:'1', method:'cash', reference:'' }); mutate(); };
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{t('payroll.payments')}</h3>
      <div className="grid grid-cols-6 gap-2 text-xs">
        <input placeholder={t('payroll.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.wallet_id')} value={form.wallet_id} onChange={e=>setForm({...form,wallet_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.method')} value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('payroll.reference')} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.amount} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40 col-span-2">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs max-h-48 overflow-auto">
        {rows.map((r:any)=>(
          <div key={r.id} className="grid grid-cols-5 gap-2 px-3 py-2">
            <span className="font-mono text-[11px]">{r.id}</span>
            <span>{r.amount}</span>
            <span>{r.method||'-'}</span>
            <span>{r.reference||'-'}</span>
            <span className="text-[10px]">{r.paid_at||'-'}</span>
          </div>
        ))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('payroll.no_payments')}</div>}
      </div>
    </div>
  );
};