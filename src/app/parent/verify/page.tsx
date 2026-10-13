'use client';
/**
 * /parent/verify — step 2 of pure phone-OTP login. Enter the 6-digit code →
 * verify-otp opens a session and we go to the dashboard.
 */
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { LanguageToggle } from '@/components/parent/PortalUI';

// The server answers in English; map the answers we know to translated text.
const SERVER_ERRORS: Record<string, string> = {
  'Invalid or expired code': 'parent.verify.invalidCode',
  'Phone and 6-digit code are required': 'parent.verify.invalidCode',
  'This account has been suspended. Contact your school.': 'parent.verify.suspended',
};

function VerifyInner() {
  const router = useRouter();
  const { t } = useI18n();
  const params = useSearchParams();
  const phone = params.get('phone') ?? '';
  const [code, setCode] = useState('');
  const [errKey, setErrKey] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErrKey(''); setBusy(true);
    try {
      const res = await fetch('/api/parent/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) { setErrKey(SERVER_ERRORS[data.error] ?? 'parent.verify.invalidCode'); return; }
      router.push('/parent');
    } catch { setErrKey('parent.common.networkError'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-emerald-600 via-emerald-600 to-teal-700 px-4 py-4">
      <div className="flex justify-end"><LanguageToggle onDark /></div>
      <div className="flex flex-1 items-center justify-center py-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center text-center text-white">
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-white/15 ring-1 ring-white/25">
              <ShieldCheck className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold">{t('parent.verify.title')}</h1>
            <p className="mt-1.5 break-normal text-sm leading-snug text-emerald-50">
              {phone ? t('parent.verify.sentTo', { phone: `⁦${phone}⁩` }) : t('parent.verify.sentToYourPhone')}
            </p>
          </div>

          <form onSubmit={submit} className="space-y-4 rounded-3xl bg-white p-5 shadow-xl dark:bg-slate-900">
            <input
              type="tel" inputMode="numeric" autoComplete="one-time-code" autoFocus required maxLength={6} dir="ltr"
              aria-label={t('parent.verify.codeLabel')}
              value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="••••••"
              className="h-16 w-full rounded-2xl border border-slate-300 bg-transparent text-center text-3xl font-bold tracking-[0.4em] text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200 dark:border-slate-700 dark:text-white dark:focus:ring-emerald-900"
            />
            {errKey && <p role="alert" className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-900/30 dark:text-rose-300">{t(errKey)}</p>}
            <button type="submit" disabled={busy || code.length !== 6}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 text-base font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50">
              {busy ? <Loader className="h-5 w-5 animate-spin" /> : t('parent.verify.submit')}
            </button>
            <button type="button" onClick={() => router.push('/parent/login')}
              className="h-10 w-full text-sm font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              {t('parent.verify.differentNumber')}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function ParentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <VerifyInner />
    </Suspense>
  );
}
