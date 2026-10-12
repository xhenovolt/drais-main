"use client";
import React, { useState } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
const API_BASE='/api';
const fetcher=(u:string)=>fetch(u).then(r=>r.json());
export const ClassesManager: React.FC = () => {
  const { t } = useI18n();
  const { data, mutate } = useSWR(`${API_BASE}/classes`, fetcher);
  const rows=data?.data||[]; const [form,setForm]=useState({ name:'', class_level:'', head_teacher_id:'' });
  const add=async()=>{ if(!form.name) return; await fetch(`${API_BASE}/classes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ name:form.name, class_level: form.class_level? parseInt(form.class_level,10):undefined, head_teacher_id: form.head_teacher_id? parseInt(form.head_teacher_id,10):undefined })}); setForm({ name:'', class_level:'', head_teacher_id:''}); mutate(); };
  const deleteClass = async (id: number) => {
    const result = await Swal.fire({
      title: 'هل أنت متأكد؟',
      text: 'لن تتمكن من التراجع عن هذا!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'نعم، احذفه!'
    });
    if (!result.isConfirmed) return;
    try {
      const response = await fetch(`${API_BASE}/classes`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      const result = await response.json();
      if (result.success) {
        mutate();
      } else {
        Swal.fire('خطأ', result.error || 'فشل حذف الفصل', 'error');
      }
    } catch (error) {
      Swal.fire('خطأ', 'حدث خطأ أثناء حذف الفصل', 'error');
    }
  };
  return (
    <div className="space-y-4">
      <h2 className="font-semibold text-sm">{t('academics.classes')}</h2>
      <div className="grid md:grid-cols-5 gap-2 text-xs">
        <input placeholder={t('academics.name')} value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('academics.level')} value={form.class_level} onChange={e=>setForm({...form,class_level:e.target.value})} className="px-2 py-1 rounded border" />
        <input placeholder={t('academics.head_teacher')} value={form.head_teacher_id} onChange={e=>setForm({...form,head_teacher_id:e.target.value})} className="px-2 py-1 rounded border" />
        <button onClick={add} disabled={!form.name} className="px-2 py-1 rounded bg-[var(--color-primary)] text-white disabled:opacity-40">{t('common.add')}</button>
      </div>
      <div className="rounded border divide-y bg-white/40 dark:bg-slate-800/40 text-xs">
        {rows.map((r:any)=>(<div key={r.id} className="grid md:grid-cols-5 gap-2 px-3 py-2"><span className="col-span-2 truncate">{r.name}</span><span>{r.class_level||'-'}</span><span>{r.head_teacher_id||'-'}</span><span className="text-[10px]">{r.id}</span><button onClick={() => deleteClass(r.id)} className="text-red-500 hover:text-red-700 ml-2">{t('common.delete')}</button></div>))}
        {rows.length===0 && <div className="px-3 py-6 text-center text-gray-400">{t('academics.no_classes')}</div>}
      </div>
    </div>
  );
};