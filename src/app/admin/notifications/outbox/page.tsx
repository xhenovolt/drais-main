'use client';

/**
 * SMS Outbox — what DRAIS created, and exactly how far each message got.
 *
 * Statuses are honest: SENT means the provider accepted the message; only a provider delivery report makes it
 * DELIVERED. Click any row to see the full lifecycle and WHY DRAIS sent it (residence, boarding policy, punch,
 * reporting period, rule) — so no one has to ask the founder.
 */
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Inbox, Loader2, RefreshCw, Search, X, ChevronLeft, ChevronRight, Info, SendHorizontal } from 'lucide-react';
import FilterAccordion, { FilterField, filterInputCls, type FilterChip } from '@/components/ui/FilterAccordion';
import { showToast, uiIsArabic, isEnglishText } from '@/lib/toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import Swal from 'sweetalert2';
import { SMS_DELIVERY_EVENT } from '@/components/notifications/LiveScanSmsIndicator';

async function readResponse<T = any>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any = {};
  if (text.trim()) {
    try { payload = JSON.parse(text); }
    catch { payload = { error: text.trim().slice(0, 500) }; }
  }
  if (!response.ok) throw new Error(payload?.error || `Request failed (${response.status})`);
  return payload as T;
}

const fetcher = async (u: string) => readResponse(await fetch(u));

type Status = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'expired';
const STATUSES: Status[] = ['queued', 'sending', 'sent', 'delivered', 'failed', 'expired'];
const STATUS_LABEL: Record<Status, string> = {
  queued: 'Queued', sending: 'Sending', sent: 'Sent to provider', delivered: 'Delivered', failed: 'Failed', expired: 'Expired',
};
const TONE: Record<Status, string> = {
  queued: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  sending: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  sent: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  delivered: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  failed: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  expired: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};
const TYPE_LABEL: Record<string, string> = {
  ARRIVAL_ON_TIME: 'Arrival', LATE_ARRIVAL: 'Late arrival', ABSENT: 'Absence', HALF_DAY: 'Half day',
  EARLY_LEAVE: 'Early leave', NON_SESSION_DAY: 'No school', BOARDING_REPORTED: 'Boarding reported',
};

interface Row {
  id: number; channel: string; recipient_name: string | null; recipient_phone: string; body_preview: string;
  attempts: number; max_attempts: number; last_error: string | null; notification_type: string | null;
  attendance_date: string | null; created_at: string; display_status: Status; policy_name: string | null;
  learner_name: string | null; provider: string | null; provider_message_id: string | null;
  provider_report: ProviderReport | null;
}
interface ProviderReport { state: 'sent' | 'delivered' | 'failed'; reason: string | null; network: string | null; at: string }
interface Payload { rows: Row[]; total: number; page: number; totalPages: number; statusCounts: Record<string, number>; types: { type: string; n: number }[] }

// Arabic shows Arabic-Indic digits (ar-EG); English keeps the browser's own format.
const fmt = (v?: string | null, lang?: string) => (v ? (lang === 'ar' ? new Date(v).toLocaleString('ar-EG') : new Date(v).toLocaleString()) : '—');
const fmtTime = (v?: string | null, lang?: string) => (v ? new Date(v).toLocaleTimeString(lang === 'ar' ? 'ar-EG' : [], { hour: '2-digit', minute: '2-digit' }) : '');
/** Provider/server English: kept in English, replaced by the page's own message in Arabic. */
const serverText = (s: string | null | undefined, fallback: string) => (s && !(uiIsArabic() && isEnglishText(s)) ? s : fallback);

type TFn = (k: string, v?: any, f?: string) => string;
const P = 'commPages.outbox';
/** One stored decision-explanation line (written in English by notification-decision.ts) in the interface language. */
function explainLine(line: string, t: TFn, lang: string): string {
  if (lang !== 'ar') return line;
  let m: RegExpExecArray | null;
  const residence: Record<string, string> = { 'Boarding': 'boarding', 'Day scholar': 'dayScholar', 'Not classified': 'notClassified' };
  if ((m = /^Residence: (.+)$/.exec(line)) && residence[m[1]]) return t(`${P}.ex.residence`, { v: t(`${P}.ex.${residence[m[1]]}`) });
  if ((m = /^Boarding policy: (Reported once|Daily punch)$/.exec(line))) return t(`${P}.ex.boardingPolicy`, { v: t(`${P}.ex.${m[1] === 'Reported once' ? 'reportedOnce' : 'dailyPunch'}`) });
  if ((m = /^Attendance result: (.+)$/.exec(line))) return t(`${P}.ex.result`, { v: t(`${P}.ex.st.${m[1].replace(' ', '_')}`, m[1]) });
  if (/^No message: this result came from a school policy( \(.+\))?, not from a punch\.$/.test(line)) return t(`${P}.ex.policyDerived`);
  if (line === 'No message: "reported to school" SMS is switched off for this school.') return t(`${P}.ex.smsOff`);
  if ((m = /^No message: this learner already reported during (.+)\.$/.exec(line))) return t(`${P}.ex.already`, { period: m[1] === 'the current reporting period' ? t(`${P}.ex.currentPeriod`) : m[1] });
  if (line === 'No message: under "Reported once" a boarder is not treated as absent for not punching every day.') return t(`${P}.ex.notAbsentOnce`);
  if ((m = /^First valid arrival punch in (.+): send "reported to school" \(not a late or absence message\)\.$/.exec(line))) return t(`${P}.ex.firstValid`, { period: m[1] });
  if (line === 'Boarding learner on "Daily punch": the same rules as day scholars apply.') return t(`${P}.ex.boardingDaily`);
  if (line === 'Day scholar: the daily attendance rules apply.') return t(`${P}.ex.dayRules`);
  if ((m = /^No message: ([a-z ]+)\.$/.exec(line))) {
    const code = m[1].replace(/ /g, '_');
    const reason = t(`${P}.reason.${code}`, '');
    if (reason && !reason.startsWith(P)) return t(`${P}.ex.noMessage`, { reason });
  }
  return line;
}

/** Re-run `refresh` whenever a provider delivery report arrives (pushed by the navbar's live stream). */
function useDeliveryReports(refresh: () => void) {
  const [lastAt, setLastAt] = useState<number | null>(null);
  useEffect(() => {
    const h = () => { setLastAt(Date.now()); refresh(); };
    window.addEventListener(SMS_DELIVERY_EVENT, h);
    return () => window.removeEventListener(SMS_DELIVERY_EVENT, h);
  }, [refresh]);
  return lastAt;
}

/** What the provider last told us about a message, in plain words. */
function ProviderReportLine({ r }: { r: ProviderReport }) {
  const { t, lang } = useI18n();
  const net = r.network ? ` · ${r.network}` : '';
  const reason = r.reason && !(lang === 'ar' && isEnglishText(r.reason)) ? ` — ${r.reason}` : '';
  if (r.state === 'delivered') return <div className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">{t(`${P}.reached`, { time: fmtTime(r.at, lang), net })}</div>;
  if (r.state === 'failed') return <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 max-w-[200px] line-clamp-2" title={r.reason ?? undefined}>{t(`${P}.notDelivered`, { reason, net })}</div>;
  return <div className="text-[11px] text-sky-700 dark:text-sky-400 mt-1">{t(`${P}.onNetwork`, { time: fmtTime(r.at, lang), net })}</div>;
}

export default function SmsOutboxPage() {
  const { t, rich, lang, digits, formatNumber } = useI18n();
  const statusLabel = (s: Status) => t(`${P}.status.${s}`, STATUS_LABEL[s]);
  const typeLabel = (code: string) => t(`${P}.type.${code}`, TYPE_LABEL[code] ?? code);
  const chLabel = (c: string) => t(`${P}.ch.${c}`, c);
  const [status, setStatus] = useState<'all' | Status>('all');
  const [type, setType] = useState('');
  const [channel, setChannel] = useState('');
  const [range, setRange] = useState('24');            // hours, or 'custom'
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => { const t = setTimeout(() => { setQ(searchInput.trim()); setPage(1); }, 350); return () => clearTimeout(t); }, [searchInput]);
  useEffect(() => { setPage(1); }, [status, type, channel, range, from, to]);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (status !== 'all') p.set('status', status);
    if (type) p.set('type', type);
    if (channel) p.set('channel', channel);
    if (q) p.set('q', q);
    if (range === 'custom') { if (from) p.set('date_from', from); if (to) p.set('date_to', to); } else p.set('since_hours', range);
    p.set('page', String(page)); p.set('per_page', '50');
    return p.toString();
  }, [status, type, channel, q, range, from, to, page]);

  const { data, mutate, isLoading } = useSWR<Payload & { error?: string }>(`/api/admin/notifications/outbox?${qs}`, fetcher, { refreshInterval: 15_000 });
  const refresh = React.useCallback(() => { void mutate(); }, [mutate]);
  const lastReportAt = useDeliveryReports(refresh);
  const rows = data?.rows ?? [];
  const counts = data?.statusCounts ?? {};
  const resendableCount = (counts.failed ?? 0) + (counts.expired ?? 0);

  const [resending, setResending] = useState(false);
  const handleResendFailed = async () => {
    const escapeHtml = (value: string) => {
      const escapes: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
      return value.replace(/[&<>"']/g, (c) => escapes[c]);
    };
    const resendTypes = [...(data?.types ?? [])];
    if (type && !resendTypes.some((item) => item.type === type)) resendTypes.push({ type, n: 0 });
    const typeOptions = resendTypes.map((item) => `<option value="${escapeHtml(item.type)}" ${type === item.type ? 'selected' : ''}>${escapeHtml(typeLabel(item.type))}</option>`).join('');
    const prompt = await Swal.fire({
      title: t('commPages.outbox.rs.title', "Resend failed messages"),
      html: `<div dir="${lang === 'ar' ? 'rtl' : 'ltr'}" style="text-align:start;display:grid;gap:12px">
        <label>${escapeHtml(t('commPages.outbox.messageType', "Message type"))}<select id="resend-type" class="swal2-select" style="display:block;width:100%;margin:6px 0 0"><option value="">${escapeHtml(t('commPages.outbox.rs.anyType', "Any type"))}</option>${typeOptions}</select></label>
        <label>${escapeHtml(t('commPages.outbox.channelLabel', "Channel"))}<select id="resend-channel" class="swal2-select" style="display:block;width:100%;margin:6px 0 0">
          <option value="" ${!channel ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.rs.anyChannel', "Any channel"))}</option><option value="sms" ${channel === 'sms' ? 'selected' : ''}>${escapeHtml(chLabel('sms'))}</option><option value="email" ${channel === 'email' ? 'selected' : ''}>${escapeHtml(chLabel('email'))}</option><option value="push" ${channel === 'push' ? 'selected' : ''}>${escapeHtml(chLabel('push'))}</option>
        </select></label>
        <label>${escapeHtml(t('commPages.outbox.rs.created', "Created"))}<select id="resend-range" class="swal2-select" style="display:block;width:100%;margin:6px 0 0">
          <option value="1" ${range === '1' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.r1', "Last hour"))}</option><option value="24" ${range === '24' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.r24', "Last 24 hours"))}</option><option value="72" ${range === '72' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.r72', "Last 3 days"))}</option><option value="168" ${range === '168' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.r168', "Last 7 days"))}</option><option value="720" ${range === '720' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.r720', "Last 30 days"))}</option><option value="custom" ${range === 'custom' ? 'selected' : ''}>${escapeHtml(t('commPages.outbox.rCustomPlain', "Custom dates"))}</option>
        </select></label>
        <div id="resend-custom-dates" style="${range === 'custom' ? '' : 'display:none;'}grid-template-columns:1fr 1fr;gap:8px">
          <label>${escapeHtml(t('commPages.outbox.from', "From"))}<input id="resend-from" type="date" class="swal2-input" style="width:100%;margin:6px 0 0" value="${escapeHtml(from)}"></label>
          <label>${escapeHtml(t('commPages.outbox.to', "To"))}<input id="resend-to" type="date" class="swal2-input" style="width:100%;margin:6px 0 0" value="${escapeHtml(to)}"></label>
        </div>
        <p style="font-size:12px;color:#666;margin:0">${escapeHtml(t('commPages.outbox.rs.note', "Only failed or expired messages matching these filters will be queued. Confirming may send messages again."))}</p>
      </div>`,
      showCancelButton: true,
      cancelButtonText: t('commPages.outbox.rs.cancel', "Cancel"),
      confirmButtonText: t('commPages.outbox.rs.confirm', "Review and resend"),
      confirmButtonColor: '#dc2626',
      focusConfirm: false,
      didOpen: () => {
        const rangeSelect = document.getElementById('resend-range') as HTMLSelectElement | null;
        const dateFields = document.getElementById('resend-custom-dates');
        rangeSelect?.addEventListener('change', () => { if (dateFields) dateFields.style.display = rangeSelect.value === 'custom' ? 'grid' : 'none'; });
      },
      preConfirm: () => {
        const selectedRange = (document.getElementById('resend-range') as HTMLSelectElement).value;
        const selectedFrom = (document.getElementById('resend-from') as HTMLInputElement).value;
        const selectedTo = (document.getElementById('resend-to') as HTMLInputElement).value;
        if (selectedRange === 'custom' && selectedFrom && selectedTo && selectedFrom > selectedTo) {
          Swal.showValidationMessage(t('commPages.outbox.rs.badRange', "The start date must be on or before the end date."));
          return false;
        }
        if (selectedRange === 'custom' && !selectedFrom && !selectedTo) {
          Swal.showValidationMessage(t('commPages.outbox.rs.noDate', "Choose at least one custom date."));
          return false;
        }
        return {
          type: (document.getElementById('resend-type') as HTMLSelectElement).value,
          channel: (document.getElementById('resend-channel') as HTMLSelectElement).value,
          range: selectedRange, from: selectedFrom, to: selectedTo,
        };
      },
    });
    if (!prompt.isConfirmed || !prompt.value) return;
    const filters = prompt.value as { type: string; channel: string; range: string; from: string; to: string };
    setResending(true);
    try {
      const body: Record<string, unknown> = {};
      if (filters.type) body.type = filters.type;
      if (filters.channel) body.channel = filters.channel;
      if (filters.range === 'custom') { if (filters.from) body.date_from = filters.from; if (filters.to) body.date_to = filters.to; }
      else body.since_hours = filters.range;
      const r = await fetch('/api/admin/notifications/outbox/resend', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
      });
      const j = await readResponse<{ requeued?: number }>(r);
      showToast('success', j.requeued > 0 ? (lang === 'ar' ? t(`${P}.rs.requeued`, { count: j.requeued }) : `Re-queued ${j.requeued.toLocaleString()} message(s) for resending`) : t('commPages.outbox.rs.nothing', "Nothing matched these filters"));
      mutate();
    } catch (e) {
      showToast('error', e instanceof Error ? serverText(e.message, t('commPages.outbox.rs.failed', "Resend failed")) : t('commPages.outbox.rs.failed', "Resend failed"));
    } finally {
      setResending(false);
    }
  };

  const chips: FilterChip[] = [];
  if (type) chips.push({ key: 'type', label: t(`${P}.chipType`, { v: typeLabel(type) }), onRemove: () => setType('') });
  if (channel) chips.push({ key: 'ch', label: t(`${P}.chipChannel`, { v: lang === 'ar' ? chLabel(channel) : channel }), onRemove: () => setChannel('') });
  if (range !== '24') chips.push({ key: 'range', label: range === 'custom' ? t(`${P}.chipDates`, { from: digits(from || '…'), to: digits(to || '…') }) : Number(range) >= 24 ? t(`${P}.chipLastD`, { n: Number(range) / 24 }) : t(`${P}.chipLastH`, { n: range }), onRemove: () => setRange('24') });
  const clearAll = () => { setType(''); setChannel(''); setRange('24'); setFrom(''); setTo(''); setStatus('all'); setSearchInput(''); };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 flex items-center gap-2"><Inbox className="w-6 h-6 text-indigo-600" /> {t('commPages.outbox.title', "SMS Outbox")}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{t('commPages.outbox.intro', "Every message DRAIS created, and how far it got.")}
            <span className="inline-flex items-center gap-1 ms-2 text-emerald-700 dark:text-emerald-400 font-medium">
              <span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" /></span>
              {t(`${P}.live`, 'Live')}{lastReportAt ? t(`${P}.lastReport`, { time: fmtTime(new Date(lastReportAt).toISOString(), lang) }) : ''}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleResendFailed}
            disabled={resending}
            title={t('commPages.outbox.resendTitle', "Choose filters for failed or expired messages to resend")}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-red-100 dark:hover:bg-red-900/30"
          >
            {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : <SendHorizontal className="w-4 h-4" />}
            {t('commPages.outbox.resendFailed', "Resend failed")}{resendableCount > 0 ? ` (${digits(resendableCount)})` : ''}
          </button>
          <button onClick={() => mutate()} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-200">
            <RefreshCw className="w-4 h-4" /> {t('commPages.outbox.refresh', "Refresh")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2" role="group" aria-label={t('commPages.outbox.filterByStatus', "Filter by status")}>
        {STATUSES.map((s) => (
          <button key={s} onClick={() => setStatus(status === s ? 'all' : s)} aria-pressed={status === s}
            className={`text-start px-3 py-2.5 rounded-xl border bg-white dark:bg-gray-900 ${status === s ? 'border-indigo-500 ring-1 ring-indigo-500' : 'border-gray-200 dark:border-gray-700'}`}>
            <div className="text-xs font-medium text-gray-600 dark:text-gray-400">{statusLabel(s)}</div>
            <div className="text-xl font-bold text-gray-900 dark:text-gray-100">{lang === 'ar' ? formatNumber(counts[s] ?? 0) : (counts[s] ?? 0).toLocaleString()}</div>
          </button>
        ))}
      </div>

      <div className="flex items-start gap-2 text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{rich(`${P}.explainer`, { sent: <b>{statusLabel('sent')}</b>, delivered: <b>{statusLabel('delivered')}</b>, failed: <b>{statusLabel('failed')}</b> })}</span>
      </div>

      <div className="relative">
        <Search className="w-4 h-4 absolute start-3 top-2.5 text-gray-400" />
        <input value={searchInput} onChange={(e) => setSearchInput(e.target.value)} placeholder={t('commPages.outbox.searchPh', "Search parent name, phone or learner…")}
          className={`${filterInputCls} ps-9 py-2`} aria-label={t('commPages.outbox.searchAria', "Search messages")} />
      </div>

      <FilterAccordion chips={chips} onClear={clearAll}>
        <FilterField label={t('commPages.outbox.messageType', "Message type")}>
          <select className={filterInputCls} value={type} onChange={(e) => setType(e.target.value)}>
            <option value="">{t('commPages.outbox.any', "Any")}</option>
            {(data?.types ?? []).map((ty) => <option key={ty.type} value={ty.type}>{typeLabel(ty.type)} ({digits(ty.n)})</option>)}
          </select>
        </FilterField>
        <FilterField label={t('commPages.outbox.channelLabel', "Channel")}>
          <select className={filterInputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
            <option value="">{t('commPages.outbox.any', "Any")}</option><option value="sms">{chLabel('sms')}</option><option value="email">{chLabel('email')}</option><option value="push">{chLabel('push')}</option>
          </select>
        </FilterField>
        <FilterField label={t('commPages.outbox.when', "When")}>
          <select className={filterInputCls} value={range} onChange={(e) => setRange(e.target.value)}>
            <option value="1">{t('commPages.outbox.r1', "Last hour")}</option><option value="24">{t('commPages.outbox.r24', "Last 24 hours")}</option><option value="72">{t('commPages.outbox.r72', "Last 3 days")}</option>
            <option value="168">{t('commPages.outbox.r168', "Last 7 days")}</option><option value="720">{t('commPages.outbox.r720', "Last 30 days")}</option><option value="custom">{t('commPages.outbox.rCustom', "Custom dates…")}</option>
          </select>
        </FilterField>
        {range === 'custom' && (
          <>
            <FilterField label={t('commPages.outbox.from', "From")}><input type="date" className={filterInputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></FilterField>
            <FilterField label={t('commPages.outbox.to', "To")}><input type="date" className={filterInputCls} value={to} onChange={(e) => setTo(e.target.value)} /></FilterField>
          </>
        )}
      </FilterAccordion>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> {t('commPages.outbox.loading', "Loading…")}</div>
      ) : data?.error ? (
        <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/20 rounded-lg p-3">{serverText(data.error, t('commPages.outbox.loadError', "Could not load the messages."))}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-14 rounded-xl border border-dashed border-gray-300 dark:border-gray-600">
          <Inbox className="w-10 h-10 mx-auto text-gray-400 mb-2" />
          <p className="text-sm text-gray-600 dark:text-gray-400">{t('commPages.outbox.noMatch', "No messages match these filters.")}</p>
          {(status !== 'all' || chips.length > 0 || q) && <button onClick={clearAll} className="mt-2 text-sm text-indigo-600 underline">{t('commPages.outbox.clearFilters', "Clear filters")}</button>}
        </div>
      ) : (
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-3 py-2 text-start">{t('commPages.outbox.col.created', "Created")}</th><th className="px-3 py-2 text-start">{t('commPages.outbox.col.status', "Status")}</th><th className="px-3 py-2 text-start">{t('commPages.outbox.col.type', "Type")}</th>
                <th className="px-3 py-2 text-start">{t('commPages.outbox.col.parent', "Parent")}</th><th className="px-3 py-2 text-start">{t('commPages.outbox.col.learner', "Learner")}</th><th className="px-3 py-2 text-start">{t('commPages.outbox.col.message', "Message")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((r) => (
                <tr key={r.id} onClick={() => setOpenId(r.id)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setOpenId(r.id); }}
                  className="align-top cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/60 focus:outline-none focus:bg-gray-50 dark:focus:bg-gray-800/60">
                  <td className="px-3 py-2 whitespace-nowrap text-[12px] text-gray-600 dark:text-gray-400">{fmt(r.created_at, lang)}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[11px] px-1.5 py-0.5 rounded ${TONE[r.display_status]}`}>{statusLabel(r.display_status)}</span>
                    {r.attempts > 1 && <span dir="ltr" className="ms-1 text-[10px] text-gray-500">{digits(r.attempts)}/{digits(r.max_attempts)}</span>}
                    {r.provider_report && r.display_status !== 'failed' && <ProviderReportLine r={r.provider_report} />}
                    {r.last_error && <div className="text-[11px] text-red-600 dark:text-red-400 mt-1 max-w-[200px] line-clamp-2" title={r.last_error}>{serverText(r.last_error, t('commPages.outbox.sendError', "Not sent — the provider returned an error"))}</div>}
                  </td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-gray-300">{r.notification_type ? typeLabel(r.notification_type) : (r.policy_name ?? '—')}</td>
                  <td className="px-3 py-2"><div className="font-medium text-gray-900 dark:text-gray-100">{r.recipient_name || '—'}</div><div dir="ltr" className="text-[11px] text-gray-500 font-mono text-start rtl:text-end">{digits(r.recipient_phone)}</div></td>
                  <td className="px-3 py-2 text-[12px] text-gray-700 dark:text-gray-300">{r.learner_name || '—'}</td>
                  <td className="px-3 py-2 max-w-[260px]"><span className="text-[12px] text-gray-600 dark:text-gray-400 line-clamp-2">{r.body_preview}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
          <span>{t(`${P}.pageLine`, { total: lang === 'ar' ? formatNumber(data.total) : data.total.toLocaleString(), page: data.page, pages: data.totalPages })}</span>
          <div className="flex gap-2">
            <button disabled={page <= 1} onClick={() => setPage(page - 1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40"><ChevronLeft className="w-4 h-4 rtl:-scale-x-100" /> {t('commPages.outbox.prev', "Prev")}</button>
            <button disabled={page >= data.totalPages} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 disabled:opacity-40">{t('commPages.outbox.next', "Next")} <ChevronRight className="w-4 h-4 rtl:-scale-x-100" /></button>
          </div>
        </div>
      )}

      {openId && <Detail id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function Detail({ id, onClose }: { id: number; onClose: () => void }) {
  const { t, lang, digits } = useI18n();
  const { data, isLoading, mutate } = useSWR<any>(`/api/admin/notifications/outbox/${id}`, fetcher, { refreshInterval: 15_000 });
  const refresh = React.useCallback(() => { void mutate(); }, [mutate]);
  useDeliveryReports(refresh);
  useEffect(() => { const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, [onClose]);
  const m = data?.message;
  const dec = data?.decision;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label={t('commPages.outbox.d.title', "SMS details")}>
      <div className="w-full max-w-lg h-full overflow-y-auto bg-white dark:bg-gray-900 shadow-2xl p-5 space-y-5" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">{t('commPages.outbox.d.title', "SMS details")}</h2>
          <button onClick={onClose} aria-label={t('commPages.outbox.d.close', "Close")} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800"><X className="w-5 h-5" /></button>
        </div>
        {isLoading && <div className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="w-4 h-4 animate-spin" /> {t('commPages.outbox.loading', "Loading…")}</div>}
        {data?.error && <p className="text-sm text-red-600">{serverText(data.error, t('commPages.outbox.d.loadError', "Could not load this message."))}</p>}
        {m && (
          <>
            <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2 text-sm">
              <dt className="text-gray-500">{t('commPages.outbox.d.status', "Status")}</dt>
              <dd><span className={`text-[11px] px-1.5 py-0.5 rounded ${TONE[m.status as Status]}`}>{t(`${P}.status.${m.status}`, STATUS_LABEL[m.status as Status])}</span><div className="text-xs text-gray-500 mt-1">{m.statusHelp ? t(`${P}.help.${m.status}`, m.statusHelp) : ''}</div></dd>
              <dt className="text-gray-500">{t('commPages.outbox.d.recipient', "Recipient")}</dt><dd className="text-gray-900 dark:text-gray-100">{m.recipientName || '—'}<div dir="ltr" className="font-mono text-xs text-gray-500 text-start rtl:text-end">{m.recipientPhone ? digits(m.recipientPhone) : m.recipientEmail}</div></dd>
              <dt className="text-gray-500">{t('commPages.outbox.d.school', "School")}</dt><dd className="text-gray-900 dark:text-gray-100">{m.schoolName || '—'}</dd>
              <dt className="text-gray-500">{t('commPages.outbox.d.learner', "Learner")}</dt><dd className="text-gray-900 dark:text-gray-100">{m.learnerName || '—'}</dd>
              <dt className="text-gray-500">{t('commPages.outbox.d.type', "Type")}</dt><dd className="text-gray-900 dark:text-gray-100">{(m.notificationType ? t(`${P}.type.${m.notificationType}`, m.notificationLabel ?? m.notificationType) : null) || m.policyName || '—'}{m.attendanceDate ? <span className="text-gray-500"> · {digits(String(m.attendanceDate).slice(0, 10))}</span> : null}</dd>
              <dt className="text-gray-500">{t('commPages.outbox.d.message', "Message")}</dt><dd className="text-gray-900 dark:text-gray-100 whitespace-pre-wrap">{m.body}</dd>
              {m.lastError && (<><dt className="text-gray-500">{t('commPages.outbox.d.problem', "Problem")}</dt><dd className="text-red-600 dark:text-red-400" title={m.lastError}>{serverText(m.lastError, t('commPages.outbox.sendError', "Not sent — the provider returned an error"))}</dd></>)}
            </dl>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('commPages.outbox.d.whatHappened', "What happened to it")}</h3>
              <ol className="space-y-2">
                {data.lifecycle.map((s: any, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <span className={`mt-1 w-2.5 h-2.5 rounded-full ${s.failed ? 'bg-red-500' : s.done ? 'bg-emerald-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <span className={s.failed ? 'text-red-600 dark:text-red-400' : s.done ? 'text-gray-900 dark:text-gray-100' : 'text-gray-500'}>{s.key ? t(`${P}.life.${s.key}`, {
                      net: s.vars?.network ? ` (${s.vars.network})` : '',
                      reason: s.vars?.reason && !(lang === 'ar' && isEnglishText(s.vars.reason)) ? `: ${s.vars.reason}` : '',
                    }) : s.step}{s.at ? <span className="text-gray-500"> — {fmt(s.at, lang)}</span> : s.done ? '' : t(`${P}.life.notYet`, ' — not yet')}</span>
                  </li>
                ))}
              </ol>
              {data.deliveries.length > 0 && (
                <div className="mt-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
                  {data.deliveries.map((d: any, i: number) => (
                    <div key={i} className="rounded-md bg-gray-50 dark:bg-gray-800 px-2 py-1.5">
                      {d.provider} · {d.accepted ? t('commPages.outbox.d.accepted', "accepted") : t('commPages.outbox.d.rejected', "rejected")}{d.providerMessageId ? <> · {t('commPages.outbox.d.id', "id")} <span className="font-mono">{d.providerMessageId}</span></> : null}{d.cost ? ` · ${lang === 'ar' && d.costUgx != null ? t(`${P}.d.ugx`, { n: d.costUgx }) : d.cost}` : ''}{d.error ? ` · ${serverText(d.error, t('commPages.outbox.sendError', "Not sent — the provider returned an error"))}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h3 className="text-sm font-semibold text-gray-800 dark:text-gray-100 mb-2">{t('commPages.outbox.d.whySent', "Why was this sent?")}</h3>
              {dec ? (
                <div className="rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm space-y-2">
                  <div className="font-medium text-gray-900 dark:text-gray-100">{t(`${P}.d.decision`, { v: dec.decision === 'SEND' ? t('commPages.outbox.d.send', "Send") : t('commPages.outbox.d.doNotSend', "Do not send") })}{dec.reasonText ? <span className="font-normal text-gray-600 dark:text-gray-400"> — {t(`${P}.reason.${dec.reasonCode}`, dec.reasonText)}</span> : null}</div>
                  <ul className="list-disc ps-5 text-gray-700 dark:text-gray-300 space-y-0.5">{dec.explanation.map((l: string, i: number) => <li key={i}>{explainLine(l, t as TFn, lang)}</li>)}</ul>
                  {dec.facts?.firstPunchAt && <div className="text-xs text-gray-500">{t(`${P}.d.punch`, { time: fmt(dec.facts.firstPunchAt, lang) })}{dec.facts.reportingPeriod ? t(`${P}.d.period`, { v: dec.facts.reportingPeriod }) : ''}</div>}
                </div>
              ) : (
                <p className="text-sm text-gray-500">{data.decisionNote ? t(`${P}.d.noDecision`, data.decisionNote) : t('commPages.outbox.d.noRule', "This message was not created by an attendance rule.")}</p>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}
