'use client';
/**
 * /parent/verify — step 2 of pure phone-OTP login. Enter the 6-digit code →
 * verify-otp opens a session and we go to the dashboard.
 */
import React, { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldCheck, Loader } from 'lucide-react';

function VerifyInner() {
  const router = useRouter();
  const params = useSearchParams();
  const phone = params.get('phone') ?? '';
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/parent/auth/verify-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Invalid code'); return; }
      router.push('/parent');
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 flex items-center justify-center text-white mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Enter code</h1>
          <p className="text-xs text-slate-400 text-center">
            We sent a 6-digit code to {phone || 'your phone'}.
          </p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <input
            type="tel" inputMode="numeric" autoFocus required maxLength={6}
            value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            className="w-full text-center tracking-[0.5em] text-2xl font-bold rounded-xl border border-slate-200 dark:border-slate-700 py-3 bg-transparent text-slate-800 dark:text-white outline-none"
          />
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <button type="submit" disabled={busy || code.length !== 6}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-emerald-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Verify & continue'}
          </button>
          <button type="button" onClick={() => router.push('/parent/login')}
            className="w-full text-[11px] text-slate-400 hover:text-slate-600">
            Use a different number
          </button>
        </form>
      </div>
    </div>
  );
}

export default function ParentVerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-slate-400 text-sm">Loading…</div>}>
      <VerifyInner />
    </Suspense>
  );
}
