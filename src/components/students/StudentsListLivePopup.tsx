'use client';

/**
 * StudentsListLivePopup — the FAST popup path.
 * ───────────────────────────────────────────
 * Mounted on /students/list, where the page already holds the full
 * roster in memory. It listens to the lightweight /live-identity SSE
 * (identity only — no server enrichment) and, when a scan resolves to a
 * student already in the roster, renders the popup from that in-memory
 * record. Result: the popup appears with effectively zero per-scan
 * server work (no getLearnerDeepInfo, no resolve, no fee/guardian reads).
 *
 * Gating: only active when the school's live-popup setting is enabled,
 * mount_scope === 'students', and the browser hasn't muted it. The
 * server-enriched global popup (LiveIdentityPopup) handles the
 * 'attendance' / 'global' scopes; the two never both fire (see
 * LiveIdentityPopup's mount_scope check).
 */

import { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';

const LIVE_SCAN_DISABLED_KEY = 'drais.liveScan.disabled';

export interface RosterStudent {
  id: number;
  first_name: string;
  last_name: string;
  admission_no?: string;
  photo_url?: string;
  class_name?: string;
  gender?: string;
}

interface LiveSettings {
  live_popup_enabled: number;
  mount_scope: string;
  sound_enabled: number;
  popup_duration_ms: number;
  show_for_late_only: number;
}

interface IdentityEvent {
  scan_id: number;
  device_user_id: string;
  student_id: number | null;
  staff_id: number | null;
  person_type: 'student' | 'staff' | 'unmatched';
  matched: boolean;
  check_time: string | null;
}

function escHtml(s: string): string {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string
  ));
}

function beep() {
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext);
    if (!Ctx) return;
    const ctx = new Ctx();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.06, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
    o.start(); o.stop(ctx.currentTime + 0.19);
    setTimeout(() => { try { ctx.close(); } catch { /* noop */ } }, 400);
  } catch { /* audio optional */ }
}

export function StudentsListLivePopup({ students }: { students: RosterStudent[] }) {
  // Keep the latest roster in a ref so the SSE handler always sees current
  // data without re-subscribing on every roster change.
  const rosterRef = useRef<Map<number, RosterStudent>>(new Map());
  useEffect(() => {
    const m = new Map<number, RosterStudent>();
    for (const s of students) m.set(s.id, s);
    rosterRef.current = m;
  }, [students]);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    const seen = new Set<number>();

    (async () => {
      let settings: LiveSettings | null = null;
      try {
        const r = await fetch('/api/attendance/live-settings');
        const j = await r.json();
        settings = j?.settings ?? null;
      } catch { /* use null → bail */ }
      if (cancelled || !settings) return;

      // Fast path is for the 'students' scope only. Other scopes are
      // served by the global server-enriched popup.
      if (!settings.live_popup_enabled || settings.mount_scope !== 'students') return;

      const muted = () => {
        try { return window.localStorage.getItem(LIVE_SCAN_DISABLED_KEY) === '1'; } catch { return false; }
      };

      es = new EventSource('/api/attendance/live-identity');
      es.onmessage = (ev) => {
        if (!ev.data || muted()) return;
        let data: IdentityEvent;
        try { data = JSON.parse(ev.data); } catch { return; }
        if (data.person_type !== 'student' || !data.student_id) return;
        if (seen.has(data.scan_id)) return;
        seen.add(data.scan_id);

        const student = rosterRef.current.get(data.student_id);
        if (!student) return; // not in this roster view — let global popup (if any) handle

        // Lateness can't be computed from the roster alone, so 'late only'
        // filtering isn't enforced in the fast path — that's a server-side
        // detail handled by the enriched popup. Show all student scans.

        const name = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || 'Student';
        const when = data.check_time ? new Date(data.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '';
        const photo = student.photo_url
          ? `<img src="${escHtml(student.photo_url)}" style="width:84px;height:84px;border-radius:50%;object-fit:cover;border:3px solid #4f46e5" />`
          : `<div style="width:84px;height:84px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:28px;font-weight:700">${escHtml((student.first_name?.[0] || '?').toUpperCase())}</div>`;

        const html = `
          <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
            ${photo}
            <div style="font-size:18px;font-weight:700;color:#111827">${escHtml(name)}</div>
            ${student.class_name ? `<div style="font-size:13px;color:#4f46e5;font-weight:600">${escHtml(student.class_name)}</div>` : ''}
            ${student.admission_no ? `<div style="font-size:12px;color:#6b7280">Adm: ${escHtml(student.admission_no)}</div>` : ''}
            <div style="margin-top:4px;padding:6px 14px;background:#ecfdf5;color:#047857;border-radius:999px;font-size:13px;font-weight:700">✓ Arrived ${escHtml(when)}</div>
          </div>`;

        const duration = settings!.popup_duration_ms;
        if (settings!.sound_enabled) beep();
        Swal.fire({
          html,
          showConfirmButton: false,
          timer: duration && duration > 0 ? duration : undefined,
          timerProgressBar: !!(duration && duration > 0),
          position: 'top-end',
          width: 300,
          backdrop: false,
          showClass: { popup: 'animate__animated animate__fadeInRight animate__faster' },
        });
      };
      es.onerror = () => { /* EventSource auto-reconnects */ };
    })();

    return () => { cancelled = true; if (es) es.close(); };
  }, []);

  return null;
}

export default StudentsListLivePopup;
