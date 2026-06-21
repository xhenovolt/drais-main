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

interface ScanEvent {
  scan_id: number;
  matched: boolean;
  person_type: 'student' | 'staff' | 'unmatched';
  sms_status?: string | null;
  learner?: { first_name?: string; last_name?: string } | null;
  staff?: { first_name?: string; last_name?: string } | null;
}

interface Pill { text: string; color: string; bg: string; }

function pillFor(scan: ScanEvent): Pill | null {
  const name =
    (scan.learner && `${scan.learner.first_name ?? ''} ${scan.learner.last_name ?? ''}`.trim()) ||
    (scan.staff && `${scan.staff.first_name ?? ''} ${scan.staff.last_name ?? ''}`.trim()) ||
    (scan.matched ? 'Learner' : 'Unknown user');
  const s = scan.sms_status;
  if (!scan.matched) return { text: `👤 ${name} scanned`, color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
  if (s === 'delivered' || s === 'sent') return { text: `✅ SMS sent · ${name}'s guardian`, color: '#047857', bg: 'rgba(5,150,105,0.12)' };
  if (s === 'queued' || s === 'sending' || s === 'pending') return { text: `📨 SMS sending · ${name}'s guardian`, color: '#1d4ed8', bg: 'rgba(37,99,235,0.12)' };
  if (s === 'failed') return { text: `⚠ SMS failed · ${name}`, color: '#dc2626', bg: 'rgba(220,38,38,0.12)' };
  if (s === 'disabled') return { text: `🔕 SMS off · ${name} scanned`, color: '#b45309', bg: 'rgba(217,119,6,0.12)' };
  if (s === 'no_phone') return { text: `📵 No guardian phone · ${name}`, color: '#b45309', bg: 'rgba(217,119,6,0.12)' };
  return { text: `👤 ${name} scanned`, color: '#6b7280', bg: 'rgba(107,114,128,0.12)' };
}

export default function LiveScanSmsIndicator() {
  const [pill, setPill] = useState<Pill | null>(null);
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
        const p = pillFor(scan);
        if (!p) return;
        setPill(p);
        if (hideTimer.current) clearTimeout(hideTimer.current);
        hideTimer.current = setTimeout(() => setPill(null), 8000);
      };
      es.onerror = () => { /* EventSource auto-reconnects */ };
    } catch { /* SSE unsupported */ }
    return () => { if (es) es.close(); if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  if (!pill) return null;

  return (
    <div
      title="Latest attendance scan — SMS status"
      onClick={() => setPill(null)}
      className="hidden sm:flex items-center max-w-[260px] truncate cursor-default select-none rounded-full px-3 py-1 text-xs font-semibold"
      style={{ color: pill.color, background: pill.bg }}
    >
      <span className="truncate">{pill.text}</span>
    </div>
  );
}
