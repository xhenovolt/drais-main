'use client';

import { useEffect, useState, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Fingerprint } from 'lucide-react';
import Swal from 'sweetalert2';

/* ── Types ───────────────────────────────────────────────────────────── */

interface Guardian {
  name: string;
  phone: string;
  relationship: string;
}

interface LearnerInfo {
  student_id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  photo_url: string | null;
  class_name: string | null;
  stream_name: string | null;
  student_status: string;
  enrollment_status: string | null;
  fee_balance: number;
  attendance_today: number;
  /** "Boarding" | "Day" | null — from school-defined custom field. */
  accommodation?: 'Boarding' | 'Day' | null;
  /** Section / house / block / dorm label, if the school tracks it. */
  section?: string | null;
  guardian: Guardian | null;
}

interface ScanEvent {
  scan_id: number;
  device_user_id: string;
  check_time: string;
  verify_type: number | null;
  io_mode: number | null;
  /** DERIVED attendance meaning from the state engine (Arrived/Late/…). */
  derived_event?: string | null;
  derived_detail?: string | null;
  /** Notification outbox state for this person today, or null. */
  sms_status?: string | null;
  matched: boolean;
  person_type: 'student' | 'staff' | 'unmatched';
  device_name: string | null;
  /** PHASE BIO-8: what the device thinks it knows about this PIN.
   *  Captured from USERINFO/OPERLOG pushes. Useful when matched is
   *  false — the popup shows this instead of just the PIN. */
  device_known_name?: string | null;
  /** Best-guess learner the device name fuzzy-resolves to when the
   *  PIN itself is unmapped. The popup renders this as a "Likely
   *  match" card so the operator gets the full context (class,
   *  balance, boarding/day) while the orphan claim is still pending. */
  tentative_learner?: LearnerInfo | null;
  tentative_staff_name?: string | null;
  tentative_score?: number | null;
  learner: LearnerInfo | null;
  staff: { first_name: string; last_name: string } | null;
}

/* ── Sound ───────────────────────────────────────────────────────────── */

function playChime(type: 'success' | 'warning' | 'alert') {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now = ctx.currentTime;

    if (type === 'success') {
      // Pleasant ascending two-tone chime
      [523.25, 659.25].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.12);
        gain.gain.linearRampToValueAtTime(0.18, now + i * 0.12 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.35);
        osc.start(now + i * 0.12);
        osc.stop(now + i * 0.12 + 0.35);
      });
    } else if (type === 'warning') {
      // Single lower tone
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'triangle';
      osc.frequency.value = 440;
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      // Two quick low beeps for unrecognized
      [330, 330].forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0, now + i * 0.18);
        gain.gain.linearRampToValueAtTime(0.12, now + i * 0.18 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.18 + 0.15);
        osc.start(now + i * 0.18);
        osc.stop(now + i * 0.18 + 0.15);
      });
    }
  } catch {
    // Audio not supported — silently ignore
  }
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

function verifyLabel(type: number | null): string {
  switch (type) {
    case 0: return 'Password';
    case 1: return 'Fingerprint';
    case 2: return 'Card';
    case 15: return 'Face';
    default: return 'Biometric';
  }
}

function ioLabel(mode: number | null): string {
  switch (mode) {
    case 0: return 'Check-in';
    case 1: return 'Check-out';
    case 2: return 'Break Out';
    case 3: return 'Break In';
    case 4: return 'OT In';
    case 5: return 'OT Out';
    default: return 'Check-in';
  }
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

/* ── XSS-safe HTML builder for Swal ─────────────────────────────────── */

function escHtml(s: string | null | undefined): string {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/** Renders the rich learner card body. Shared by the confirmed-match
 *  (person_type === 'student') branch and the tentative-match branch
 *  used when an unrecognised PIN's device-supplied name fuzzy-resolves
 *  to a known learner. The `tentative` flag swaps to softer styling
 *  and shows a "Likely match" caveat instead of the IO/check-in line. */
function buildLearnerCard(
  scan: ScanEvent,
  learner: LearnerInfo,
  options: { tentative?: boolean; score?: number | null } = {},
): string {
  const { tentative = false, score = null } = options;

  const photoHtml = learner.photo_url
    ? `<img src="${escHtml(learner.photo_url)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover" />`
    : `<div style="width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;flex-shrink:0">${escHtml((learner.first_name?.[0] ?? '') + (learner.last_name?.[0] ?? ''))}</div>`;

  const classHtml = learner.class_name
    ? `${escHtml(learner.class_name)}${learner.stream_name ? ' · ' + escHtml(learner.stream_name) : ''}`
    : 'Admitted · Not Yet Enrolled';

  // Boarding/Day pill + optional section pill, rendered inline next
  // to the class line so the operator sees at a glance which section
  // the learner belongs to. We only render badges that have a value;
  // schools without these custom fields just see the class line.
  const accommodationBadge = learner.accommodation
    ? `<span style="display:inline-block;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px;margin-left:6px;letter-spacing:.02em;${
        learner.accommodation === 'Boarding'
          ? 'background:#ecfdf5;color:#047857;border:1px solid #a7f3d0'
          : 'background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe'
      }">${escHtml(learner.accommodation)}</span>`
    : '';
  const sectionBadge = learner.section
    ? `<span style="display:inline-block;font-size:10px;font-weight:600;padding:2px 6px;border-radius:6px;margin-left:4px;background:#f1f5f9;color:#475569;border:1px solid #e2e8f0">${escHtml(learner.section)}</span>`
    : '';

  const balanceBg = learner.fee_balance > 0 ? '#fff7ed' : '#f0fdf4';
  const balanceColor = learner.fee_balance > 0 ? '#b45309' : '#15803d';

  const guardianHtml = learner.guardian
    ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;margin-top:8px">
        <span style="font-size:11px;color:#374151">👤 <strong>${escHtml(learner.guardian.name)}</strong> (${escHtml(learner.guardian.relationship)})<br/><a href="tel:${escHtml(learner.guardian.phone)}" style="color:#2563eb;text-decoration:none">${escHtml(learner.guardian.phone)}</a></span>
      </div>`
    : '';

  const profileUrl = `/students/${learner.student_id}`;

  const tentativeBanner = tentative
    ? `<div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:6px 8px;border-radius:8px;font-size:11px;font-weight:600;margin-bottom:8px">
        ⚠ Likely match — PIN ${escHtml(scan.device_user_id)} not yet claimed${score != null ? ` · ${Math.round(score * 100)}% confidence` : ''}
      </div>`
    : '';

  const footerLine = tentative
    ? `<span>Go to <strong>Biometric &rsaquo; Orphan templates</strong> to confirm</span>
       <span>${escHtml(formatTime(scan.check_time))}</span>`
    : `<span>${escHtml(verifyLabel(scan.verify_type))} · ${escHtml(ioLabel(scan.io_mode))}</span>
       <span>${escHtml(formatTime(scan.check_time))}</span>
       ${scan.device_name ? `<span>${escHtml(scan.device_name)}</span>` : ''}`;

  return `
    <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
      ${tentativeBanner}
      <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
        ${photoHtml}
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(learner.first_name)} ${escHtml(learner.last_name)}</div>
          <div style="font-size:11px;color:#6b7280;font-family:monospace">${escHtml(learner.admission_no || 'ID: ' + scan.device_user_id)}</div>
          <div style="font-size:11px;color:#4f46e5;font-weight:600;margin-top:2px;display:flex;align-items:center;flex-wrap:wrap">
            <span>${classHtml}</span>${accommodationBadge}${sectionBadge}
          </div>
        </div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:8px">
        <div style="background:${balanceBg};border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Balance</div>
          <div style="font-weight:700;color:${balanceColor}">UGX ${learner.fee_balance.toLocaleString()}</div>
        </div>
        <div style="background:#f8fafc;border-radius:8px;padding:8px 10px;border:1px solid #e5e7eb">
          <div style="font-size:10px;color:#6b7280;text-transform:uppercase;letter-spacing:.05em">Today</div>
          <div style="font-weight:700;color:#374151">${learner.attendance_today} scan${learner.attendance_today !== 1 ? 's' : ''}</div>
        </div>
      </div>
      ${guardianHtml}
      <div style="margin-top:10px;display:flex;gap:6px">
        <a href="${escHtml(profileUrl)}" onclick="window.location.href='${escHtml(profileUrl)}';Swal.close();return false;" style="flex:1;display:block;text-align:center;padding:8px;background:${tentative ? '#f59e0b' : '#4f46e5'};color:#fff;border-radius:8px;font-weight:600;font-size:12px;text-decoration:none">${tentative ? 'Open Suspected Profile' : 'View Profile'}</a>
        ${learner.guardian?.phone ? `<a href="tel:${escHtml(learner.guardian.phone)}" style="padding:8px 12px;border:1px solid #93c5fd;color:#2563eb;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none">Call Parent</a>` : ''}
      </div>
      <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between;gap:6px">
        ${footerLine}
      </div>
    </div>`;
}

// DERIVED attendance meaning (state engine) — never the device IN/OUT.
const DERIVED_LABEL: Record<string, string> = {
  ARRIVED: 'Arrived', ARRIVED_LATE: 'Late arrival', ARRIVED_EARLY: 'Arrived early',
  TEMP_EXIT: 'Stepped out', RETURNED: 'Returned', CHECKED_OUT: 'Checked out',
  EARLY_DEPARTURE: 'Left early', OVERTIME_EXIT: 'Overtime exit', DUPLICATE: 'Duplicate',
};
/** SMS state line for the popup (only when show_sms_status). */
function smsLineHtml(scan: ScanEvent, showSms: boolean): string {
  if (!showSms) return '';
  const s = scan.sms_status;
  let txt: string, color: string;
  if (!scan.matched) { txt = 'SMS: not sent — identity unresolved'; color = '#9ca3af'; }
  else if (s === 'queued' || s === 'sending') { txt = '📨 SMS: queued to guardian'; color = '#2563eb'; }
  else if (s === 'delivered' || s === 'sent') { txt = '✅ SMS sent to guardian'; color = '#059669'; }
  else if (s === 'failed') { txt = '⚠ SMS: failed (will retry)'; color = '#dc2626'; }
  else if (s === 'disabled') { txt = '🔕 SMS service disabled — set it up in Communication settings'; color = '#d97706'; }
  else if (s === 'no_phone') { txt = 'SMS: no guardian phone on file'; color = '#d97706'; }
  else { txt = 'SMS: none for this scan'; color = '#9ca3af'; }
  return `<div style="margin-top:6px;font-size:11px;font-weight:600;color:${color}">${escHtml(txt)}</div>`;
}
function derivedLineHtml(scan: ScanEvent): string {
  if (!scan.derived_event) return '';
  const label = DERIVED_LABEL[scan.derived_event] ?? scan.derived_event;
  return `<div style="margin-top:4px;font-size:12px;font-weight:700;color:#1e293b">${escHtml(label)}${scan.derived_detail ? ` <span style="font-weight:400;color:#6b7280">· ${escHtml(scan.derived_detail)}</span>` : ''}</div>`;
}

function buildSwalHtml(scan: ScanEvent, showSms = true): string {
  const learner = scan.learner;

  let headerBg = '#10b981'; // emerald
  let headerLabel = 'Check-in Successful';
  // Prefer the DERIVED meaning for the header when known.
  if (scan.derived_event && DERIVED_LABEL[scan.derived_event]) {
    headerLabel = DERIVED_LABEL[scan.derived_event];
    if (scan.derived_event === 'ARRIVED_LATE') headerBg = '#f59e0b';
    else if (scan.derived_event === 'EARLY_DEPARTURE') headerBg = '#f97316';
    else if (scan.derived_event === 'CHECKED_OUT' || scan.derived_event === 'OVERTIME_EXIT') headerBg = '#6366f1';
  }
  if (!scan.matched) {
    headerBg = '#ef4444'; headerLabel = 'Unrecognized ID';
  } else if (learner && learner.fee_balance > 0) {
    headerBg = '#f59e0b'; headerLabel = headerLabel + ' · Low Balance';
  } else if (scan.person_type === 'staff' && !scan.derived_event) {
    headerBg = '#6366f1'; headerLabel = 'Staff Check-in';
  }

  const headerHtml = `
    <div style="background:${headerBg};color:#fff;padding:10px 16px;margin:-20px -20px 12px;border-radius:12px 12px 0 0;font-weight:700;font-size:14px;text-align:left">
      ${escHtml(headerLabel)}
    </div>`;

  // ── Student ──
  if (scan.person_type === 'student' && learner) {
    return headerHtml + buildLearnerCard(scan, learner) + derivedLineHtml(scan) + smsLineHtml(scan, showSms);
  }

  // ── Staff ──
  if (scan.person_type === 'staff' && scan.staff) {
    return `
      ${headerHtml}
      <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
        <div style="font-size:16px;font-weight:700">${escHtml(scan.staff.first_name)} ${escHtml(scan.staff.last_name)}</div>
        <div style="color:#6366f1;font-weight:600;margin:2px 0 6px">Staff Member</div>
        <div style="color:#6b7280;font-size:11px">${escHtml(formatTime(scan.check_time))}</div>
        ${derivedLineHtml(scan)}
        ${smsLineHtml(scan, showSms)}
      </div>`;
  }

  // ── Unmatched ──
  // PHASE BIO-8 / BIO-9: when the device gave us a name, we first try
  // to fuzzy-resolve it to a real learner in DRAIS. If we're
  // confident, the popup renders the full rich card (class, balance,
  // boarding/day) with a "Likely match" caveat so the operator gets
  // actionable context. If only a name (no confident match), we still
  // surface that name so they know who to look for in the orphan
  // queue. Last resort: just the PIN.
  if (scan.tentative_learner) {
    const tentHeaderHtml = `
      <div style="background:#f59e0b;color:#fff;padding:10px 16px;margin:-20px -20px 12px;border-radius:12px 12px 0 0;font-weight:700;font-size:14px;text-align:left">
        Unclaimed PIN — Likely Match
      </div>`;
    return tentHeaderHtml + buildLearnerCard(scan, scan.tentative_learner, {
      tentative: true,
      score: scan.tentative_score ?? null,
    });
  }

  if (scan.tentative_staff_name) {
    return `
      ${headerHtml}
      <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
        <div style="background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:6px 8px;border-radius:8px;font-size:11px;font-weight:600;margin-bottom:8px">
          ⚠ Likely staff match — PIN ${escHtml(scan.device_user_id)} not yet claimed
        </div>
        <div style="font-size:16px;font-weight:700;color:#0f172a">${escHtml(scan.tentative_staff_name)}</div>
        <div style="color:#6366f1;font-weight:600;margin:2px 0 6px">Staff Member (suspected)</div>
        <div style="color:#475569;font-size:11px">Go to <strong>Biometric &rsaquo; Orphan templates</strong> to confirm.</div>
      </div>`;
  }

  const knownName = (scan.device_known_name ?? '').trim();
  if (knownName) {
    return `
      ${headerHtml}
      <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
        <div style="font-size:16px;font-weight:700;color:#0f172a">${escHtml(knownName)}</div>
        <div style="color:#ef4444;font-weight:600;font-size:11px;margin:4px 0">Not mapped to a DRAIS learner or staff member</div>
        <div style="font-family:monospace;color:#6b7280;font-size:11px">Device User: ${escHtml(scan.device_user_id)} (per device)</div>
        <div style="color:#475569;font-size:11px;margin-top:6px">Go to <strong>Biometric &rsaquo; Orphan templates</strong> to claim this PIN for the right person.</div>
      </div>`;
  }
  return `
    ${headerHtml}
    <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
      <div style="font-size:16px;font-weight:700;color:#ef4444">Unrecognized ID</div>
      <div style="font-family:monospace;color:#6b7280;font-size:11px;margin-top:4px">Device User: ${escHtml(scan.device_user_id)}</div>
      <div style="color:#ef4444;font-weight:600;font-size:11px;margin-top:4px">No mapping AND no device-supplied name yet</div>
    </div>`;
}

/* ── Component ───────────────────────────────────────────────────────── */

/**
 * Phase 7 — global mount.  Reads localStorage['drais.liveScan.disabled']
 * so an operator can opt-out per-browser without code changes (e.g. on a
 * shared kiosk where the popup is unwanted). Default: enabled.
 *
 * Re-evaluates on the storage event so toggling from another tab takes
 * effect without reload.
 */
const LIVE_SCAN_DISABLED_KEY = 'drais.liveScan.disabled';

function readDisabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(LIVE_SCAN_DISABLED_KEY) === '1';
  } catch {
    return false;
  }
}

interface LiveUiSettings {
  live_popup_enabled: number;
  show_for_students: number;
  show_for_staff: number;
  show_for_unknown: number;
  show_for_late_only: number;
  show_sms_status: number;
  sound_enabled: number;
  popup_duration_ms: number;
  mount_scope: string;
}

export function LiveIdentityPopup() {
  const pathname = usePathname();
  const [connected, setConnected] = useState(false);
  const [disabled, setDisabled] = useState(readDisabled);    // per-browser mute
  const [settings, setSettings] = useState<LiveUiSettings | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<number>());

  // Load per-school popup settings once.
  useEffect(() => {
    let alive = true;
    fetch('/api/attendance/live-settings')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (alive && d?.settings) setSettings(d.settings); })
      .catch(() => { /* defaults apply (treat as enabled) */ });
    return () => { alive = false; };
  }, []);

  // Watch for cross-tab preference flips.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LIVE_SCAN_DISABLED_KEY) setDisabled(readDisabled());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // School-level enable flag (defaults to enabled until settings load).
  const schoolEnabled = settings ? settings.live_popup_enabled === 1 : true;

  // mount_scope decides WHERE this global, server-enriched popup runs:
  //   'global'     → everywhere
  //   'attendance' → only on /attendance/* routes
  //   'students'   → nowhere (the fast StudentsListLivePopup owns
  //                  /students/list; this popup stays off to avoid a
  //                  double-fire and the slower enriched lookup)
  // Until settings load we behave as 'global' (current behaviour, no flash).
  const scope = settings?.mount_scope ?? 'global';
  const scopeAllowsHere =
    scope === 'global' ? true
    : scope === 'attendance' ? Boolean(pathname?.startsWith('/attendance'))
    : scope === 'students' ? false
    : true;

  // SSE connection (gated on per-browser mute, per-school enable, scope).
  useEffect(() => {
    if (disabled || !schoolEnabled || !scopeAllowsHere) {
      setConnected(false);
      return;
    }
    const es = new EventSource('/api/attendance/live-scan');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const scan: ScanEvent = JSON.parse(e.data);

        // Deduplicate
        if (seenIds.current.has(scan.scan_id)) return;
        seenIds.current.add(scan.scan_id);
        if (seenIds.current.size > 200) {
          const arr = Array.from(seenIds.current);
          seenIds.current = new Set(arr.slice(-100));
        }

        // ── Scope filter (per-school settings) ──
        const s = settings;
        if (s) {
          const isStudent = scan.person_type === 'student';
          const isStaff = scan.person_type === 'staff';
          const isUnknown = !scan.matched;
          if (isStudent && !s.show_for_students) return;
          if (isStaff && !s.show_for_staff) return;
          if (isUnknown && !s.show_for_unknown) return;
          if (s.show_for_late_only && scan.matched && scan.derived_event !== 'ARRIVED_LATE') return;
        }
        const showSms = s ? s.show_sms_status === 1 : true;
        const soundOn = s ? s.sound_enabled === 1 : true;
        const durationMs = s ? s.popup_duration_ms : 4000;

        if (soundOn) {
          let soundType: 'success' | 'warning' | 'alert' = 'success';
          if (!scan.matched) soundType = 'alert';
          else if (scan.learner && scan.learner.fee_balance > 0) soundType = 'warning';
          playChime(soundType);
        }

        Swal.close();
        Swal.fire({
          html: buildSwalHtml(scan, showSms),
          timer: durationMs && durationMs > 0 ? durationMs : undefined,
          timerProgressBar: durationMs > 0,
          showConfirmButton: durationMs === 0,
          showCloseButton: durationMs === 0,
          allowOutsideClick: durationMs === 0,
          allowEscapeKey: durationMs === 0,
          width: 380,
          padding: '20px',
          backdrop: false,
          position: 'center',
          customClass: { popup: 'swal-scan-popup' },
        });
      } catch {
        // Ignore parse errors (heartbeats)
      }
    };

    es.onerror = () => { setConnected(false); };

    return () => { es.close(); Swal.close(); };
  }, [disabled, schoolEnabled, scopeAllowsHere, settings]);

  // School turned it off → render nothing at all.
  if (!schoolEnabled) return null;

  // Per-browser muted → show a small "OFF" pill so the user can re-enable.
  if (disabled) {
    return (
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.removeItem(LIVE_SCAN_DISABLED_KEY); } catch { /* ignore */ }
          setDisabled(false);
        }}
        title="Live attendance popup is muted on this device — click to enable"
        className="fixed bottom-3 left-3 z-40"
      >
        <div className="flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border bg-slate-100/80 dark:bg-slate-800/30 text-slate-500 border-slate-200 dark:border-slate-700">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
          <Fingerprint className="w-3 h-3" />
          Live Attendance: OFF
        </div>
      </button>
    );
  }

  return (
    <>
      {/* Live indicator — click to mute/unmute this browser (per-browser
          override on top of the school setting). */}
      <button
        type="button"
        onClick={() => {
          try { window.localStorage.setItem(LIVE_SCAN_DISABLED_KEY, '1'); } catch { /* ignore */ }
          setDisabled(true);
        }}
        title="Live attendance popup is ON — click to mute on this device"
        className="fixed bottom-3 left-3 z-40"
      >
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border transition-colors ${
          connected
            ? 'bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            : 'bg-slate-100/80 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <Fingerprint className="w-3 h-3" />
          {connected ? 'Live Attendance: ON' : 'Reconnecting…'}
        </div>
      </button>
    </>
  );
}
