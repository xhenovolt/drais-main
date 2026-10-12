"use client";
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const FeeItemsManager: React.FC<{studentId:number; termId:number}> = ({ studentId, termId }) => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/student_fees.php?student_id=${studentId}&term_id=${termId}`, fetcher);
  const items=data?.data||[];
  const [form,setForm]=useState({ item:'', amount:'', discount:'' });
  const add=async()=>{ if(!form.item) return; await fetch(`${API_BASE}/student_fees.php`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ student_id:studentId, term_id:termId, item:form.item, amount:parseFloat(form.amount||'0'), discount:parseFloat(form.discount||'0') })}); setForm({ item:'', amount:'', discount:'' }); mutate(); };
  useEffect(() => {
    const checkAndInsertFeeItems = async () => {
      try {
        await fetch(`${API_BASE}/students/fee_items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ term_id: termId }),
        });
        mutate();
      } catch (error) {
        console.error('Failed to check and insert fee items:', error);
      }
    };

    checkAndInsertFeeItems();
  }, [termId, mutate]);
  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{t('finance.fee_items')}</h3>
      <div className="grid grid-cols-5 gap-2 text-xs">
        <input placeholder={t('finance.item')} value={form.item} onChange={e=>setForm({...form,item:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.discount')} value={form.discount} onChange={e=>setForm({...form,discount:e.target.value})} className="px-2 py-1 rounded border" />
        <div className="col-span-2 flex gap-2">
          <button onClick={add} disabled={!form.item} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
        </div>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs">
        {items.map((it:any)=>(
          <div key={it.id} className="grid grid-cols-5 gap-2 px-3 py-2">
            <span className="truncate col-span-2">{it.item}</span>
            <span>{it.amount}</span>
            <span>{it.discount}</span>
            <span className="font-medium text-right">{it.balance}</span>
          </div>
        ))}
        {items.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('finance.no_fee_items')}</div>}
      </div>
    </div>
  );
};