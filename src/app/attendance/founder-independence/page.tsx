'use client';

/**
 * Founder Independence (Phase 10 capstone). The before/after proof that a
 * trained administrator can now run attendance without the founder — each
 * workflow, its old dependence, what replaced it, and where to do it.
 */
import React, { useEffect, useState } from 'react';
import { ShieldCheck, ArrowRight, Loader2 } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const AUTONOMY_STYLE: Record<string, string> = {
  founder: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  manual: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  assisted: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  automated: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
};
const LABEL: Record<string, string> = { founder: 'Founder', manual: 'Manual', assisted: 'Assisted', automated: 'Automated' };

export default function FounderIndependence() {
  const { t, lang, digits } = useI18n();
  // Live notes come from the server in two fixed shapes (lib/attendance/founder-independence.ts).
  const liveText = (s: string) => {
    if (lang !== 'ar') return s;
    let m = s.match(/^(\d+) drift day\(s\) auto-detected in 30; baseline (learned|pending)$/);
    if (m) return t('attendancePages.founder.live.clock', { n: m[1], state: t(`attendancePages.founder.live.${m[2]}`) });
    m = s.match(/^(\d+) unmatched punch\(es\) flagged \(7d\)$/);
    if (m) return t('attendancePages.founder.live.unmatched', { n: m[1] });
    return digits(s);
  };
  const phaseText = (s: string) => (lang !== 'ar' ? s : s === 'pre-program' ? t('attendancePages.founder.preProgram') : digits(s.replace(/^Phase (\d+)/, (_m, n) => t('attendancePages.founder.phase', { n }))));
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch('/api/attendance/founder-independence', { cache: 'no-store' }).then(r => r.json()).then(setData).catch(() => {}); }, []);

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><ShieldCheck className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('attendancePages.founder.title')}</h1>
          <p className="text-sm text-gray-500">{t('attendancePages.founder.subtitle')}</p>
        </div>
      </div>

      {!data && <div className="py-16 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-600 inline" /></div>}

      {data?.score && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 flex items-center gap-6 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="text-center">
              <div className="text-3xl font-bold text-rose-500 tabular-nums">{lang === 'ar' ? `${digits(data.score.before)}٪` : `${data.score.before}%`}</div>
              <div className="text-[10px] text-gray-400 uppercase">{t('attendancePages.founder.baseline')}</div>
            </div>
            <ArrowRight className="w-6 h-6 text-gray-300" />
            <div className="text-center">
              <div className="text-4xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">{lang === 'ar' ? `${digits(data.score.after)}٪` : `${data.score.after}%`}</div>
              <div className="text-[10px] text-gray-400 uppercase">{t('attendancePages.founder.now')}</div>
            </div>
          </div>
          <div className="flex-1 min-w-[200px]">
            <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">{t('attendancePages.founder.delta', { n: data.score.delta })}</p>
            <p className="text-xs text-gray-500 mt-0.5">{t('attendancePages.founder.weighted', { n: data.rows.length })}</p>
          </div>
        </div>
      )}

      {data?.rows && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-900/40 text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-start">{t('attendancePages.founder.col.workflow')}</th>
                <th className="px-3 py-2 text-center">{t('attendancePages.founder.col.before')}</th>
                <th className="px-3 py-2 text-center">{t('attendancePages.founder.col.now')}</th>
                <th className="px-3 py-2 text-start">{t('attendancePages.founder.col.handledBy')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/50">
              {data.rows.map((r: any) => (
                <tr key={r.key}>
                  <td className="px-3 py-2.5">
                    <div className="text-gray-800 dark:text-gray-100">{t(`attendancePages.founder.wf.${r.key}.workflow`, r.workflow)}</div>
                    {r.live && <div className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-0.5">● {liveText(r.live)}</div>}
                  </td>
                  <td className="px-3 py-2.5 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${AUTONOMY_STYLE[r.before]}`}>{t(`attendancePages.founder.autonomy.${r.before}`, LABEL[r.before])}</span></td>
                  <td className="px-3 py-2.5 text-center"><span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${AUTONOMY_STYLE[r.after]}`}>{t(`attendancePages.founder.autonomy.${r.after}`, LABEL[r.after])}</span></td>
                  <td className="px-3 py-2.5">
                    <div className="text-xs text-gray-600 dark:text-gray-300">{t(`attendancePages.founder.wf.${r.key}.surface`, r.surface)}</div>
                    <div className="text-[10px] text-gray-400">{phaseText(r.phase)}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
