'use client';

/**
 * Buy SMS — a school administrator pays by mobile money (MTN / Airtel) and the SMS are added to the school's balance
 * as soon as the payment is confirmed. The price per SMS is set by Xhenvolt for each school.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useSWR, { mutate as globalMutate } from 'swr';
import { CheckCircle2, CircleAlert, Loader2, MessageSquare, Smartphone } from 'lucide-react';
import { quoteTopup } from '@/lib/sms/topup-math';
import { useI18n } from '@/components/i18n/I18nProvider';
import { isEnglishText } from '@/lib/toast';

/** A page message: which one (worded at render, so a language switch applies) or the server's own text. */
type Msg = { ok: boolean; key?: string; vars?: Record<string, string | number>; raw?: string | null };

const fetcher = (u: string) => fetch(u).then((r) => r.json());
const QUICK = [10_000, 20_000, 50_000, 100_000, 300_000];
const fmt = (n: number) => n.toLocaleString('en-US');
const STATUS_TEXT: Record<string, string> = {
  credited: 'Added', processing: 'Waiting for approval', initiated: 'Starting', failed: 'Not completed',
  expired: 'Not approved in time', review: 'Being checked by Xhenvolt', paid: 'Adding…',
};

interface Payload {
  success?: boolean; error?: string; configured: boolean;
  price: { perSmsUgx: number; enabled: boolean }; limits: { minUgx: number; maxUgx: number };
  balance: { quota: number | null; used: number; remaining: number | null };
  topups: Array<{ id: number; amountUgx: number; sms: number; status: string; phone: string | null; reason: string | null; createdAt: string; creditedAt: string | null }>;
}

export default function BuySmsPage() {
  const { data, mutate, error } = useSWR<Payload>('/api/sms/topups', fetcher, { refreshInterval: 30_000 });
  const { t, rich, lang, formatNumber, digits } = useI18n();
  const n = (v: number) => (lang === 'ar' ? formatNumber(v) : fmt(v));
  const ugx = (v: number) => (lang === 'ar' ? t('commPages.buy.ugx', { n: formatNumber(v) }) : `UGX ${fmt(v)}`);
  /** Server/library English in Arabic: the page's own message instead. */
  const say = (m: Msg) => (m.raw && !(lang === 'ar' && isEnglishText(m.raw)) ? m.raw : m.key ? t(`commPages.buy.${m.key}`, m.vars ?? {}) : '');
  /** quoteTopup()'s sentences, matched exactly. */
  const quoteError = (e: string) => {
    if (lang !== 'ar') return e;
    let m: RegExpExecArray | null;
    if (e === 'Invalid amount or price') return t('commPages.buy.q.invalid');
    if ((m = /^The minimum top-up is UGX ([\d,]+)$/.exec(e))) return t('commPages.buy.q.min', { n: formatNumber(Number(m[1].replace(/,/g, ''))) });
    if ((m = /^The maximum single top-up is UGX ([\d,]+)$/.exec(e))) return t('commPages.buy.q.max', { n: formatNumber(Number(m[1].replace(/,/g, ''))) });
    if ((m = /^That is less than one SMS at UGX ([\d.]+) each$/.exec(e))) return t('commPages.buy.q.lessThanOne', { n: formatNumber(Number(m[1])) });
    return e;
  };
  const [amount, setAmount] = useState('50000');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const [waiting, setWaiting] = useState<{ id: number; sms: number; amountUgx: number } | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => { try { const p = localStorage.getItem('drais-topup-phone'); if (p) setPhone(p); } catch { /* optional */ } }, []);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const price = data?.price.perSmsUgx ?? 0;
  const quote = price > 0 ? quoteTopup(Number(amount.replace(/[^\d]/g, '')), price) : null;

  const poll = useCallback((id: number, started: number) => {
    const tick = async () => {
      try {
        const r = await fetch(`/api/sms/topups/${id}`);
        const j = await r.json();
        if (j.status === 'credited') {
          setWaiting(null); setMsg({ ok: true, key: 'm.received', vars: { sms: j.sms } });
          await mutate(); globalMutate('/api/sms/quota'); return;
        }
        if (['failed', 'expired', 'review'].includes(j.status)) {
          setWaiting(null);
          setMsg(j.status === 'review' ? { ok: false, key: 'm.review' } : { ok: false, key: 'm.notCompleted', raw: j.reason || null });
          await mutate(); return;
        }
      } catch { /* keep polling */ }
      if (Date.now() - started > 4 * 60_000) {
        setWaiting(null); setMsg({ ok: false, key: 'm.stillWaiting' });
        await mutate(); return;
      }
      timer.current = window.setTimeout(tick, 4000);
    };
    timer.current = window.setTimeout(tick, 3000);
  }, [mutate]);

  const pay = async () => {
    setMsg(null); setBusy(true);
    try {
      const r = await fetch('/api/sms/topups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amount: Number(amount.replace(/[^\d]/g, '')), phone }) });
      const j = await r.json();
      if (!r.ok) { setMsg({ ok: false, key: 'm.couldNotStart', raw: j.error || null }); return; }
      try { localStorage.setItem('drais-topup-phone', phone); } catch { /* optional */ }
      setWaiting({ id: j.id, sms: j.sms, amountUgx: j.amountUgx });
      poll(j.id, Date.now());
    } catch { setMsg({ ok: false, key: 'm.network' }); }
    finally { setBusy(false); }
  };

  const remaining = data?.balance.remaining;

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30"><MessageSquare className="w-6 h-6 text-indigo-600 dark:text-indigo-400" /></div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t('commPages.buy.title', "Buy SMS")}</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">{t('commPages.buy.intro', "Pay with MTN or Airtel Mobile Money. Your SMS are added the moment the payment is confirmed.")}</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{t('commPages.buy.loadError', "Could not load this page. Refresh and try again.")}</p>}
      {data?.error && <p className="text-sm text-red-600">{say({ ok: false, key: 'loadErrorServer', raw: data.error })}</p>}

      {data?.success && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('commPages.buy.smsLeft', "SMS left")}</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{remaining == null ? t('commPages.buy.noLimit', "No limit set") : n(remaining)}</div>
            </div>
            <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400">{t('commPages.buy.pricePer', "Price per SMS")}</div>
              <div className="text-2xl font-bold text-gray-900 dark:text-white">{ugx(price)}</div>
            </div>
          </div>

          {!data.configured && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm p-3">
              {t('commPages.buy.notConfigured', "Online payment is not switched on yet. Please contact Xhenvolt to top up your SMS.")}
            </div>
          )}
          {data.configured && !data.price.enabled && (
            <div className="rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200 text-sm p-3">
              {t('commPages.buy.disabled', "Online buying is switched off for your school. Please contact Xhenvolt to top up your SMS.")}
            </div>
          )}

          {data.configured && data.price.enabled && (
            <section className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 space-y-4" aria-label={t('commPages.buy.title', "Buy SMS")}>
              <div>
                <label htmlFor="amount" className="text-sm font-medium text-gray-800 dark:text-gray-200">{t('commPages.buy.howMuch', "How much do you want to pay? (UGX)")}</label>
                <input id="amount" inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} disabled={busy || !!waiting}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-lg" />
                <div className="flex flex-wrap gap-2 mt-2">
                  {QUICK.map((q) => (
                    <button key={q} type="button" disabled={busy || !!waiting} onClick={() => setAmount(String(q))}
                      className={`px-3 py-1 rounded-full text-sm border ${Number(amount) === q ? 'bg-indigo-600 text-white border-indigo-600' : 'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300'}`}>
                      {n(q)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-lg bg-indigo-50 dark:bg-indigo-900/20 p-3 text-sm" aria-live="polite">
                {quote?.ok
                  ? <>{rich('commPages.buy.quote', { amount: <b>{ugx(quote.amountUgx)}</b>, sms: <b>{lang === 'ar' ? t('commPages.buy.smsCount', { n: formatNumber(quote.units) }) : `${fmt(quote.units)} SMS`}</b>, each: <span className="text-gray-500">{lang === 'ar' ? t('commPages.buy.each', { n: formatNumber(quote.priceUgx) }) : `(UGX ${fmt(quote.priceUgx)} each)`}</span> })}</>
                  : <span className="text-red-600 dark:text-red-400">{quote && !quote.ok ? quoteError(quote.error) : t('commPages.buy.enterAmount', "Enter an amount.")}</span>}
              </div>

              <div>
                <label htmlFor="phone" className="text-sm font-medium text-gray-800 dark:text-gray-200 flex items-center gap-1"><Smartphone className="w-4 h-4" /> {t('commPages.buy.phoneLabel', "Mobile Money number to pay from")}</label>
                <input id="phone" inputMode="tel" placeholder={digits('0772 123 456')} dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={busy || !!waiting}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white" />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('commPages.buy.phoneHelp', "You will get a prompt on this phone. Enter your Mobile Money PIN to approve.")}</p>
              </div>

              <button onClick={pay} disabled={busy || !!waiting || !quote?.ok || !phone.trim()}
                className="w-full sm:w-auto px-6 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
                {busy ? t('commPages.buy.starting', "Starting…") : t('commPages.buy.payBtn', "Pay with Mobile Money")}
              </button>

              {waiting && (
                <div className="flex items-start gap-3 rounded-lg border border-indigo-200 dark:border-indigo-800 p-3 text-sm text-gray-800 dark:text-gray-200" role="status">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600 shrink-0" />
                  <div>{rich('commPages.buy.approve', { amount: <b>{ugx(waiting.amountUgx)}</b> })}</div>
                </div>
              )}
            </section>
          )}

          {msg && (
            <div className={`flex items-start gap-2 rounded-lg p-3 text-sm ${msg.ok ? 'bg-green-50 dark:bg-green-900/20 text-green-800 dark:text-green-200' : 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200'}`} role="status">
              {msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0" /> : <CircleAlert className="w-5 h-5 shrink-0" />}<span>{say(msg)}</span>
            </div>
          )}

          <section>
            <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('commPages.buy.purchases', "Your purchases")}</h2>
            {data.topups.length === 0 ? <p className="text-sm text-gray-500">{t('commPages.buy.noPurchases', "No purchases yet.")}</p> : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
                <table className="w-full text-sm">
                  <thead className="text-xs text-gray-500 uppercase"><tr><th className="px-3 py-2 text-start">{t('commPages.buy.colDate', "Date")}</th><th className="px-3 py-2 text-end">{t('commPages.buy.colPaid', "Paid (UGX)")}</th><th className="px-3 py-2 text-end">{t('commPages.buy.colSms', "SMS")}</th><th className="px-3 py-2 text-start">{t('commPages.buy.colStatus', "Status")}</th></tr></thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {data.topups.map((tp) => (
                      <tr key={tp.id}>
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{lang === 'ar' ? new Date(tp.createdAt).toLocaleString('ar-EG') : new Date(tp.createdAt).toLocaleString()}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{n(tp.amountUgx)}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{n(tp.sms)}</td>
                        <td className="px-3 py-2"><span className={tp.status === 'credited' ? 'text-green-600' : tp.status === 'processing' || tp.status === 'initiated' || tp.status === 'paid' ? 'text-amber-600' : 'text-gray-500'}>{t(`commPages.buy.st.${tp.status}`, STATUS_TEXT[tp.status] ?? tp.status)}</span>{tp.reason && tp.status !== 'credited' && !(lang === 'ar' && isEnglishText(tp.reason)) && <div className="text-xs text-gray-500">{tp.reason}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
