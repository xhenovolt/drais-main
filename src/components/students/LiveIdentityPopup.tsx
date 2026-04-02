'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Fingerprint,
  User,
  Phone,
  Wallet,
  Clock,
  ExternalLink,
  Printer,
  X,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  UserX,
} from 'lucide-react';
import Link from 'next/link';

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

/* ── Component ───────────────────────────────────────────────────────── */

const AUTO_DISMISS_MS = 10_000;

export function LiveIdentityPopup() {
  const [currentScan, setCurrentScan] = useState<ScanEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [connected, setConnected] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const seenIds = useRef(new Set<number>());

  const dismiss = useCallback(() => {
    setVisible(false);
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    // Clear scan data after exit animation
    setTimeout(() => setCurrentScan(null), 400);
  }, []);

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
        setCurrentScan(scan);
        setVisible(true);

        // Auto-dismiss
        if (dismissTimer.current) clearTimeout(dismissTimer.current);
        dismissTimer.current = setTimeout(dismiss, AUTO_DISMISS_MS);
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
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [dismiss]);

  const scan = currentScan;
  const learner = scan?.learner;
  const isUnmatched = scan && !scan.matched;
  const isLowBalance = learner && learner.fee_balance > 0;
  const isStaff = scan?.person_type === 'staff';

  // Status config
  let statusColor = 'from-emerald-500 to-green-600';
  let statusLabel = 'Check-in Successful';
  let StatusIcon = CheckCircle2;
  if (isUnmatched) {
    statusColor = 'from-red-500 to-rose-600';
    statusLabel = 'Unrecognized ID';
    StatusIcon = UserX;
  } else if (isLowBalance) {
    statusColor = 'from-amber-500 to-orange-600';
    statusLabel = 'Low Fee Balance';
    StatusIcon = AlertTriangle;
  } else if (isStaff) {
    statusColor = 'from-blue-500 to-indigo-600';
    statusLabel = 'Staff Check-in';
    StatusIcon = CheckCircle2;
  }

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

      {/* Identity Popup */}
      <AnimatePresence>
        {visible && scan && (
          <motion.div
            key={scan.scan_id}
            initial={{ opacity: 0, y: -30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed top-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)]"
          >
            <div className="relative rounded-2xl overflow-hidden shadow-2xl shadow-black/20 dark:shadow-black/50 border border-white/20 dark:border-slate-700/50 backdrop-blur-xl">

              {/* Status banner */}
              <div className={`bg-gradient-to-r ${statusColor} px-4 py-2.5 flex items-center justify-between`}>
                <div className="flex items-center gap-2 text-white">
                  <StatusIcon className="w-4 h-4" />
                  <span className="text-sm font-bold">{statusLabel}</span>
                </div>
                <button
                  onClick={dismiss}
                  className="p-1 rounded-full hover:bg-white/20 transition-colors text-white/80 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Body */}
              <div className="bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl p-4">

                {/* ── Student scan ─────────────────────────── */}
                {scan.person_type === 'student' && learner && (
                  <div className="space-y-3">
                    {/* Photo + name row */}
                    <div className="flex items-center gap-3">
                      {learner.photo_url ? (
                        <img
                          src={learner.photo_url}
                          alt={`${learner.first_name} ${learner.last_name}`}
                          className="w-16 h-16 rounded-xl object-cover ring-2 ring-white dark:ring-slate-700 shadow-lg"
                        />
                      ) : (
                        <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center ring-2 ring-white dark:ring-slate-700 shadow-lg">
                          <span className="text-xl font-bold text-white">
                            {(learner.first_name?.[0] || '') + (learner.last_name?.[0] || '')}
                          </span>
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">
                          {learner.first_name} {learner.last_name}
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                          {learner.admission_no || `ID: ${scan.device_user_id}`}
                        </p>
                        {(learner.class_name || learner.stream_name) && (
                          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                            {learner.class_name}{learner.stream_name ? ` · ${learner.stream_name}` : ''}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Info grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* Fee Balance */}
                      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${
                        learner.fee_balance > 0
                          ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800'
                          : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                      }`}>
                        <Wallet className={`w-4 h-4 flex-shrink-0 ${
                          learner.fee_balance > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                        }`} />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Balance</p>
                          <p className={`text-sm font-bold truncate ${
                            learner.fee_balance > 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'
                          }`}>
                            {learner.fee_balance > 0
                              ? `UGX ${learner.fee_balance.toLocaleString()}`
                              : 'Cleared'}
                          </p>
                        </div>
                      </div>

                      {/* Today's Attendance */}
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400 flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">Today</p>
                          <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                            {learner.attendance_today} scan{learner.attendance_today !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Guardian */}
                    {learner.guardian && (
                      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                        <Phone className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {learner.guardian.relationship}
                          </p>
                          <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                            {learner.guardian.name} — {learner.guardian.phone}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <Link
                        href={`/students/${learner.student_id}`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        View Profile
                      </Link>
                      {learner.guardian?.phone && (
                        <a
                          href={`tel:${learner.guardian.phone}`}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Contact Parent
                        </a>
                      )}
                      <button
                        onClick={() => window.print()}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Printer className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                {/* ── Staff scan ───────────────────────────── */}
                {scan.person_type === 'staff' && scan.staff && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center ring-2 ring-white dark:ring-slate-700 shadow-lg">
                      <User className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        {scan.staff.first_name} {scan.staff.last_name}
                      </h3>
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold">Staff Member</p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {ioLabel(scan.io_mode)} · {formatTime(scan.check_time)}
                      </p>
                    </div>
                  </div>
                )}

                {/* ── Unmatched scan ───────────────────────── */}
                {!scan.matched && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center ring-2 ring-white dark:ring-slate-700 shadow-lg">
                      <ShieldAlert className="w-7 h-7 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-slate-900 dark:text-white">
                        Unrecognized ID
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        Device User: {scan.device_user_id}
                      </p>
                      <p className="text-[11px] text-red-600 dark:text-red-400 font-semibold mt-0.5">
                        Not mapped to any student or staff
                      </p>
                    </div>
                  </div>
                )}

                {/* Scan metadata footer */}
                <div className="mt-3 pt-2.5 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500">
                  <span className="flex items-center gap-1">
                    <Fingerprint className="w-3 h-3" />
                    {verifyLabel(scan.verify_type)} · {ioLabel(scan.io_mode)}
                  </span>
                  <span>{formatTime(scan.check_time)}</span>
                  {scan.device_name && <span>{scan.device_name}</span>}
                </div>
              </div>

              {/* Auto-dismiss progress bar */}
              <motion.div
                initial={{ scaleX: 1 }}
                animate={{ scaleX: 0 }}
                transition={{ duration: AUTO_DISMISS_MS / 1000, ease: 'linear' }}
                className={`h-0.5 origin-left bg-gradient-to-r ${statusColor}`}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
