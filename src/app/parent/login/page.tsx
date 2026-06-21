'use client';
/**
 * /parent/login — step 1 of pure phone-OTP login. Enter phone → request OTP →
 * go to /parent/verify. Response is always generic (no enumeration).
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Loader, GraduationCap } from 'lucide-react';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/parent/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      if (!res.ok) { setErr('Could not send code. Try again.'); return; }
      router.push(`/parent/verify?phone=${encodeURIComponent(phone)}`);
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mb-3">
            <GraduationCap className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Parent Portal</h1>
          <p className="text-xs text-slate-400 text-center">Enter your phone number to follow your children across all their schools.</p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <label className="block">
            <span className="text-xs font-medium text-slate-500">Phone number</span>
            <div className="mt-1 flex items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 px-3">
              <Phone className="w-4 h-4 text-slate-400" />
              <input
                type="tel" inputMode="tel" autoFocus required
                value={phone} onChange={(e) => setPhone(e.target.value)}
                placeholder="07XX XXX XXX or +2567…"
                className="flex-1 bg-transparent py-2.5 text-sm outline-none text-slate-800 dark:text-white"
              />
            </div>
          </label>
          {err && <p className="text-xs text-rose-600">{err}</p>}
          <button type="submit" disabled={busy || !phone}
            className="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? <Loader className="w-4 h-4 animate-spin" /> : 'Send code'}
          </button>
          <p className="text-[11px] text-slate-400 text-center">
            We&apos;ll text a 6-digit code if your number is linked to a learner.
          </p>
        </form>
      </div>
    </div>
  );
}
