'use client';

/**
 * StudentsListLivePopup — the FAST popup path.
 * ───────────────────────────────────────────
 * Mounted on /students/list, where the page already holds the full
 * roster in memory (including class, stream, program and — preloaded
 * with the list — fee balance). It listens to the lightweight
 * /live-identity SSE (identity only, no server enrichment) and, when a
 * scan resolves to a student already in the roster, renders the FULL
 * SweetAlert card from that in-memory record. Zero per-scan server work
 * (no getLearnerDeepInfo, no resolve, no fee/guardian reads).
 *
 * Anything the card shows must therefore be loaded WITH the roster on
 * page load (see fetchFeesForVisible in /students/list). That is the
 * whole point of the fast path: fetch once on load, render instantly.
 *
 * Gating: only active when the school's live-popup setting is enabled,
 * mount_scope === 'students', and the browser hasn't muted it. The
 * server-enriched global popup (LiveIdentityPopup) handles the
 * 'attendance' / 'global' scopes.
 */

import { useEffect, useRef } from 'react';
import Swal from 'sweetalert2';

const LIVE_SCAN_DISABLED_KEY = 'drais.liveScan.disabled';

export interface RosterStudent {
  id: number | string;
  first_name: string;
  last_name: string;
  admission_no?: string;
  photo_url?: string;
  class_name?: string;
  stream_name?: string;
  program_name?: string;
  gender?: string;
  balance?: number;
}

interface LiveSettings {
  live_popup_enabled: number;
  mount_scope: string;
  sound_enabled: number;
  popup_duration_ms: number;
  show_fee_balance: number;
}

interface IdentityEvent {
  scan_id: number;
  device_user_id: string;
  student_id: number | string | null;
  staff_id: number | string | null;
  person_type: 'student' | 'staff' | 'unmatched';
  matched: boolean;
  check_time: string | null;
  // Lightweight display fields from the SSE join — fallback when the
  // in-memory roster doesn't hold this learner.
  first_name?: string | null;
  last_name?: string | null;
  gender?: string | null;
  photo_url?: string | null;
  class_name?: string | null;
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

function row(label: string, value: string, valueColor = '#111827'): string {
  return `<div style="display:flex;justify-content:space-between;gap:12px;padding:5px 0;border-top:1px solid #f1f5f9">
    <span style="font-size:12px;color:#6b7280">${escHtml(label)}</span>
    <span style="font-size:13px;font-weight:600;color:${valueColor};text-align:right">${escHtml(value)}</span>
  </div>`;
}

function buildCard(student: RosterStudent, when: string, showFee: boolean): string {
  const name = `${student.first_name ?? ''} ${student.last_name ?? ''}`.trim() || 'Student';
  const photo = student.photo_url
    ? `<img src="${escHtml(student.photo_url)}" style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:4px solid #4f46e5" />`
    : `<div style="width:96px;height:96px;border-radius:50%;background:#4f46e5;color:#fff;display:flex;align-items:center;justify-content:center;font-size:34px;font-weight:700">${escHtml((student.first_name?.[0] || '?').toUpperCase())}</div>`;

  const classLine = [student.class_name, student.stream_name].filter(Boolean).join(' · ');
  const rows: string[] = [];
  if (student.admission_no) rows.push(row('Admission No', student.admission_no));
  if (student.program_name) rows.push(row('Program', student.program_name));
  if (student.gender) rows.push(row('Gender', student.gender.charAt(0).toUpperCase() + student.gender.slice(1)));
  if (showFee) {
    // Always show the fee line when the toggle is on — default to 0 so it
    // appears even when the balance hasn't been computed for this learner.
    const bal = Number(student.balance ?? 0);
    const txt = `UGX ${Math.abs(bal).toLocaleString()}${bal < 0 ? ' (credit)' : ''}`;
    rows.push(row('Fee Balance', txt, bal > 0 ? '#dc2626' : '#059669'));
  }

  return `
    <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
      ${photo}
      <div style="font-size:20px;font-weight:800;color:#111827;line-height:1.2">${escHtml(name)}</div>
      ${classLine ? `<div style="font-size:13px;color:#4f46e5;font-weight:600">${escHtml(classLine)}</div>` : ''}
      <div style="margin:4px 0;padding:7px 16px;background:#ecfdf5;color:#047857;border-radius:999px;font-size:13px;font-weight:700">✓ Arrived ${escHtml(when)}</div>
      ${rows.length ? `<div style="width:100%;margin-top:4px">${rows.join('')}</div>` : ''}
    </div>`;
}

export function StudentsListLivePopup({ students }: { students: RosterStudent[] }) {
  // Key by String(id): the enrolled API returns id as a string while the
  // SSE student_id can arrive as a number (bus path) or string (poll path),
  // so a raw-typed Map.get would miss and the card would lose its data.
  const rosterRef = useRef<Map<string, RosterStudent>>(new Map());
  useEffect(() => {
    const m = new Map<string, RosterStudent>();
    for (const s of students) m.set(String(s.id), s);
    rosterRef.current = m;
  }, [students]);

  // Settings live in a ref and are refreshed on focus, so toggling a popup
  // option (e.g. Fee balance) in /attendance/settings takes effect when the
  // operator returns to this tab — no full reload needed.
  const settingsRef = useRef<LiveSettings | null>(null);

  useEffect(() => {
    let es: EventSource | null = null;
    let cancelled = false;
    const seen = new Set<number>();

    const fetchSettings = async (): Promise<LiveSettings | null> => {
      try {
        const r = await fetch('/api/attendance/live-settings');
        const j = await r.json();
        if (j?.settings) settingsRef.current = j.settings;
      } catch { /* keep prior settings */ }
      return settingsRef.current;
    };
    const onFocus = () => { fetchSettings(); };

    (async () => {
      const settings = await fetchSettings();
      if (cancelled || !settings) return;
      // Connection gating (scope/enable) is fixed at connect time; changing
      // those is rare and a reload applies it. Display toggles are live.
      if (!settings.live_popup_enabled || settings.mount_scope !== 'students') return;

      window.addEventListener('focus', onFocus);

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

        // Prefer the in-memory roster (richer: stream, program, balance) but
        // fall back to the SSE-provided display fields so photo / class /
        // gender still render even when this learner isn't in the loaded
        // roster (e.g. filtered out, or a different page).
        const key = String(data.student_id);
        const r = rosterRef.current.get(key);
        const student: RosterStudent = {
          id: key,
          first_name: r?.first_name ?? data.first_name ?? '',
          last_name: r?.last_name ?? data.last_name ?? '',
          admission_no: r?.admission_no,
          photo_url: r?.photo_url ?? data.photo_url ?? undefined,
          class_name: r?.class_name ?? data.class_name ?? undefined,
          stream_name: r?.stream_name,
          program_name: r?.program_name,
          gender: r?.gender ?? data.gender ?? undefined,
          balance: r?.balance,
        };
        if (!student.first_name && !student.last_name) return; // nothing to show

        const cur = settingsRef.current ?? settings;
        const when = data.check_time
          ? new Date(data.check_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
          : '';
        const duration = cur.popup_duration_ms;
        if (cur.sound_enabled) beep();

        Swal.close();
        Swal.fire({
          html: buildCard(student, when, cur.show_fee_balance === 1),
          showConfirmButton: duration === 0,
          showCloseButton: duration === 0,
          timer: duration && duration > 0 ? duration : undefined,
          timerProgressBar: !!(duration && duration > 0),
          allowOutsideClick: duration === 0,
          width: 380,
          padding: '22px',
          position: 'center',
          backdrop: 'rgba(0,0,0,0.35)',
        });
      };
      es.onerror = () => { /* EventSource auto-reconnects */ };
    })();

    return () => { cancelled = true; window.removeEventListener('focus', onFocus); if (es) es.close(); Swal.close(); };
  }, []);

  return null;
}

export default StudentsListLivePopup;
