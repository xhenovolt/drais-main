'use client';

import React, { useState } from 'react';
import { KeyRound, Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'react-hot-toast';

export default function DatabaseSettingsSecurityPage() {
  const [passkey, setPasskey] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);

  async function resetPasskey() {
    if (passkey !== confirm) { toast.error('Passkeys do not match'); return; }
    if (passkey.length < 12) { toast.error('Passkey must be at least 12 characters'); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/control-center/database-settings-passkey', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ passkey }),
      });
      const data = await response.json();
      if (!response.ok) { toast.error(data.error || 'Could not reset passkey'); return; }
      setPasskey(''); setConfirm(''); toast.success('Database settings passkey reset');
    } finally { setSaving(false); }
  }

  return (
    <div className="max-w-2xl space-y-5">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-amber-500/15 p-2"><KeyRound className="h-6 w-6 text-amber-300" /></div>
        <div><h1 className="text-xl font-semibold text-slate-100">Database Settings Access</h1><p className="mt-1 text-sm text-slate-400">Rotate the passkey required before any school super-admin can view or change database credentials.</p></div>
      </div>
      <div className="rounded-xl border border-amber-800/60 bg-amber-950/20 p-4 text-sm text-amber-200">
        <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><p>The initial passkey is configured on first use. Resetting it invalidates the previous passkey immediately. The new passkey is never displayed or logged.</p></div>
      </div>
      <div className="rounded-xl border border-slate-800 bg-slate-900 p-5 space-y-4">
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-400">New passkey</span><input type="password" value={passkey} onChange={(e) => setPasskey(e.target.value)} autoComplete="new-password" className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500" /></label>
        <label className="block"><span className="mb-1 block text-xs font-medium text-slate-400">Confirm new passkey</span><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" onKeyDown={(e) => e.key === 'Enter' && resetPasskey()} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none focus:border-indigo-500" /></label>
        <button onClick={resetPasskey} disabled={saving || !passkey || !confirm} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Reset database settings passkey</button>
      </div>
    </div>
  );
}
