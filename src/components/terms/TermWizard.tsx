"use client";
import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const API_BASE = '/api';
const fetcher = (u: string) => fetch(u, { credentials: 'include' }).then(r => r.json());
interface Year { id: number; name: string; status?: string }
interface Props { open: boolean; onClose: ()=>void; onCreated: ()=>void; }
export const TermWizard: React.FC<Props> = ({ open, onClose, onCreated }) => {
  const { t, digits } = useI18n();
  // The term must belong to one of this school's own years — never a fixed id.
  const { data: yearsRes } = useSWR(open ? `${API_BASE}/academic_years` : null, fetcher);
  const years: Year[] = Array.isArray(yearsRes?.data) ? yearsRes.data : [];
  const defaultYear = (years.find(y => y.status === 'active') ?? years[0])?.id ?? '';
  const blank = () => ({ name:'', academic_year_id: defaultYear, start_date:'', end_date:'', status: 'scheduled' });
  const [form,setForm]=useState<any>(blank);
  const [loading,setLoading]=useState(false);
  const [message, setMessage] = useState('');
  useEffect(()=>{ if(open){ setForm(blank()); }},[open]);
  useEffect(()=>{ if(open && !form.academic_year_id && defaultYear){ setForm((f: any) => ({ ...f, academic_year_id: defaultYear })); }},[open, defaultYear]);
  if(!open) return null;
  const submit=async(e: React.FormEvent)=>{
    e.preventDefault();
    if (!form.academic_year_id) { setMessage(t('academicsPages.termList.w.needYear', 'Create an academic year first, then add its terms.')); return; }
    setLoading(true);
    setMessage('');
    try {
      const res=await fetch(`${API_BASE}/terms`, { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
      const result = await res.json();
      if (result.success) {
        setMessage(t('academicsPages.termList.w.created', "Term created!"));
        setForm(blank());
        onCreated();
      } else {
        setMessage(result.error && !(uiIsArabic() && isEnglishText(result.error)) ? result.error : t('academicsPages.termList.w.failed', "Failed"));
      }
    } catch(e:any) {
      setMessage(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.termList.w.failed', "Failed"));
    } finally { setLoading(false);} }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="rounded-2xl border border-blue-200 dark:border-indigo-700 bg-gradient-to-br from-white/80 via-blue-50/60 to-pink-50/60 dark:from-slate-900/80 dark:via-indigo-900/60 dark:to-purple-900/60 shadow-2xl p-8 mx-4 sm:mx-20 max-w-xl w-full">
        <h2 className="text-xl font-bold text-indigo-700 dark:text-pink-300 mb-4">{t('terms.add')}</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{t('terms.name')}</label>
            <input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('academicsPages.termList.w.year', 'Academic year')}</label>
            <select required value={form.academic_year_id} onChange={e=>setForm({...form,academic_year_id:Number(e.target.value)})} className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border focus:outline-none focus:ring-2 focus:ring-blue-500">
              {years.length === 0 && <option value="">{t('academicsPages.termList.w.noYears', 'No academic years yet')}</option>}
              {years.map(y => <option key={y.id} value={y.id}>{digits(y.name)}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium mb-1">{t('terms.start')}</label>
              <input type="date" value={form.start_date} onChange={e=>setForm({...form,start_date:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">{t('terms.end')}</label>
              <input type="date" value={form.end_date} onChange={e=>setForm({...form,end_date:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{t('terms.status')}</label>
            <select value={form.status} onChange={e=>setForm({...form,status:e.target.value})} className="w-full px-4 py-2 rounded-lg bg-white dark:bg-gray-800 border focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="scheduled">{t('academicsPages.termList.w.scheduled', "Scheduled")}</option>
              <option value="active">{t('academicsPages.termList.w.active', "Active")}</option>
              <option value="completed">{t('academicsPages.termList.w.completed', "Completed")}</option>
            </select>
          </div>
          {message && <div className="text-sm text-blue-500 font-semibold">{message}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose} className="px-6 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg transition-colors">{t('academicsPages.termList.w.cancel', "Cancel")}</button>
            <button type="submit" disabled={loading} className="px-6 py-2 bg-gradient-to-r from-green-400 to-blue-500 text-white rounded-lg shadow-md hover:shadow-lg transition-transform transform hover:scale-105">{loading ? t('academicsPages.termList.w.saving', "Saving...") : t('academicsPages.termList.w.save', "Save")}</button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default TermWizard;
