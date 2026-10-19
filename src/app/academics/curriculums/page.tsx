'use client';
import { GraduationCap } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

export default function CurriculumsPage() {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <GraduationCap className="w-10 h-10" />
      <p className="text-sm font-medium">{t('academicsPages.curriculums.soon', 'Curriculums — coming soon')}</p>
    </div>
  );
}
