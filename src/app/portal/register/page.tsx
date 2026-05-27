"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, Lock, User, Loader, GraduationCap, ShieldCheck } from 'lucide-react';

export default function ParentRegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'verify'>('details');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function sendOtp(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    if (password.length < 8) { setErr('Password must be at least 8 characters'); return; }
    setBusy(true);
    try {
      const res = await fetch('/api/portal/auth/request-otp', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'verify' }),
      });
      if (!res.ok) { const d = await res.json(); setErr(d.error || 'Could not send code'); return; }
      setStep('verify');
    } catch { setErr('Network error'); }
    finally { setBusy(false); }
  }

  async function register(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/portal/auth/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password, fullName, otp }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Registration failed'); return; }
      router.push('/portal');
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
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Create Parent Account</h1>
          <p className="text-xs text-slate-400">We'll verify your phone with a code</p>
        </div>

        {step === 'details' ? (
          <form onSubmit={sendOtp} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Full name"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xx xxx xxx"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (min 8)"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
            <button disabled={busy} className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader className="w-4 h-4 animate-spin" />} Send verification code
            </button>
            <div className="text-center text-xs pt-1">
              <Link href="/portal/login" className="text-indigo-600 hover:underline">Already have an account? Sign in</Link>
            </div>
          </form>
        ) : (
          <form onSubmit={register} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
            {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
            <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" /> Code sent to {phone}
            </div>
            <input value={otp} onChange={e => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code" inputMode="numeric"
              className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-center text-lg tracking-[0.4em] outline-none focus:ring-2 focus:ring-indigo-500" />
            <button disabled={busy || otp.length !== 6} className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
              {busy && <Loader className="w-4 h-4 animate-spin" />} Verify & create account
            </button>
            <button type="button" onClick={() => setStep('details')} className="w-full text-xs text-slate-400 hover:text-slate-600">← Back</button>
          </form>
        )}
      </div>
    </div>
  );
}
