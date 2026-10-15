'use client';

/**
 * Control Center → Compose SMS.
 * Write a message, paste numbers, send through the active provider (the one
 * school messages use). Super admins set the test and compose limits here.
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Send, Loader2, CheckCircle2, XCircle, Settings2, Radio, History, AlertTriangle } from 'lucide-react';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());
const card = 'bg-slate-900 border border-slate-800 rounded-xl';
const input = 'px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm outline-none focus:ring-2 focus:ring-indigo-500';
const btn = 'inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50';

/** Mirrors the server's parser (lib/control/sms-limits) so the counts match what will be sent. */
function parse(text: string) {
  const valid: string[] = []; const invalid: string[] = [];
  for (const part of text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const d = part.replace(/[^\d+]/g, '').replace(/^\+/, '');
    const n = /^0\d{9}$/.test(d) ? `256${d.slice(1)}` : /^256\d{9}$/.test(d) ? d : /^7\d{8}$/.test(d) ? `256${d}` : null;
    if (n) { if (!valid.includes(n)) valid.push(n); } else invalid.push(part);
  }
  return { valid, invalid };
}
/** SMS parts: GSM-7 160/153, Unicode (e.g. Arabic) 70/67. */
function parts(msg: string) {
  if (!msg) return { parts: 0, perPart: 160 };
  const unicode = /[^\x00-\x7F£¥èéùìòÇØøÅå€]/.test(msg);
  const single = unicode ? 70 : 160; const multi = unicode ? 67 : 153;
  return { parts: msg.length <= single ? 1 : Math.ceil(msg.length / multi), perPart: msg.length <= single ? single : multi, unicode };
}

export default function ComposeSmsPage() {
  const { data, mutate, isLoading } = useSWR<any>('/api/control-center/sms/compose', fetcher);
  const [numbers, setNumbers] = useState('');
  const [message, setMessage] = useState('');
  const [sender, setSender] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const { valid, invalid } = useMemo(() => parse(numbers), [numbers]);
  const p = parts(message);
  const limits = data?.limits;
  const provider = data?.provider;
  const tooMany = limits && valid.length > limits.composeMaxRecipients;
  const overDaily = data?.remainingToday != null && valid.length > data.remainingToday;
  const tooLong = limits && message.length > limits.maxMessageLength;

  const sendNow = async () => {
    if (!confirm(`Send this message to ${valid.length} number${valid.length === 1 ? '' : 's'} through ${provider?.name || 'the active provider'}?`)) return;
    setBusy(true); setErr(null); setOut(null);
    try {
      const r = await fetch('/api/control-center/sms/compose', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ numbers, message, sender_id: sender || undefined }) });
      const j = await r.json();
      if (!r.ok && !j.results) setErr(j.error || 'Failed'); else setOut(j);
      mutate();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };

  if (isLoading) return <div className="py-20 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-400" /></div>;
  if (data?.error) return <div className={`${card} p-6 text-sm text-rose-300`}>{data.error}</div>;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-slate-100">Compose SMS</h1>
        <p className="text-sm text-slate-400 mt-1">Send your own message to any numbers — announcements, follow-ups, or checking that delivery works.</p>
      </div>

      <div className={`${card} p-3 flex flex-wrap items-center gap-3 text-sm`}>
        <Radio className={`w-4 h-4 ${provider?.status === 'connected' ? 'text-emerald-400' : 'text-amber-400'}`} />
        {provider
          ? <span className="text-slate-300">Sends through <b className="text-slate-100">{provider.name}</b> <span className="text-slate-500">({provider.status || 'unknown status'})</span></span>
          : <span className="text-amber-300">No active SMS provider — activate one in SMS Providers first.</span>}
        {provider?.status === 'authentication_failed' && <span className="text-xs text-amber-300 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> The provider is refusing DRAIS’s key right now; sends will fail until it accepts it again.</span>}
        <span className="ml-auto text-xs text-slate-500">
          {data?.remainingToday == null ? 'No daily limit for you' : `${data.remainingToday} of ${limits?.composePerDay} left today`}
        </span>
      </div>

      {data?.can?.send && (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className={`${card} p-4 space-y-2`}>
            <label className="text-xs font-semibold text-slate-400">Recipients</label>
            <textarea value={numbers} onChange={(e) => setNumbers(e.target.value)} rows={8} placeholder={'0772 123456, 0701 234567\nor one number per line'} className={`${input} w-full font-mono`} />
            <div className="flex flex-wrap gap-2 text-xs">
              <span className="text-emerald-300">{valid.length} valid</span>
              {invalid.length > 0 && <span className="text-rose-300">{invalid.length} not recognised: {invalid.slice(0, 4).join(', ')}{invalid.length > 4 ? '…' : ''}</span>}
              {tooMany && <span className="text-rose-300">Max {limits.composeMaxRecipients} per send</span>}
              {overDaily && <span className="text-rose-300">Over today’s limit</span>}
            </div>
          </div>
          <div className={`${card} p-4 space-y-2`}>
            <label className="text-xs font-semibold text-slate-400">Message</label>
            <textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={6} placeholder="Type your message" className={`${input} w-full`} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500">
              <span className={tooLong ? 'text-rose-300' : ''}>{message.length}{limits ? ` / ${limits.maxMessageLength}` : ''} characters · {p.parts} SMS part{p.parts === 1 ? '' : 's'} each{p.unicode ? ' (Unicode — 70 per part)' : ''}</span>
              <span>≈ {p.parts * valid.length} SMS in total</span>
            </div>
            <input value={sender} onChange={(e) => setSender(e.target.value)} maxLength={11} placeholder="Sender ID (optional — provider default if empty)" className={`${input} w-full`} />
            <button onClick={sendNow} disabled={busy || !provider || !valid.length || !message.trim() || tooMany || overDaily || tooLong}
              className={`${btn} w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm`}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {busy ? `Sending to ${valid.length}…` : `Send to ${valid.length || 0}`}
            </button>
            {err && <p className="text-xs text-rose-300">{err}</p>}
          </div>
        </div>
      )}

      {out && (
        <div className={`${card} p-4`}>
          <div className="text-sm font-semibold text-slate-100">
            <span className="text-emerald-300">{out.sent} sent</span>{out.failed > 0 && <> · <span className="text-rose-300">{out.failed} failed</span></>} via {out.provider?.name}
          </div>
          <ul className="mt-2 grid sm:grid-cols-2 gap-1 max-h-64 overflow-y-auto">
            {(out.results || []).map((r: any) => (
              <li key={r.phone} className="text-xs flex items-start gap-1.5 rounded bg-slate-950/50 px-2 py-1">
                {r.ok ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-px" /> : <XCircle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-px" />}
                <span className="font-mono text-slate-300">{r.phone}</span>
                {!r.ok && <span className="text-rose-300 truncate">{r.error}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {data?.can?.limits && limits && <LimitsCard limits={limits} onSaved={() => mutate()} />}

      <div className={`${card} p-4`}>
        <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><History className="w-4 h-4 text-indigo-400" /> Recent sends</h2>
        <ul className="mt-2 space-y-1">
          {(data?.recent || []).map((r: any) => (
            <li key={r.id} className="text-xs flex flex-wrap justify-between gap-2 rounded-lg bg-slate-950/50 px-2.5 py-1.5">
              <span className="text-slate-300 truncate max-w-[60%]">“{r.preview}”</span>
              <span className="text-slate-500">{r.sent}/{r.recipients} sent · {r.by} · {new Date(r.at).toLocaleString()}</span>
            </li>
          ))}
          {!data?.recent?.length && <li className="text-xs text-slate-500">Nothing sent yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function LimitsCard({ limits, onSaved }: { limits: any; onSaved: () => void }) {
  const [v, setV] = useState(limits);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: string, label: string, hint: string) => (
    <label className="block">
      <span className="text-xs text-slate-300">{label}</span>
      <input type="number" min={0} value={v[k]} onChange={(e) => setV({ ...v, [k]: Number(e.target.value) })} className={`${input} w-full mt-1`} />
      <span className="text-[11px] text-slate-500">{hint}</span>
    </label>
  );
  const save = async () => {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch('/api/control-center/sms/compose', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ limits: v }) });
      const j = await r.json(); setMsg(r.ok ? 'Saved — applies immediately.' : j.error || 'Failed'); if (r.ok) { setV(j.limits); onSaved(); }
    } finally { setBusy(false); }
  };
  return (
    <div className={`${card} p-4 space-y-3`}>
      <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5"><Settings2 className="w-4 h-4 text-amber-400" /> Limits <span className="text-[10px] font-normal text-slate-500">(super admins only)</span></h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {num('testPerWindow', 'Test SMS per operator', '0 = unlimited. Counts SMS-page and provider tests.')}
        {num('testWindowMinutes', '…within this many minutes', 'e.g. 10 tests per 10 minutes')}
        {num('composeMaxRecipients', 'Recipients per send', 'How many numbers in one Compose send')}
        {num('composePerDay', 'Compose messages per operator per day', '0 = unlimited')}
        {num('maxMessageLength', 'Longest message (characters)', '160 = one SMS part; longer is sent in parts')}
        <label className="flex items-start gap-2 mt-5">
          <input type="checkbox" checked={!!v.superAdminUnlimited} onChange={(e) => setV({ ...v, superAdminUnlimited: e.target.checked })} className="accent-indigo-500 mt-0.5" />
          <span className="text-xs text-slate-300">Super admins are not limited<br /><span className="text-[11px] text-slate-500">The limits then apply to other operators only.</span></span>
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={save} disabled={busy} className={`${btn} bg-indigo-600 hover:bg-indigo-500 text-white`}>{busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />} Save limits</button>
        {msg && <span className="text-xs text-slate-400">{msg}</span>}
      </div>
    </div>
  );
}
