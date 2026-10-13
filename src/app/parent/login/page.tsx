'use client';
/**
 * /parent/login — step 1 of pure phone-OTP login. Enter phone → request OTP →
 * go to /parent/verify. Response is always generic (no enumeration).
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Loader, GraduationCap, CalendarCheck, TrendingUp, Wallet } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageToggle } from '@/components/parent/PortalUI';

export default function ParentLoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState<'' | 'send' | 'network'>('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/parent/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) { setErr('send'); return; }
      router.push(`/parent/verify?phone=${encodeURIComponent(phone)}`);
    } catch { setErr('network'); }
    finally { setBusy(false); }
  }

  const points = [
    { icon: CalendarCheck, text: t('parent.login.pointAttendance') },
    { icon: TrendingUp, text: t('parent.login.pointResults') },
    { icon: Wallet, text: t('parent.login.pointFees') },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-indigo-600 via-indigo-600 to-violet-700 px-4 py-4">
      <div className="flex justify-end"><LanguageToggle onDark /></div>
      <div className="flex flex-1 items-center justify-center py-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center text-white">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/25">
              <GraduationCap className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold">{t('parent.login.title')}</h1>
            <p className="mt-1.5 break-normal text-sm leading-snug text-indigo-100">{t('parent.login.subtitle')}</p>
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <label className="block">
              <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t('parent.login.phoneLabel')}</span>
              <div className="mt-1.5 flex items-center gap-2 rounded-2xl border border-slate-300 px-3 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-200 dark:border-slate-700 dark:focus-within:ring-indigo-900">
                <Phone className="h-5 w-5 shrink-0 text-slate-400" data-no-mirror />
                <input
                  type="tel" inputMode="tel" autoComplete="tel" autoFocus required dir="ltr"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  placeholder="07XX XXX XXX"
                  className="h-12 min-w-0 flex-1 bg-transparent text-base text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
                />
              </div>
            </label>
            {err && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{t(err === 'send' ? 'parent.login.sendFailed' : 'parent.common.networkError')}</p>}
            <button type="submit" disabled={busy || !phone}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 text-base font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50">
              {busy ? <Loader className="h-5 w-5 animate-spin" /> : t('parent.login.sendCode')}
            </button>
            <p className="break-normal text-center text-xs leading-snug text-slate-500 dark:text-slate-400">{t('parent.login.codeNote')}</p>
          </form>

          <ul className="mt-6 space-y-2.5 text-sm text-indigo-50">
            {points.map((p) => (
              <li key={p.text} className="flex items-start gap-2.5">
                <p.icon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="break-normal leading-snug">{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
