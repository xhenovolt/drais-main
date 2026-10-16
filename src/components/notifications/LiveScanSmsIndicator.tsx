'use client';

/**
 * LiveScanSmsIndicator — a live pill in the NAVBAR (not a popup) that shows,
 * the moment a fingerprint scan is received, whether the attendance SMS to
 * the guardian is sending / sent / failed / disabled / no-phone.
 *
 * Subscribes to the enriched live-scan SSE (which already computes sms_status,
 * including 'disabled' and 'no_phone'). It is independent of the popup
 * settings — this is the navbar status the operator asked for.
 */
import { useEffect, useState, useRef } from 'react';
import { showToast, isEnglishText } from '@/lib/toast';
import { useI18n } from '@/components/i18n/I18nProvider';

type T = (key: string, vars?: Record<string, string | number>) => string;

interface ScanEvent {
  scan_id: number;
  matched: boolean;
  person_type: 'student' | 'staff' | 'unmatched';
  sms_status?: string | null;
  learner?: { first_name?: string; last_name?: string } | null;
  staff?: { first_name?: string; last_name?: string } | null;
}

interface Pill { text: string; color: string; bg: string; }

function pillFor(scan: ScanEvent, t: T): Pill | null {
  const name =
    (scan.learner && `${scan.learner.first_name ?? ''} ${scan.learner.last_name ?? ''}`.trim()) ||
    (scan.staff && `${scan.staff.first_name ?? ''} ${scan.staff.last_name ?? ''}`.trim()) ||
    (scan.matched ? t('shell.scan.learner') : t('shell.scan.unknownUser'));
  const s = scan.sms_status;
  if (!scan.matched) return { text: t('shell.scan.scanned', { name }), color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  if (s === 'delivered' || s === 'sent') return { text: t('shell.scan.smsSent', { name }), color: '#047857', bg: 'rgba(5,150,105,0.12)' };
  if (s === 'queued' || s === 'sending' || s === 'pending') return { text: t('shell.scan.smsSending', { name }), color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' };
  if (s === 'failed') return { text: t('shell.scan.smsFailed', { name }), color: '#dc2626', bg: 'rgba(220,38,38,0.12)' };
  if (s === 'disabled') return { text: t('shell.scan.smsOff', { name }), color: '#b45309', bg: 'rgba(217,119,6,0.12)' };
  if (s === 'no_phone') return { text: t('shell.scan.noPhone', { name }), color: '#b45309', bg: 'rgba(217,119,6,0.12)' };
  return { text: t('shell.scan.scanned', { name }), color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
}

/** True when t() is answering in Arabic (provider reasons arrive in English and are then left out). */
const isArabicUi = (t: T) => t('shell.scan.theRecipient') !== 'the recipient';

/** Fired on `window` for every provider delivery report, so open lists can refresh at once. */
export const SMS_DELIVERY_EVENT = 'drais:sms-delivery';

export interface DeliveryEvent {
  id: number;
  state: 'sent' | 'delivered' | 'failed';
  provider?: string | null;
  reason?: string | null;
  network?: string | null;
  recipient_name?: string | null;
  recipient_phone?: string | null;
  learner_name?: string | null;
  outbox_id?: number | null;
  dispatch_log_id?: number | null;
}

// Module-level so the Navbar and Topbar copies of this indicator share it.
const seenDeliveries = new Set<number>();

/** How one delivery report reads to staff. "On the network" updates the pill but does not toast. */
export function deliveryView(d: DeliveryEvent, t: T): { text: string; toast: 'success' | 'error' | null; pill: Pill } {
  const who = d.learner_name
    ? (d.recipient_name ? t('shell.scan.guardianOfNamed', { name: d.learner_name, recipient: d.recipient_name }) : t('shell.scan.guardianOf', { name: d.learner_name }))
    : (d.recipient_name || d.recipient_phone || t('shell.scan.theRecipient'));
  const phone = d.recipient_phone && d.recipient_name ? ` · ${d.recipient_phone}` : '';
  if (d.state === 'delivered') {
    return { text: t('shell.scan.deliveredTo', { who }) + phone, toast: 'success', pill: { text: t('shell.scan.pillDelivered', { who }), color: '#047857', bg: 'rgba(5,150,105,0.12)' } };
  }
  if (d.state === 'failed') {
    return { text: t('shell.scan.notDeliveredTo', { who }) + phone + (d.reason && !(isArabicUi(t) && isEnglishText(d.reason)) ? ` — ${d.reason}` : ''), toast: 'error', pill: { text: t('shell.scan.pillNotDelivered', { who }), color: '#dc2626', bg: 'rgba(220,38,38,0.12)' } };
  }
  return { text: t('shell.scan.onNetworkFor', { who }), toast: null, pill: { text: t('shell.scan.pillOnNetwork', { who }), color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' } };
}

export default function LiveScanSmsIndicator() {
  const [pill, setPill] = useState<Pill | null>(null);
  const { t } = useI18n();
  // The stream is opened once; the latest t() is read through a ref so a language switch applies.
  const tRef = useRef<T>(t as T);
  tRef.current = t as T;
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seen = useRef<Set<number>>(new Set());

  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource('/api/attendance/live-scan');
      es.onmessage = (ev) => {
        if (!ev.data) return;
        let scan: ScanEvent;
        try { scan = JSON.parse(ev.data); } catch { return; }
        if (scan.scan_id == null || seen.current.has(scan.scan_id)) return;
        seen.current.add(scan.scan_id);
        if (seen.current.size > 200) seen.current = new Set(Array.from(seen.current).slice(-100));
        const p = pillFor(scan, tRef.current);
        if (!p) return;
        setPill(p);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setPill(null), 8000);
      };
      // Provider delivery reports (delivered / not delivered / on the network), pushed by the
      // same stream as a named event. Toast once per report, however many copies of this
      // indicator are mounted, and tell any open list (SMS Outbox, dispatch log) to refresh.
      es.addEventListener('sms_delivery', (ev) => {
        let d: DeliveryEvent;
        try { d = JSON.parse((ev as MessageEvent).data); } catch { return; }
        if (d?.id == null || seenDeliveries.has(d.id)) return;
        seenDeliveries.add(d.id);
        if (seenDeliveries.size > 400) { const keep = Array.from(seenDeliveries).slice(-200); seenDeliveries.clear(); keep.forEach((id) => seenDeliveries.add(id)); }
        try { window.dispatchEvent(new CustomEvent(SMS_DELIVERY_EVENT, { detail: d })); } catch { /* older browsers */ }
        const view = deliveryView(d, tRef.current);
        if (view.toast) showToast(view.toast, view.text);
        setPill(view.pill);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setPill(null), 8000);
      });
      es.onerror = () => { /* EventSource auto-reconnects */ };
    } catch { /* SSE unsupported */ }
    return () => { if (es) es.close(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (!pill) return null;

  return (
    <div
      title={t('shell.scan.title', 'Latest attendance scan — SMS status')}
      onClick={() => setPill(null)}
      className="hidden sm:flex items-center max-w-[260px] truncate cursor-default select-none rounded-full px-3 py-1 text-xs font-semibold"
      style={{ color: pill.color, background: pill.bg }}
    >
      <span className="truncate">{pill.text}</span>
    </div>
  );
}
