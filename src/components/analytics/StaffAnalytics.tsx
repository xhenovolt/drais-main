'use client';

/**
 * StaffAnalytics — the payroll and workforce view behind /analytics/staff.
 *
 * The API (/api/analytics/staff-payroll) already existed and was fully written;
 * nothing consumed it, so the page shipped as a "coming soon" stub. This is the
 * consumer.
 *
 * Data notes that shape the UI here:
 *  - `salaryOverview` and `outstandingPayments` both aggregate salaries and
 *    payments in ONE query with two LEFT JOINs. That fans out — a staff member
 *    with 3 salary entries and 2 payments produces 6 rows before GROUP BY, so
 *    the SUMs are inflated. Treated as INDICATIVE and labelled as such rather
 *    than presented as an accounting figure; the Finance ledger is the
 *    authority for money owed. See the note rendered under the payroll tiles.
 *  - `attendance_rate` is over a rolling 30 days and is NULL for staff with no
 *    attendance rows at all — rendered as "—", never as 0%, because a staff
 *    member with no device scans is unknown, not absent.
 */

import React, { useMemo } from 'react';
import useSWR from 'swr';
import {
  Users, Wallet, AlertTriangle, TrendingUp, CalendarClock, BadgeCheck,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, Cell,
} from 'recharts';
import DashboardCard from '@/components/dashboard/DashboardCard';
import { useCurrency } from '@/hooks/useCurrency';
import { CATEGORICAL, STATUS, AXIS, tooltipStyle, compact } from './chartTheme';

type Row = Record<string, any>;

interface StaffPayrollData {
  staffOverview: Row[];
  salaryOverview: Row[];
  payrollDistribution: Row[];
  paymentTrends: Row[];
  staffByPosition: Row[];
  outstandingPayments: Row[];
}

const num = (v: any) => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** A KPI tile. Value is ink, not colour — the icon carries the accent. */
function Stat({
  label, value, sub, icon: Icon, accent,
}: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<any>; accent: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {label}
          </p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 dark:text-slate-100 tabular-nums truncate">
            {value}
          </p>
          {sub && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{sub}</p>}
        </div>
        <span
          className="shrink-0 rounded-xl p-2"
          style={{ background: `${accent}1a`, color: accent }}
        >
          <Icon className="w-5 h-5" />
        </span>
      </div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-64 items-center justify-center px-6 text-center text-sm text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}

export default function StaffAnalytics({ month }: { month?: string }) {
  const qs = month ? `?month=${encodeURIComponent(month)}` : '';
  const { data, error, isLoading } = useSWR<{ success: boolean; data: StaffPayrollData }>(
    `/api/analytics/staff-payroll${qs}`,
  );
  const { format } = useCurrency();

  const d = data?.data;

  const totals = useMemo(() => {
    const salary = d?.salaryOverview ?? [];
    const owed = salary.reduce((s, r) => s + num(r.total_salary), 0);
    const paid = salary.reduce((s, r) => s + num(r.total_paid), 0);
    const outstanding = (d?.outstandingPayments ?? []).reduce((s, r) => s + num(r.outstanding), 0);
    const active = (d?.staffOverview ?? []).length;
    const rates = (d?.staffOverview ?? [])
      .map((r) => (r.attendance_rate == null ? null : num(r.attendance_rate)))
      .filter((v): v is number => v != null);
    const avgAttendance = rates.length
      ? rates.reduce((a, b) => a + b, 0) / rates.length
      : null;
    return { owed, paid, outstanding, active, avgAttendance, tracked: rates.length };
  }, [d]);

  const byPosition = useMemo(
    () =>
      (d?.staffByPosition ?? [])
        .map((r) => ({
          position: String(r.position ?? 'Not specified'),
          staff: num(r.staff_count),
          tenureYears: r.avg_tenure_days == null ? null : num(r.avg_tenure_days) / 365,
        }))
        .sort((a, b) => b.staff - a.staff)
        .slice(0, 10),
    [d],
  );

  const trends = useMemo(
    () =>
      (d?.paymentTrends ?? [])
        .map((r) => ({
          date: r.payment_date ? new Date(r.payment_date).toISOString().slice(0, 10) : '',
          total: num(r.daily_total),
          staff: num(r.unique_staff_paid),
        }))
        .filter((r) => r.date)
        .sort((a, b) => a.date.localeCompare(b.date)),
    [d],
  );

  const distribution = useMemo(
    () =>
      (d?.payrollDistribution ?? [])
        .filter((r) => num(r.total_amount) > 0)
        .map((r) => ({
          name: String(r.definition_name ?? '—'),
          type: String(r.definition_type ?? ''),
          total: num(r.total_amount),
          staff: num(r.staff_count),
        }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    [d],
  );

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
        <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
      </div>
    );
  }

  if (error || !data?.success) {
    return (
      <DashboardCard>
        <div className="p-6 text-sm">
          <p className="font-medium text-slate-900 dark:text-slate-100">
            Staff analytics could not be loaded.
          </p>
          <p className="mt-1 text-slate-500 dark:text-slate-400">
            This view needs the Analytics module enabled and permission to view staff records.
          </p>
        </div>
      </DashboardCard>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active staff"
          value={totals.active.toLocaleString()}
          sub={`${byPosition.length} position${byPosition.length === 1 ? '' : 's'}`}
          icon={Users}
          accent={CATEGORICAL[0]}
        />
        <Stat
          label="Payroll recorded"
          value={format(totals.owed)}
          sub="Indicative — see note"
          icon={Wallet}
          accent={CATEGORICAL[2]}
        />
        <Stat
          label="Paid"
          value={format(totals.paid)}
          sub={totals.owed > 0 ? `${Math.round((totals.paid / totals.owed) * 100)}% of recorded` : undefined}
          icon={BadgeCheck}
          accent={STATUS.good}
        />
        <Stat
          label="Outstanding"
          value={format(totals.outstanding)}
          sub={`${(d?.outstandingPayments ?? []).length} staff affected`}
          icon={AlertTriangle}
          accent={totals.outstanding > 0 ? STATUS.critical : STATUS.neutral}
        />
      </div>

      <div className="rounded-xl border border-amber-300/60 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
        <strong>Payroll figures here are indicative.</strong> They come from a query that joins
        salary entries and payments together, which inflates the totals when a staff member has
        several of each. Use them to spot who needs attention, not to settle an account — the
        Finance ledger is the authority.
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardCard title="Staff by position">
          {byPosition.length === 0 ? (
            <Empty>No staff records yet. Add staff under Administration → Staff.</Empty>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={byPosition} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid horizontal={false} stroke={AXIS.grid} />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: AXIS.tick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    type="category"
                    dataKey="position"
                    width={130}
                    tick={{ fontSize: 11, fill: AXIS.tick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: any) => [`${v} staff`, 'Headcount']}
                    cursor={{ fill: 'rgb(148 163 184 / 0.12)' }}
                  />
                  {/* One series → one hue. A rainbow here would imply the
                      positions differ in kind rather than in count. */}
                  <Bar dataKey="staff" fill={CATEGORICAL[0]} radius={[0, 4, 4, 0]} barSize={14}>
                    {byPosition.map((r) => (
                      <Cell key={r.position} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Salary payments — last 90 days">
          {trends.length === 0 ? (
            <Empty>No salary payments recorded in the last 90 days.</Empty>
          ) : (
            <div className="p-4">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={trends} margin={{ left: 8, right: 16 }}>
                  <CartesianGrid vertical={false} stroke={AXIS.grid} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: AXIS.tick }}
                    axisLine={false}
                    tickLine={false}
                    minTickGap={28}
                  />
                  <YAxis
                    tickFormatter={compact}
                    tick={{ fontSize: 11, fill: AXIS.tick }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...tooltipStyle}
                    formatter={(v: any) => [format(Number(v)), 'Paid']}
                  />
                  {/* Single measure, single axis. Headcount paid lives in the
                      tooltip rather than on a second y-scale. */}
                  <Line
                    type="monotone"
                    dataKey="total"
                    stroke={CATEGORICAL[1]}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </DashboardCard>
      </div>

      <DashboardCard title="Payroll composition">
        {distribution.length === 0 ? (
          <Empty>No payroll definitions carry amounts yet.</Empty>
        ) : (
          <div className="p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={distribution} margin={{ left: 8, right: 16 }}>
                <CartesianGrid vertical={false} stroke={AXIS.grid} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: AXIS.tick }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tickFormatter={compact}
                  tick={{ fontSize: 11, fill: AXIS.tick }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  {...tooltipStyle}
                  formatter={(v: any, _n: any, p: any) => [
                    `${format(Number(v))} · ${p?.payload?.staff ?? 0} staff`,
                    p?.payload?.type || 'Total',
                  ]}
                  cursor={{ fill: 'rgb(148 163 184 / 0.12)' }}
                />
                <Bar dataKey="total" fill={CATEGORICAL[2]} radius={[4, 4, 0, 0]} maxBarSize={44} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </DashboardCard>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <DashboardCard title="Outstanding payments">
          {(d?.outstandingPayments ?? []).length === 0 ? (
            <Empty>Nothing outstanding. Every active staff member is settled.</Empty>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    <th className="px-4 py-2 font-medium">Staff</th>
                    <th className="px-4 py-2 font-medium">Position</th>
                    <th className="px-4 py-2 text-right font-medium">Outstanding</th>
                    <th className="px-4 py-2 text-right font-medium">Last paid</th>
                  </tr>
                </thead>
                <tbody>
                  {(d?.outstandingPayments ?? []).map((r) => (
                    <tr
                      key={r.staff_id}
                      className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                    >
                      <td className="px-4 py-2 text-slate-900 dark:text-slate-100">
                        {r.staff_name}
                        <span className="block text-xs text-slate-400">{r.staff_no}</span>
                      </td>
                      <td className="px-4 py-2 text-slate-600 dark:text-slate-300">
                        {r.position || '—'}
                      </td>
                      <td className="px-4 py-2 text-right font-medium tabular-nums text-slate-900 dark:text-slate-100">
                        {format(num(r.outstanding))}
                      </td>
                      <td className="px-4 py-2 text-right tabular-nums text-slate-500 dark:text-slate-400">
                        {r.days_since_payment == null
                          ? 'Never'
                          : `${num(r.days_since_payment)}d ago`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DashboardCard>

        <DashboardCard title="Attendance — rolling 30 days">
          {(d?.staffOverview ?? []).length === 0 ? (
            <Empty>No active staff to report on.</Empty>
          ) : (
            <>
              <div className="flex items-center gap-3 px-6 pt-4 text-sm text-slate-600 dark:text-slate-300">
                <CalendarClock className="h-4 w-4 text-slate-400" />
                {totals.avgAttendance == null ? (
                  <span>No attendance recorded for any staff member yet.</span>
                ) : (
                  <span>
                    Average <strong>{totals.avgAttendance.toFixed(1)}%</strong> across{' '}
                    {totals.tracked} of {totals.active} staff with records.
                  </span>
                )}
              </div>
              <div className="mt-2 max-h-72 overflow-y-auto">
                <table className="w-full text-sm">
                  <tbody>
                    {(d?.staffOverview ?? [])
                      .slice()
                      .sort((a, b) => num(a.attendance_rate) - num(b.attendance_rate))
                      .slice(0, 25)
                      .map((r) => {
                        const rate = r.attendance_rate == null ? null : num(r.attendance_rate);
                        const tone =
                          rate == null ? STATUS.neutral
                            : rate >= 90 ? STATUS.good
                              : rate >= 75 ? STATUS.warning
                                : STATUS.critical;
                        return (
                          <tr
                            key={r.staff_id}
                            className="border-b border-slate-100 last:border-0 dark:border-slate-800"
                          >
                            <td className="px-4 py-2 text-slate-900 dark:text-slate-100">
                              {r.staff_name}
                            </td>
                            <td className="px-4 py-2 text-right">
                              {/* Colour + number, never colour alone. */}
                              <span
                                className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums"
                                style={{ background: `${tone}1a`, color: tone }}
                              >
                                <span
                                  className="h-1.5 w-1.5 rounded-full"
                                  style={{ background: tone }}
                                />
                                {rate == null ? 'No records' : `${rate.toFixed(0)}%`}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              <p className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400">
                Lowest first. &ldquo;No records&rdquo; means no scans were found — not absence.
              </p>
            </>
          )}
        </DashboardCard>
      </div>
    </div>
  );
}
