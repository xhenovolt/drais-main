'use client';

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { MessageSquare, ArrowRight, AlertTriangle } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';

const fetcher = (url: string) => fetch(url).then((r) => r.json());

type Level = 'ok' | 'low' | 'empty' | 'unlimited';

/**
 * Dashboard SMS balance. SMS carries attendance alerts to parents, so how many are left has to be
 * visible without opening the communications page. Reads /api/sms/quota, which is computed from
 * the usage ledger that every send path (attendance, broadcast, composer, dispatch) writes to.
 */
export default function SmsBalanceCard() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const { data, isLoading } = useSWR('/api/sms/quota', fetcher, { refreshInterval: 30000, revalidateOnFocus: true });

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 animate-pulse">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
        <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    );
  }
  if (!data?.success) return null;

  const quota: number | null = data.quota;
  const used: number = Number(data.used ?? 0);
  const remaining: number | null = data.remaining;
  const platformDown = data.reason === 'PLATFORM_BALANCE_DEPLETED';

  let level: Level = 'ok';
  if (quota == null) level = 'unlimited';
  else if (remaining != null && remaining <= 0) level = 'empty';
  else if (remaining != null && (remaining <= 200 || remaining / Math.max(1, quota) <= 0.1)) level = 'low';
  if (platformDown) level = 'empty';

  const styles: Record<Level, { border: string; bar: string; text: string }> = {
    ok: { border: 'border-green-200 dark:border-green-800', bar: 'bg-green-500', text: 'text-green-700 dark:text-green-400' },
    low: { border: 'border-amber-300 dark:border-amber-700', bar: 'bg-amber-500', text: 'text-amber-700 dark:text-amber-400' },
    empty: { border: 'border-red-300 dark:border-red-800', bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' },
    unlimited: { border: 'border-gray-200 dark:border-gray-700', bar: 'bg-gray-300 dark:bg-gray-600', text: 'text-gray-700 dark:text-gray-300' },
  };
  const s = styles[level];
  const pctUsed = quota && quota > 0 ? Math.min(100, Math.round((used / quota) * 100)) : 0;
  const fmt = (n: number) => n.toLocaleString();

  return (
    <div className={`relative bg-white dark:bg-gray-800 rounded-xl border overflow-hidden ${s.border}`}>
      <div className={`h-1 ${s.bar}`} />
      <div className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            {isAr ? 'رصيد الرسائل' : 'SMS balance'}
          </h3>
          <div className="flex items-center gap-3">
            <Link href="/admin/sms/buy" className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline">
              {isAr ? 'شراء رسائل' : 'Buy SMS'}
            </Link>
            <Link href="/admin/communications" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              {isAr ? 'إرسال' : 'Send'} <ArrowRight className="w-3 h-3 rtl-flip" />
            </Link>
          </div>
        </div>

        {level === 'unlimited' ? (
          <>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{isAr ? 'بلا حد' : 'No limit set'}</div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{fmt(used)} {isAr ? 'رسالة مستخدمة' : 'SMS used so far'}</p>
          </>
        ) : (
          <>
            <div className="flex items-baseline gap-2">
              <span className={`text-3xl font-bold ${s.text}`}>{fmt(remaining ?? 0)}</span>
              <span className="text-sm text-gray-500 dark:text-gray-400">{isAr ? 'رسالة متبقية' : 'SMS left'}</span>
            </div>
            <div className="mt-3 h-2 rounded-full bg-gray-100 dark:bg-gray-700 overflow-hidden" role="progressbar" aria-valuenow={pctUsed} aria-valuemin={0} aria-valuemax={100}>
              <div className={`h-full ${s.bar}`} style={{ width: `${pctUsed}%` }} />
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {fmt(used)} {isAr ? 'مستخدمة من' : 'used of'} {fmt(quota ?? 0)}
            </p>
          </>
        )}

        {(level === 'low' || level === 'empty') && (
          <div className={`mt-3 flex items-start gap-2 text-xs ${s.text}`}>
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>
              {platformDown
                ? (isAr ? 'خدمة الرسائل متوقفة مؤقتاً. تواصل مع مسؤول النظام.' : 'The SMS service is temporarily unavailable. Contact the administrator.')
                : level === 'empty'
                  ? (isAr ? 'انتهت الرسائل. لن تُرسل الرسائل الجماعية حتى يتم الشحن.' : 'SMS finished. Bulk messages are blocked until the administrator tops up.')
                  : (isAr ? 'الرصيد منخفض. اطلب شحن الرسائل قريباً.' : 'Running low. Ask the administrator to top up soon.')}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
