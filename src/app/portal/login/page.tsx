"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone, Lock, Loader, GraduationCap } from 'lucide-react';

export default function ParentLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      const res = await fetch('/api/portal/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password }),
      });
      const data = await res.json();
      if (!res.ok) { setErr(data.error || 'Login failed'); return; }
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
          <h1 className="text-lg font-bold text-slate-800 dark:text-white">Parent Portal</h1>
          <p className="text-xs text-slate-400">Sign in to follow your child's progress</p>
        </div>

        <form onSubmit={submit} className="space-y-3 bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          {err && <div className="text-xs text-rose-600 bg-rose-50 dark:bg-rose-900/20 rounded-lg px-3 py-2">{err}</div>}
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Phone</span>
            <div className="relative mt-1">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="07xx xxx xxx"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Password</span>
            <div className="relative mt-1">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-sm outline-none focus:ring-2 focus:ring-indigo-500" />
            </div>
          </label>
          <button disabled={busy} className="w-full py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60">
            {busy && <Loader className="w-4 h-4 animate-spin" />} Sign in
          </button>
          <div className="flex items-center justify-between text-xs pt-1">
            <Link href="/portal/register" className="text-indigo-600 hover:underline">Create account</Link>
            <Link href="/portal/reset" className="text-slate-400 hover:text-slate-600">Forgot password?</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
