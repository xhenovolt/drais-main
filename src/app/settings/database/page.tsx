'use client';

/**
 * Database settings — change online (TiDB) / local (MySQL) credentials from the
 * UI without source access. Super-admin only. Test before saving; saving applies
 * live (resets pools) and persists to the desktop config file.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Database, Cloud, HardDrive, Loader2, CheckCircle, XCircle, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';

const ONLINE = [
  { k: 'TIDB_HOST', label: 'Host', ph: 'gateway01...tidbcloud.com' },
  { k: 'TIDB_PORT', label: 'Port', ph: '4000' },
  { k: 'TIDB_USER', label: 'User', ph: 'xxxxx.root' },
  { k: 'TIDB_PASSWORD', label: 'Password', secret: true },
  { k: 'TIDB_DB', label: 'Database', ph: 'drais' },
];
const LOCAL = [
  { k: 'LOCAL_MYSQL_HOST', label: 'Host', ph: '127.0.0.1' },
  { k: 'LOCAL_MYSQL_PORT', label: 'Port', ph: '3306' },
  { k: 'LOCAL_MYSQL_USER', label: 'User', ph: 'root' },
  { k: 'LOCAL_MYSQL_PASSWORD', label: 'Password', secret: true },
  { k: 'LOCAL_MYSQL_DATABASE', label: 'Database', ph: 'drais' },
];

export default function DatabaseSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [vals, setVals] = useState<Record<string, string>>({});
  const [setFlags, setSetFlags] = useState<Record<string, boolean>>({});
  const [allowLocal, setAllowLocal] = useState(false);
  const [mode, setMode] = useState('online');
  const [configFile, setConfigFile] = useState('');
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/db-config', { cache: 'no-store' });
      if (r.status === 403) { setForbidden(true); setLoading(false); return; }
      const j = await r.json();
      const v: Record<string, string> = {}; const sf: Record<string, boolean> = {};
      for (const [k, f] of Object.entries(j.fields || {})) {
        const ff = f as any;
        v[k] = ff.secret ? '' : (ff.value || ''); // never prefill secrets
        sf[k] = ff.set;
      }
      setVals(v); setSetFlags(sf); setAllowLocal(!!j.allowLocal); setMode(j.mode || 'online'); setConfigFile(j.configFile || '');
      setLoading(false);
    })();
  }, []);

  const set = (k: string, val: string) => setVals((p) => ({ ...p, [k]: val }));

  const test = useCallback(async (m: 'online' | 'local', fields: any[]) => {
    setTesting(m); setTestResult((p) => ({ ...p, [m]: null }));
    try {
      const body: any = { mode: m };
      for (const f of fields) if (vals[f.k] !== '') body[f.k] = vals[f.k];
      const r = await fetch('/api/admin/db-config/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      setTestResult((p) => ({ ...p, [m]: j }));
    } finally { setTesting(null); }
  }, [vals]);

  const save = useCallback(async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = { DRAIS_ALLOW_LOCAL: allowLocal ? 'true' : 'false', DRAIS_DB_MODE: mode };
      // Send non-secrets always; secrets only if typed (blank keeps existing).
      for (const f of [...ONLINE, ...LOCAL]) {
        if (f.secret) { if (vals[f.k]) body[f.k] = vals[f.k]; }
        else if (vals[f.k] !== undefined) body[f.k] = vals[f.k];
      }
      const r = await fetch('/api/admin/db-config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!r.ok) { toast.error(j.error || 'Save failed'); return; }
      toast.success('Database settings saved & applied');
    } finally { setSaving(false); }
  }, [vals, allowLocal, mode]);

  if (loading) return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="w-6 h-6 animate-spin text-indigo-600" /></div>;
  if (forbidden) return <div className="max-w-3xl mx-auto p-6 text-sm text-red-600">Database settings are restricted to super-admins.</div>;

  const Card = ({ title, icon, fields, m }: any) => {
    const tr = testResult[m];
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900 dark:text-white flex items-center gap-2">{icon}{title}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fields.map((f: any) => (
            <div key={f.k} className={f.k.includes('HOST') ? 'sm:col-span-2' : ''}>
              <label className="block text-xs font-medium text-gray-500 mb-1">{f.label}{f.secret && setFlags[f.k] ? ' (set — blank keeps current)' : ''}</label>
              <input type={f.secret ? 'password' : 'text'} value={vals[f.k] ?? ''} placeholder={f.secret ? (setFlags[f.k] ? '••••••••' : '') : f.ph}
                onChange={(e) => set(f.k, e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm" />
            </div>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => test(m, fields)} disabled={testing === m} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-sm font-medium disabled:opacity-50">
            {testing === m ? <Loader2 className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />} Test connection
          </button>
          {tr && (tr.ok
            ? <span className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Connected to {tr.database}</span>
            : <span className="text-xs text-red-600 flex items-center gap-1"><XCircle className="w-4 h-4" /> {tr.error}</span>)}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-5">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><Database className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div><h1 className="text-xl font-bold text-gray-900 dark:text-white">Database Settings</h1><p className="text-sm text-gray-500 dark:text-gray-400">Change the online/local database credentials. Current mode: <strong>{mode}</strong>.</p></div>
      </div>

      <Card title="Online — TiDB Cloud" icon={<Cloud className="w-4 h-4 text-indigo-500" />} fields={ONLINE} m="online" />
      <Card title="Local — MySQL (XAMPP)" icon={<HardDrive className="w-4 h-4 text-amber-500" />} fields={LOCAL} m="local" />

      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={allowLocal} onChange={(e) => setAllowLocal(e.target.checked)} /> Allow switching to Local mode on this machine</label>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-gray-500">Default mode</span>
          <select value={mode} onChange={(e) => setMode(e.target.value)} className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm">
            <option value="online">Online Cloud</option>
            <option value="local" disabled={!allowLocal}>Local Server</option>
          </select>
        </div>
        {configFile && <p className="text-[11px] text-gray-400">Saved to: <code>{configFile}</code></p>}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-400 max-w-md">Saving applies immediately (no restart) and persists for next launch. Test each connection before saving.</p>
        <button onClick={save} disabled={saving} className="flex items-center gap-2 px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save & apply
        </button>
      </div>
    </div>
  );
}
