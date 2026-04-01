"use client";
import React, { useState, useEffect, useRef } from 'react';
import { showToast } from '@/lib/toast';
import { apiFetch } from '@/lib/apiClient';

const API = '/api/finance/ledger';
interface Entry { id:number; wallet_id:number; wallet_name?:string; category_id:number; tx_type:string; amount:number; reference:string; description:string; created_at:string; }

export default function LedgerPage(){
  const [entries,setEntries]=useState<Entry[]>([]);
  const [loading,setLoading]=useState(false);
  const [page,setPage]=useState(1);
  const [total,setTotal]=useState(0);
  const [filters,setFilters]=useState({ wallet_id:'', student_id:'' });
  const [form,setForm]=useState({ wallet_id:'', category_id:'', tx_type:'credit', amount:'', reference:'', description:'' });
  const [message,setMessage]=useState('');
  const perPage=25;
  const printRef=useRef<HTMLDivElement>(null);

  const load=()=>{
    const qs=new URLSearchParams({ page:String(page), per_page:String(perPage)});
    if(filters.wallet_id) qs.append('wallet_id',filters.wallet_id);
    if(filters.student_id) qs.append('student_id',filters.student_id);
    setLoading(true);
    fetch(`${API}?${qs.toString()}`).then(r=>r.json()).then(d=>{ if(d.error) setMessage(d.error); else { setEntries(d.data||[]); setTotal(d.total||0);} }).catch(e=>setMessage(e.message)).finally(()=>setLoading(false));
  };
  useEffect(()=>{ load(); },[page,filters.wallet_id,filters.student_id]);

  const submit=async()=>{
    if(!form.wallet_id||!form.category_id||!form.amount) return setMessage('Wallet, category, amount required');
    try {
      await apiFetch(API,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ ...form, amount: parseFloat(form.amount) }), successMessage: 'Entry added' });
      setForm({ wallet_id:'', category_id:'', tx_type:'credit', amount:'', reference:'', description:''}); load();
    } catch(e: any) { setMessage(e.message || 'Failed'); }
  };

  const doPrint=()=>{
    if(!printRef.current) return;
    const w=window.open('', '_blank');
    if(!w) return;
    w.document.write('<html><head><title>Ledger Print</title><style>table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #ccc;padding:4px;text-align:left}</style></head><body>'+printRef.current.innerHTML+'</body></html>');
    w.document.close();
    w.print();
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide">Ledger</h2>
        <button onClick={load} className="px-3 py-1.5 rounded bg-black/5 dark:bg-white/10 text-xs">Refresh</button>
        <button onClick={doPrint} className="px-3 py-1.5 rounded bg-black/5 dark:bg-white/10 text-xs">Print</button>
        {message && <span className="text-xs ml-auto">{message}</span>}
      </div>
      <div className="grid md:grid-cols-6 gap-3 text-xs">
        <input placeholder="Filter Wallet ID" value={filters.wallet_id} onChange={e=>{setPage(1); setFilters(f=>({...f,wallet_id:e.target.value}));}} className="px-2 py-1 rounded border" />
        <input placeholder="Filter Student ID" value={filters.student_id} onChange={e=>{setPage(1); setFilters(f=>({...f,student_id:e.target.value}));}} className="px-2 py-1 rounded border" />
        <input placeholder="Wallet ID" value={form.wallet_id} onChange={e=>setForm(f=>({...f,wallet_id:e.target.value}))} className="px-2 py-1 rounded border" />
        <input placeholder="Category ID" value={form.category_id} onChange={e=>setForm(f=>({...f,category_id:e.target.value}))} className="px-2 py-1 rounded border" />
        <select value={form.tx_type} onChange={e=>setForm(f=>({...f,tx_type:e.target.value}))} className="px-2 py-1 rounded border"><option value="credit">credit</option><option value="debit">debit</option></select>
        <input placeholder="Amount" value={form.amount} onChange={e=>setForm(f=>({...f,amount:e.target.value}))} className="px-2 py-1 rounded border" />
        <input placeholder="Reference" value={form.reference} onChange={e=>setForm(f=>({...f,reference:e.target.value}))} className="px-2 py-1 rounded border col-span-2" />
        <input placeholder="Description" value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))} className="px-2 py-1 rounded border col-span-3" />
        <button onClick={submit} className="px-4 py-2 rounded bg-gradient-to-r from-indigo-600 via-fuchsia-600 to-pink-600 text-white text-xs font-semibold col-span-1">Add</button>
      </div>
      <div ref={printRef} className="overflow-auto rounded-xl border border-black/10 dark:border-white/10">
        <table className="w-full text-xs">
          <thead className="bg-slate-100/60 dark:bg-slate-800/60"><tr><th className="px-2 py-2 text-left">#</th><th className="px-2 py-2 text-left">Wallet</th><th className="px-2 py-2 text-left">Type</th><th className="px-2 py-2 text-left">Amount</th><th className="px-2 py-2 text-left">Reference</th><th className="px-2 py-2 text-left">Description</th><th className="px-2 py-2 text-left">Date</th></tr></thead>
          <tbody>
            {entries.map(e=> (<tr key={e.id} className="odd:bg-white/50 dark:odd:bg-slate-800/40"><td className="px-2 py-1.5 font-medium">{e.id}</td><td className="px-2 py-1.5">{e.wallet_name||e.wallet_id}</td><td className="px-2 py-1.5">{e.tx_type}</td><td className="px-2 py-1.5">{e.amount}</td><td className="px-2 py-1.5">{e.reference||'-'}</td><td className="px-2 py-1.5">{e.description||'-'}</td><td className="px-2 py-1.5">{e.created_at?.split(' ')[0]}</td></tr>))}
            {!loading && entries.length===0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">No entries</td></tr>}
          </tbody>
        </table>
        {loading && <div className="px-4 py-3 text-xs">Loading...</div>}
      </div>
      {total>perPage && <div className="flex items-center gap-3 text-xs"><button disabled={page===1} onClick={()=>setPage(p=>p-1)} className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 disabled:opacity-30">Prev</button><span>Page {page} of {Math.ceil(total/perPage)}</span><button disabled={page>=Math.ceil(total/perPage)} onClick={()=>setPage(p=>p+1)} className="px-2 py-1 rounded bg-black/5 dark:bg-white/10 disabled:opacity-30">Next</button></div>}
    </div>
  );
}