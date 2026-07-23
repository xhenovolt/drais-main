"use client";
/**
 * Attendance insights for the main dashboard — who is most absent, most
 * late, and most reliable, per role, over a selectable window. Data comes
 * from /api/attendance/insights (engine verdicts, not raw punches).
 *
 * Donut = status distribution (present/late/absent). Status colors are
 * always paired with labeled counts — never color alone.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { UserX, Clock, Award, TrendingUp } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const STATUS_HEX = { present: '#10b981', late: '#f59e0b', absent: '#ef4444' } as const;

interface TopPerson { personId: number; name: string; detail: string | null; absents: number; lates: number; presents: number; days: number; }
interface RoleInsights {
  distribution: { present: number; late: number; absent: number };
  mostAbsent: TopPerson[]; mostLate: TopPerson[]; bestPresent: TopPerson[];
  people: number;
}

function DistributionDonut({ d, isAr }: { d: RoleInsights['distribution']; isAr: boolean }) {
  const data = [
    { name: isAr ? 'حاضر' : 'Present', value: d.present, color: STATUS_HEX.present },
    { name: isAr ? 'متأخر' : 'Late', value: d.late, color: STATUS_HEX.late },
    { name: isAr ? 'غائب' : 'Absent', value: d.absent, color: STATUS_HEX.absent },
  ].filter(x => x.value > 0);
  const total = d.present + d.late + d.absent;
  if (total === 0) {
    return <p className="text-xs text-slate-400 py-6 text-center">{isAr ? 'لا توجد بيانات بعد' : 'No verdicts in this window yet'}</p>;
  }
  return (
    <div className="flex items-center gap-3">
      <div className="w-28 h-28 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={30} outerRadius={50} paddingAngle={2} stroke="none">
              {data.map((entry) => <Cell key={entry.name} fill={entry.color} />)}
            </Pie>
            <Tooltip
              formatter={(v: any, n: any) => [`${Number(v).toLocaleString()} ${isAr ? 'يوم' : 'days'}`, n]}
              contentStyle={{ fontSize: 12, borderRadius: 8 }}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-1 text-xs">
        {[
          { label: isAr ? 'حاضر' : 'Present', v: d.present, color: STATUS_HEX.present },
          { label: isAr ? 'متأخر' : 'Late', v: d.late, color: STATUS_HEX.late },
          { label: isAr ? 'غائب' : 'Absent', v: d.absent, color: STATUS_HEX.absent },
        ].map(x => (
          <div key={x.label} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: x.color }} />
            <span className="text-slate-500 dark:text-slate-400">{x.label}</span>
            <span className="font-semibold text-slate-800 dark:text-slate-100 tabular-nums">
              {x.v.toLocaleString()} <span className="font-normal text-slate-400">{total > 0 ? `(${Math.round((x.v / total) * 100)}%)` : ''}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopList({ title, icon, people, metric, unit, accent, isAr }: {
  title: string; icon: React.ReactNode;
  people: TopPerson[]; metric: (p: TopPerson) => number;
  unit: string; accent: string; isAr: boolean;
}) {
  return (
    <div>
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1.5">
        {icon} {title}
      </p>
      {people.length === 0 ? (
        <p className="text-xs text-slate-400">{isAr ? 'لا أحد' : 'None'}</p>
      ) : (
        <ol className="space-y-1">
          {people.map((p) => (
            <li key={p.personId} className="flex items-center justify-between gap-2 text-xs">
              <span className="truncate text-slate-700 dark:text-slate-200">
                {p.name}
                {p.detail && <span className="text-slate-400 dark:text-slate-500"> · {p.detail}</span>}
              </span>
              <span className={`font-semibold tabular-nums whitespace-nowrap ${accent}`}>
                {metric(p)} {unit}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RolePanel({ title, data, isAr }: { title: string; data: RoleInsights; isAr: boolean }) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-4">
      <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</p>
      <DistributionDonut d={data.distribution} isAr={isAr} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1 border-t border-slate-100 dark:border-slate-800">
        <TopList
          title={isAr ? 'الأكثر غياباً' : 'Most absent'}
          icon={<UserX className="w-3.5 h-3.5 text-red-500" />}
          people={data.mostAbsent} metric={(p) => p.absents}
          unit={isAr ? 'يوم' : 'days'} accent="text-red-600 dark:text-red-400" isAr={isAr}
        />
        <TopList
          title={isAr ? 'الأكثر تأخراً' : 'Most late'}
          icon={<Clock className="w-3.5 h-3.5 text-amber-500" />}
          people={data.mostLate} metric={(p) => p.lates}
          unit={isAr ? 'مرة' : 'times'} accent="text-amber-600 dark:text-amber-400" isAr={isAr}
        />
        <TopList
          title={isAr ? 'الأفضل حضوراً' : 'Best attendance'}
          icon={<Award className="w-3.5 h-3.5 text-emerald-500" />}
          people={data.bestPresent} metric={(p) => p.presents}
          unit={isAr ? 'يوم' : 'days'} accent="text-emerald-600 dark:text-emerald-400" isAr={isAr}
        />
      </div>
    </div>
  );
}

export default function AttendanceInsights() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const [days, setDays] = useState(30);
  const { data } = useSWR<any>(`/api/attendance/insights?days=${days}`, (u: string) => fetch(u).then(r => r.json()));

  if (!data?.success) return null; // silent until verdicts exist

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <TrendingUp className="w-4 h-4 text-indigo-500" />
          {isAr ? 'تحليلات الحضور' : 'Attendance Insights'}
        </p>
        <select
          value={days}
          onChange={(e) => setDays(Number(e.target.value))}
          className="text-xs px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value={7}>{isAr ? 'آخر ٧ أيام' : 'Last 7 days'}</option>
          <option value={14}>{isAr ? 'آخر ١٤ يوماً' : 'Last 14 days'}</option>
          <option value={30}>{isAr ? 'آخر ٣٠ يوماً' : 'Last 30 days'}</option>
          <option value={90}>{isAr ? 'آخر ٩٠ يوماً' : 'Last 90 days'}</option>
        </select>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <RolePanel title={isAr ? 'الموظفون' : 'Staff'} data={data.staff} isAr={isAr} />
        <RolePanel title={isAr ? 'الطلاب' : 'Learners'} data={data.learners} isAr={isAr} />
      </div>
    </div>
  );
}
