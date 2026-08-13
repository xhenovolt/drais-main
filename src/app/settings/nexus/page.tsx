'use client';

/**
 * Nexus — ask questions about your school's records.
 *
 * Lives under Settings rather than in the main navigation: it is a tool for
 * heads, bursars and administrators, and putting it in front of every teacher
 * would be noise for them and cost for the school on every idle question.
 *
 * The provider is configurable — key, base URL and model — so any
 * OpenAI-compatible service can back it. The key is stored server-side and is
 * never returned to this page; only a masked hint comes back, so the screen
 * cannot be used to read a secret out of the system.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, Send, Loader2, Settings2, Check, AlertTriangle, Database } from 'lucide-react';

interface Turn {
  role: 'you' | 'nexus';
  text: string;
  used?: Array<{ tool: string; args: unknown }>;
  error?: boolean;
}

const SUGGESTIONS = [
  'How many learners and staff do we have?',
  'Who owes the most in fees?',
  'How many were absent today?',
  'List our classes and how many learners are in each',
  'How did PRIMARY SIX do this term?',
];

export default function NexusPage() {
  const [cfg, setCfg] = useState<any>(null);
  const [name, setName] = useState('Nexus');
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [showCfg, setShowCfg] = useState(false);

  const [form, setForm] = useState({ enabled: false, baseUrl: '', model: '', apiKey: '' });
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const loadCfg = useCallback(async () => {
    try {
      const r = await fetch('/api/nexus/config', { cache: 'no-store' });
      const j = await r.json();
      if (j?.config) {
        setCfg(j.config);
        setName(j.name ?? 'Nexus');
        setForm({ enabled: !!j.config.enabled, baseUrl: j.config.baseUrl ?? '', model: j.config.model ?? '', apiKey: '' });
        if (!j.config.enabled || !j.config.hasKey) setShowCfg(true);
      }
    } catch { /* leave unconfigured */ }
  }, []);
  useEffect(() => { loadCfg(); }, [loadCfg]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [turns, busy]);

  const save = async () => {
    setSaving(true); setSavedMsg(null);
    try {
      const payload: any = { enabled: form.enabled, baseUrl: form.baseUrl, model: form.model };
      // Only send the key when one was typed — an empty field must mean
      // "leave it alone", never "erase it".
      if (form.apiKey.trim()) payload.apiKey = form.apiKey.trim();
      const r = await fetch('/api/nexus/config', {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (!r.ok) setSavedMsg(j?.error ?? 'Could not save.');
      else { setCfg(j.config); setForm((f) => ({ ...f, apiKey: '' })); setSavedMsg('Saved.'); }
    } catch { setSavedMsg('Could not reach the server.'); }
    finally { setSaving(false); }
  };

  const ask = async (question: string) => {
    const text = question.trim();
    if (!text || busy) return;
    setTurns((t) => [...t, { role: 'you', text }]);
    setQ(''); setBusy(true);
    try {
      const r = await fetch('/api/nexus/ask', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ question: text }),
      });
      const j = await r.json();
      setTurns((t) => [...t, r.ok
        ? { role: 'nexus', text: j.answer ?? '(no answer)', used: j.used }
        : { role: 'nexus', text: j?.error ?? 'Something went wrong.', error: true }]);
    } catch {
      setTurns((t) => [...t, { role: 'nexus', text: 'Could not reach the server.', error: true }]);
    } finally { setBusy(false); }
  };

  const ready = cfg?.enabled && cfg?.hasKey;
  const input = 'w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-indigo-500';

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-500" /> {name}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Ask questions about your school&apos;s records — attendance, fees, learners, results.
          </p>
        </div>
        <button
          onClick={() => setShowCfg((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <Settings2 className="w-3.5 h-3.5" /> Setup
        </button>
      </div>

      {showCfg && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Provider</p>
          <p className="text-[11px] text-slate-500">
            Any OpenAI-compatible service works — change the address and model rather than the code.
            Super administrators only.
          </p>

          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
            <input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />
            Enable {name}
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Address</label>
              <input value={form.baseUrl} onChange={(e) => setForm({ ...form, baseUrl: e.target.value })}
                placeholder="https://api.x.ai/v1" className={input} />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">Model</label>
              <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })}
                placeholder="grok-3-mini" className={input} />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
              Key {cfg?.hasKey && (
                <span className="font-normal text-slate-400">
                  · currently {cfg.keyHint}
                  {/* Naming the source matters: a key from the environment
                      cannot be changed here, and without saying so an operator
                      would type a new one, save, and wonder why nothing moved. */}
                  {cfg.keySource === 'environment' ? ' (from server environment)' : ' (saved here)'}
                </span>
              )}
            </label>
            <input type="password" value={form.apiKey} onChange={(e) => setForm({ ...form, apiKey: e.target.value })}
              placeholder={cfg?.hasKey ? 'Leave blank to keep the current key' : 'Paste the provider key'} className={input} />
            <p className="text-[10px] text-slate-400 mt-1">
              Stored on the server and never shown again. Leave blank to keep the existing key.
              {cfg?.keySource === 'environment' && ' A key saved here overrides the one in the server environment.'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving}
              className="px-3 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 flex items-center gap-1.5">
              {saving && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save
            </button>
            {savedMsg && (
              <span className="text-xs text-slate-500 flex items-center gap-1">
                {savedMsg === 'Saved.' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                {savedMsg}
              </span>
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <p className="text-[11px] text-slate-500">
              <strong>What leaves your servers.</strong> Your question, the figures looked up to answer it, and the
              school name. Look-ups can include learner names and balances — a question like &quot;who owes the
              most&quot; is not answerable without them. Contacts, guardians, passwords and payment details are never
              sent. {name} can only read {`this`} school&apos;s records, and only through a fixed set of look-ups; it
              cannot browse the database or change anything.
            </p>
          </div>
        </div>
      )}

      {!ready && !showCfg && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <p className="text-sm text-amber-800 dark:text-amber-200">{name} is not set up yet.</p>
          <button onClick={() => setShowCfg(true)} className="text-xs font-semibold text-amber-900 dark:text-amber-100 underline mt-1">
            Add a provider key
          </button>
        </div>
      )}

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex flex-col min-h-[24rem]">
        <div className="flex-1 p-4 space-y-3 overflow-y-auto max-h-[26rem]">
          {turns.length === 0 && (
            <div className="text-center py-6 space-y-3">
              <p className="text-sm text-slate-500">Try one of these:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} disabled={!ready || busy}
                    className="px-2.5 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {turns.map((t, i) => (
            <div key={i} className={t.role === 'you' ? 'text-right' : ''}>
              <div className={`inline-block max-w-[85%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap text-left ${
                t.role === 'you'
                  ? 'bg-indigo-600 text-white'
                  : t.error
                    ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-100'
              }`}>
                {t.text}
              </div>
              {/* Which look-ups produced the answer. Shown so a figure can be
                  checked against the screen it came from, rather than trusted. */}
              {t.used && t.used.length > 0 && (
                <p className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                  <Database className="w-3 h-3" /> {t.used.map((u) => u.tool).join(', ')}
                </p>
              )}
            </div>
          ))}

          {busy && (
            <p className="text-xs text-slate-400 flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Looking it up…
            </p>
          )}
          <div ref={endRef} />
        </div>

        <div className="border-t border-slate-100 dark:border-slate-800 p-3 flex items-center gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(q); } }}
            placeholder={ready ? `Ask ${name} about your school…` : `${name} is not set up yet`}
            disabled={!ready || busy}
            className={`${input} disabled:opacity-50`}
          />
          <button onClick={() => ask(q)} disabled={!ready || busy || !q.trim()}
            className="px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-40">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>

      <p className="text-[10px] text-slate-400">
        {name} reads records; it never changes them. Figures come from the same queries the rest of DRAIS uses —
        check anything surprising against the screen it came from.
      </p>
    </div>
  );
}
