'use client';

/**
 * /control entry — first-time setup (zero users) or sign-in. On success →
 * /control/dashboard. This screen belongs to the Xhenvolt security domain;
 * school credentials do not work here by design.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Shield, Loader2 } from 'lucide-react';

export default function ControlEntry() {
  const router = useRouter();
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading');
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm_password: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/control-center/auth', { cache: 'no-store' }).then(r => r.json()).then(j => {
      if (j.authenticated) router.replace('/control/dashboard');
      else setMode(j.setup_required ? 'setup' : 'login');
    }).catch(() => setMode('login'));
  }, [router]);

  const submit = useCallback(async () => {
    setBusy(true); setError(null);
    try {
      const r = await fetch('/api/control-center/auth', {
        method: mode === 'setup' ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(form),
      });
      const j = await r.json();
      if (!r.ok) { setError(j.error || 'Failed'); return; }
      router.replace('/control/dashboard');
    } finally { setBusy(false); }
  }, [mode, form, router]);

  if (mode === 'loading') {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-400" /></div>;
  }

  const input = 'w-full px-3 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none';
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
        <div className="text-center space-y-1">
          <Shield className="w-9 h-9 text-indigo-400 mx-auto" />
          <h1 className="text-lg font-bold text-slate-100">
            {mode === 'setup' ? 'Welcome to DRAIS Control Center' : 'DRAIS Control Center'}
          </h1>
          <p className="text-xs text-slate-400">
            {mode === 'setup'
              ? 'Create your first Xhenvolt Super Admin account'
              : 'Xhenvolt internal console — school credentials do not work here'}
          </p>
        </div>

        {mode === 'setup' && (
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" className={input} autoFocus />
        )}
        <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" type="email" className={input} autoFocus={mode === 'login'} />
        <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Password" type="password" className={input}
          onKeyDown={(e) => e.key === 'Enter' && mode === 'login' && submit()} />
        {mode === 'setup' && (
          <input value={form.confirm_password} onChange={(e) => setForm({ ...form, confirm_password: e.target.value })} placeholder="Confirm password" type="password" className={input}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        )}

        {error && <p className="text-xs text-rose-400">{error}</p>}

        <button onClick={submit} disabled={busy}
          className="w-full py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2">
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          {mode === 'setup' ? 'Create Super Admin' : 'Sign in'}
        </button>
        {mode === 'setup' && (
          <p className="text-[11px] text-slate-500 text-center">This role becomes XHENVOLT_SUPER_ADMIN. Future operators can only be created from inside the Control Center.</p>
        )}
      </div>
    </div>
  );
}
