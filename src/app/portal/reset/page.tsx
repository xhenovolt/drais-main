"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, Lock, Loader, KeyRound, ShieldCheck } from 'lucide-react';

export default function ParentResetPage() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'reset'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await fetch('/api/portal/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'reset' }),
      });
      setMsg('If the number is registered, a reset code has been sent.');
      setStep('reset');
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (newPassword.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/portal/auth/reset-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, otp, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Reset failed'); return; }
      router.push('/portal/login');
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Reset Password</h1>
        </div>

        {step === 'phone' ? (
          <form onSubmit={sendCode} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xx xxx xxx"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button disabled={busy} className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader className="w-4 h-4 animate-spin" />} Send reset code
            </button>
            <div className="text-center text-xs pt-1">
              <Link href="/portal/login" className="text-indigo-600 hover:underline">Back to sign in</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={reset} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
            {msg && <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2"><ShieldCheck className="w-4 h-4 text-emerald-500" />{msg}</div>}
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code" inputMode="numeric"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-indigo-500" />
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="New password (min 8)"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button disabled={busy || otp.length !== 6} className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader className="w-4 h-4 animate-spin" />} Reset password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
