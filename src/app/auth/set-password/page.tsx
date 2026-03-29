'use client';
/**
 * /auth/set-password — Forced first-login password change
 * Shown when must_change_password = TRUE (e.g., account created by admin)
 */
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Eye, EyeOff, ShieldCheck, CheckCircle2 } from 'lucide-react';

const REQUIREMENTS = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a number',     test: (p: string) => /\d/.test(p) },
  { label: 'Contains a letter',     test: (p: string) => /[a-zA-Z]/.test(p) },
];

export default function SetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword]   = useState('');
  const [confirm,     setConfirm]       = useState('');
  const [showNew,     setShowNew]       = useState(false);
  const [showConfirm, setShowConfirm]   = useState(false);
  const [loading,     setLoading]       = useState(false);
  const [error,       setError]         = useState<string | null>(null);
  const [done,        setDone]          = useState(false);

  const allMet    = REQUIREMENTS.every(r => r.test(newPassword));
  const matches   = newPassword && newPassword === confirm;
  const canSubmit = allMet && matches && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      const res  = await fetch('/api/auth/change-password', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_password: newPassword, confirm_password: confirm }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to update password');
      setDone(true);
      // Redirect to dashboard after short delay
      setTimeout(() => router.replace('/dashboard'), 2000);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-900 dark:to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl bg-white dark:bg-slate-900 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="px-8 pt-8 pb-6 text-center">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center mb-4">
              <ShieldCheck className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            </div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-white">Set your password</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              Your account requires a new password before you can continue.
            </p>
          </div>

          <div className="px-8 pb-8">
            {done ? (
              <div className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-12 h-12 text-emerald-500" />
                <p className="font-semibold text-slate-800 dark:text-white">Password updated!</p>
                <p className="text-sm text-slate-500">Redirecting to dashboard…</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm">{error}</div>
                )}

                {/* New password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    New password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showNew ? 'text' : 'password'}
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-10 pr-10 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button type="button" onClick={() => setShowNew(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Requirements */}
                  {newPassword && (
                    <ul className="mt-2 space-y-1">
                      {REQUIREMENTS.map(r => (
                        <li key={r.label} className={`flex items-center gap-1.5 text-xs transition-colors ${r.test(newPassword) ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}`}>
                          <CheckCircle2 className={`w-3.5 h-3.5 ${r.test(newPassword) ? 'opacity-100' : 'opacity-30'}`} />
                          {r.label}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Confirm password */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Confirm password
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showConfirm ? 'text' : 'password'}
                      value={confirm}
                      onChange={e => setConfirm(e.target.value)}
                      required
                      className={`w-full pl-10 pr-10 py-2.5 text-sm border rounded-lg bg-white dark:bg-slate-800 text-slate-800 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                        confirm && !matches
                          ? 'border-red-400 dark:border-red-500'
                          : 'border-slate-200 dark:border-slate-700'
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirm && !matches && (
                    <p className="mt-1 text-xs text-red-500">Passwords do not match</p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full py-2.5 text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                >
                  {loading ? 'Saving…' : 'Set password & continue'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
