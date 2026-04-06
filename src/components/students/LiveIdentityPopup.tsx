'use client';

import { useEffect, useState, useRef } from 'react';
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
  guardian: Guardian | null;
}

interface ScanEvent {
  scan_id: number;
  device_user_id: string;
  check_time: string;
  verify_type: number | null;
  io_mode: number | null;
  matched: boolean;
  person_type: 'student' | 'staff' | 'unmatched';
  device_name: string | null;
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

function buildSwalHtml(scan: ScanEvent): string {
  const learner = scan.learner;

  let headerBg = '#10b981'; // emerald
  let headerLabel = 'Check-in Successful';
  if (!scan.matched) {
    headerBg = '#ef4444'; headerLabel = 'Unrecognized ID';
  } else if (learner && learner.fee_balance > 0) {
    headerBg = '#f59e0b'; headerLabel = 'Low Fee Balance';
  } else if (scan.person_type === 'staff') {
    headerBg = '#6366f1'; headerLabel = 'Staff Check-in';
  }

  const headerHtml = `
    <div style="background:${headerBg};color:#fff;padding:10px 16px;margin:-20px -20px 12px;border-radius:12px 12px 0 0;font-weight:700;font-size:14px;text-align:left">
      ${escHtml(headerLabel)}
    </div>`;

  // ── Student ──
  if (scan.person_type === 'student' && learner) {
    const photoHtml = learner.photo_url
      ? `<img src="${escHtml(learner.photo_url)}" alt="" style="width:56px;height:56px;border-radius:12px;object-fit:cover" />`
      : `<div style="width:56px;height:56px;border-radius:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;color:#fff;font-size:20px;font-weight:700;flex-shrink:0">${escHtml((learner.first_name?.[0] ?? '') + (learner.last_name?.[0] ?? ''))}</div>`;

    const classHtml = learner.class_name
      ? `${escHtml(learner.class_name)}${learner.stream_name ? ' · ' + escHtml(learner.stream_name) : ''}`
      : 'Admitted · Not Yet Enrolled';

    const balanceBg = learner.fee_balance > 0 ? '#fff7ed' : '#f0fdf4';
    const balanceColor = learner.fee_balance > 0 ? '#b45309' : '#15803d';

    const guardianHtml = learner.guardian
      ? `<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:#eff6ff;border-radius:8px;border:1px solid #bfdbfe;margin-top:8px">
          <span style="font-size:11px;color:#374151">👤 <strong>${escHtml(learner.guardian.name)}</strong> (${escHtml(learner.guardian.relationship)})<br/><a href="tel:${escHtml(learner.guardian.phone)}" style="color:#2563eb;text-decoration:none">${escHtml(learner.guardian.phone)}</a></span>
        </div>`
      : '';

    const profileUrl = `/students/${learner.student_id}`;

    return `
      ${headerHtml}
      <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:10px">
          ${photoHtml}
          <div style="flex:1;min-width:0">
            <div style="font-weight:700;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escHtml(learner.first_name)} ${escHtml(learner.last_name)}</div>
            <div style="font-size:11px;color:#6b7280;font-family:monospace">${escHtml(learner.admission_no || 'ID: ' + scan.device_user_id)}</div>
            <div style="font-size:11px;color:#4f46e5;font-weight:600;margin-top:2px">${classHtml}</div>
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
          <a href="${escHtml(profileUrl)}" onclick="window.location.href='${escHtml(profileUrl)}';Swal.close();return false;" style="flex:1;display:block;text-align:center;padding:8px;background:#4f46e5;color:#fff;border-radius:8px;font-weight:600;font-size:12px;text-decoration:none">View Profile</a>
          ${learner.guardian?.phone ? `<a href="tel:${escHtml(learner.guardian.phone)}" style="padding:8px 12px;border:1px solid #93c5fd;color:#2563eb;border-radius:8px;font-size:12px;font-weight:600;text-decoration:none">Call Parent</a>` : ''}
        </div>
        <div style="margin-top:8px;padding-top:8px;border-top:1px solid #e5e7eb;font-size:10px;color:#9ca3af;display:flex;justify-content:space-between">
          <span>${escHtml(verifyLabel(scan.verify_type))} · ${escHtml(ioLabel(scan.io_mode))}</span>
          <span>${escHtml(formatTime(scan.check_time))}</span>
          ${scan.device_name ? `<span>${escHtml(scan.device_name)}</span>` : ''}
        </div>
      </div>`;
  }

  // ── Staff ──
  if (scan.person_type === 'staff' && scan.staff) {
    return `
      ${headerHtml}
      <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
        <div style="font-size:16px;font-weight:700">${escHtml(scan.staff.first_name)} ${escHtml(scan.staff.last_name)}</div>
        <div style="color:#6366f1;font-weight:600;margin:2px 0 6px">Staff Member</div>
        <div style="color:#6b7280;font-size:11px">${escHtml(ioLabel(scan.io_mode))} · ${escHtml(formatTime(scan.check_time))}</div>
      </div>`;
  }

  // ── Unmatched ──
  return `
    ${headerHtml}
    <div style="font-family:system-ui,sans-serif;font-size:13px;color:#1e293b;text-align:left">
      <div style="font-size:16px;font-weight:700;color:#ef4444">Unrecognized ID</div>
      <div style="font-family:monospace;color:#6b7280;font-size:11px;margin-top:4px">Device User: ${escHtml(scan.device_user_id)}</div>
      <div style="color:#ef4444;font-weight:600;font-size:11px;margin-top:4px">Not mapped to any student or staff</div>
    </div>`;
}

/* ── Component ───────────────────────────────────────────────────────── */

export function LiveIdentityPopup() {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<number>());

  // SSE connection
  useEffect(() => {
    const es = new EventSource('/api/attendance/live-scan');
    eventSourceRef.current = es;

    es.onopen = () => setConnected(true);

    es.onmessage = (e) => {
      try {
        const scan: ScanEvent = JSON.parse(e.data);

        // Deduplicate
        if (seenIds.current.has(scan.scan_id)) return;
        seenIds.current.add(scan.scan_id);

        // Keep set small
        if (seenIds.current.size > 200) {
          const arr = Array.from(seenIds.current);
          seenIds.current = new Set(arr.slice(-100));
        }

        // Determine sound type
        let soundType: 'success' | 'warning' | 'alert' = 'success';
        if (!scan.matched) {
          soundType = 'alert';
        } else if (scan.learner && scan.learner.fee_balance > 0) {
          soundType = 'warning';
        }

        playChime(soundType);

        // Close any previous popup and show new one
        Swal.close();
        Swal.fire({
          html: buildSwalHtml(scan),
          timer: 4000,
          timerProgressBar: true,
          showConfirmButton: false,
          showCloseButton: false,
          allowOutsideClick: false,
          allowEscapeKey: false,
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

    es.onerror = () => {
      setConnected(false);
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
      Swal.close();
    };
  }, []);

  return (
    <>
      {/* SSE connection indicator */}
      <div className="fixed bottom-3 left-3 z-40">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-medium backdrop-blur-md border transition-colors ${
          connected
            ? 'bg-emerald-50/80 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800'
            : 'bg-slate-100/80 dark:bg-slate-800/30 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
          <Fingerprint className="w-3 h-3" />
          {connected ? 'Live Scan' : 'Reconnecting…'}
        </div>
      </div>
    </>
  );
}
