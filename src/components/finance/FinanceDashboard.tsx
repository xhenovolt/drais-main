"use client";
import React, { useState } from 'react';
import { WalletsManager } from './WalletsManager';
import { StudentFinanceCard } from './StudentFinanceCard';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function FinanceDashboard(){
  const { t } = useI18n();
  const [studentId,setStudentId]=useState('');
  const [termId,setTermId]=useState('');
  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('finance.title')}</h1>
      </div>
      <WalletsManager />
      <div className="p-5 rounded-xl border bg-white/60 dark:bg-slate-900/60 backdrop-blur border-white/30 dark:border-white/10">
        <h2 className="font-semibold text-sm mb-4">{t('finance.student_finance')}</h2>
        <div className="flex flex-wrap gap-3 mb-4">
          <input value={studentId} onChange={e=>setStudentId(e.target.value)} placeholder={t('finance.student_id')} className="px-3 py-2 rounded border text-sm" />
          <input value={termId} onChange={e=>setTermId(e.target.value)} placeholder={t('finance.term_id')} className="px-3 py-2 rounded border text-sm" />
        </div>
        {studentId && termId ? <StudentFinanceCard studentId={parseInt(studentId,10)} termId={parseInt(termId,10)} /> : <div className="text-xs text-gray-500">{t('finance.enter_ids')}</div>}
      </div>
    </div>
  );
}