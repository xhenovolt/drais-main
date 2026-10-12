"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
const API_BASE=process.env.NEXT_PUBLIC_PHP_API_BASE||'http://localhost/drais/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const FeePaymentsManager: React.FC<{studentId:number; termId:number}> = ({ studentId, termId }) => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/fee_payments.php?student_id=${studentId}&term_id=${termId}`, fetcher);
  const payments = data?.data||[]; // returned as data
  const items = data?.items||[];
  const student = data?.student||{};
  const [form,setForm]=useState({ amount:'', wallet_id:'1', method:'cash', paid_by:'', payer_contact:'', reference:'' });
  const [alloc,setAlloc]=useState<Record<number,string>>({});
  const totalBalance = items.reduce((a:number,b:any)=>a + (b.balance||0),0);

  const add=async()=>{
    if(!form.amount) return;
    const amt=parseFloat(form.amount||'0');
    let allocations = Object.entries(alloc)
      .filter(([,v])=>v)
      .map(([k,v])=>({ item_id: parseInt(k,10), amount: parseFloat(v||'0') })) as any[]|undefined;
    if(allocations && allocations.length===0) allocations=undefined;
    await fetch(`${API_BASE}/fee_payments.php`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({
        student_id: studentId,
        term_id: termId,
        wallet_id: parseInt(form.wallet_id,10),
        amount: amt,
        method: form.method,
        paid_by: form.paid_by||undefined,
        payer_contact: form.payer_contact||undefined,
        reference: form.reference||undefined,
        allocations
      })
    });
    setForm({ amount:'', wallet_id:'1', method:'cash', paid_by:'', payer_contact:'', reference:'' });
    setAlloc({});
    mutate();
  };

  const printReceipt=(p:any)=>{
    const win=window.open('', '_blank', 'width=420,height=640');
    if(!win) return;
    const lines:string[]=[
      '******** '+t('finance.receipt')+' ********',
      `Receipt: ${p.receipt_no||p.id}`,
      `Date: ${p.created_at||''}`,
      `Student: ${student.first_name||''} ${student.last_name||''} (${student.admission_no||''})`,
      `Student ID: ${studentId}`,
      `Term ID: ${termId}`,
      `Amount Paid: ${p.amount}`,
      `Method: ${p.method||''}`,
      `Paid By: ${p.paid_by||''}`,
      `Payer Contact: ${p.payer_contact||''}`,
      `Reference: ${p.reference||''}`,
      '',
      'Items Snapshot:',
      ...items.map((it:any)=>`${it.item} | Amt:${it.amount} Disc:${it.discount} Paid:${it.paid} Bal:${it.balance}`),
      '',
      `Outstanding Balance: ${totalBalance}`,
      '',
      `Printed: ${new Date().toString()}`
    ];
    win.document.write(`<pre style="font:12px/16px monospace;white-space:pre-wrap">${lines.join('\n')}</pre>`);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-3">
      <h3 className="font-semibold text-sm">{t('finance.payments')}</h3>
      <div className="text-[10px] text-gray-500 flex flex-wrap gap-3">
        <span>{student.first_name? `${student.first_name} ${student.last_name}`: ''}</span>
        <span>{student.admission_no? `#${student.admission_no}`: ''}</span>
        <span>{t('finance.balance')}: {totalBalance}</span>
      </div>
      <div className="grid grid-cols-7 gap-2 text-xs">
        <input placeholder={t('finance.amount')} value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.wallet_id')} value={form.wallet_id} onChange={e=>setForm({...form,wallet_id:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.method')} value={form.method} onChange={e=>setForm({...form,method:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.paid_by')} value={form.paid_by} onChange={e=>setForm({...form,paid_by:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.payer_contact')} value={form.payer_contact} onChange={e=>setForm({...form,payer_contact:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('finance.reference')} value={form.reference} onChange={e=>setForm({...form,reference:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.amount} className="px-3 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="text-[10px] text-gray-500">{t('finance.allocate_hint')}</div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-[10px] p-2 space-y-1">
        {items.map((it:any)=>(
          <div key={it.id} className="grid grid-cols-6 gap-2 items-center">
            <span className="col-span-2 truncate">{it.item}</span>
            <span>{it.amount}</span>
            <span>{it.paid}</span>
            <span>{it.balance}</span>
            <input placeholder={t('finance.allocate')} value={alloc[it.id]||''} onChange={e=>setAlloc(prev=>({...prev,[it.id]:e.target.value}))} className="px-1 py-0.5 rounded border text-[10px]" />
          </div>
        ))}
        {items.length===0 && <div className="text-center py-4 text-gray-400">{t('finance.no_fee_items')}</div>}
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs max-h-48 overflow-auto">
        {payments.map((p:any)=>(
          <div key={p.id} className="grid grid-cols-6 gap-2 px-3 py-2 group">
            <span className="col-span-2 font-mono text-[11px]">{p.receipt_no||p.id}</span>
            <span>{p.amount}</span>
            <span>{p.method||'-'}</span>
            <span className="truncate">{p.paid_by||'-'}</span>
            <span className="truncate">{p.reference||'-'}</span>
            <button onClick={()=>printReceipt(p)} className="text-[10px] underline opacity-0 group-hover:opacity-100 transition">{t('finance.receipt')}</button>
          </div>
        ))}
        {payments.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('finance.no_payments')}</div>}
      </div>
    </div>
  );
};