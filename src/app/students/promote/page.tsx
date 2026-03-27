'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Play,
  CheckCircle,
  XCircle,
  SkipForward,
  AlertCircle,
  Users,
  Zap,
  RefreshCw,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

// ─── Types ─────────────────────────────────────────────────────
interface ManifestStudent {
  student_id: number;
  name: string;
  previous_class: string | null;
  target_class: string | null;
  target_year_id: number;
  target_term_id: number;
  stream_id: number | null;
}

interface ManifestSummary {
  total_2025_unique_students: number;
  graduates_excluded: number;
  unknown_class_excluded: number;
  already_in_2026_skipped: number;
  to_be_enrolled: number;
}

interface Manifest {
  generated_at: string;
  source: string;
  school_id: number;
  year_2026_id: number;
  term_2026_id: number;
  summary: ManifestSummary;
  students: ManifestStudent[];
}

type StudentStatus = 'pending' | 'ok' | 'skip' | 'error' | 'processing';

interface ProgressEntry {
  student_id: number;
  student_name: string;
  class_name: string;
  status: StudentStatus;
  message?: string;
}

// ─── Component ─────────────────────────────────────────────────
export default function MissionControlPage() {
  const [manifest, setManifest]               = useState<Manifest | null>(null);
  const [classMap, setClassMap]               = useState<Record<string, number>>({}); // name → id
  const [loadError, setLoadError]             = useState<string>('');
  const [loadingManifest, setLoadingManifest] = useState(true);

  // Mission state
  const [running, setRunning]           = useState(false);
  const [done, setDone]                 = useState(false);
  const [completed, setCompleted]       = useState(0);
  const [total, setTotal]               = useState(0);
  const [currentStudent, setCurrentStr] = useState<string>('');
  const [currentClass, setCurrentCls]   = useState<string>('');
  const [inserted, setInserted]         = useState(0);
  const [skipped, setSkipped]           = useState(0);
  const [failed, setFailed]             = useState(0);
  const [progress, setProgress]         = useState<ProgressEntry[]>([]);
  const [showErrors, setShowErrors]     = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const logRef   = useRef<HTMLDivElement>(null);

  // ── Load manifest + classes on mount ──────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/students/promotion-manifest').then(r => r.json()),
      fetch('/api/classes').then(r => r.json()),
    ])
      .then(([manifestRes, classesRes]) => {
        if (!manifestRes.success) {
          setLoadError(manifestRes.error ?? 'Failed to load manifest');
          return;
        }
        setManifest(manifestRes.data);

        // Build name → id map (case-insensitive)
        const map: Record<string, number> = {};
        const arr: Array<{ id: number; name: string }> =
          Array.isArray(classesRes.data)   ? classesRes.data   :
          Array.isArray(classesRes.classes)? classesRes.classes : [];
        for (const cls of arr) {
          map[cls.name.toUpperCase()] = cls.id;
        }
        setClassMap(map);
      })
      .catch(() => setLoadError('Network error loading manifest'))
      .finally(() => setLoadingManifest(false));
  }, []);

  // ── Auto-scroll log ───────────────────────────────────────────
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [progress.length]);

  // ── Build SSE request payload ──────────────────────────────────
  const buildEntries = useCallback(() => {
    if (!manifest) return [];
    return manifest.students
      .filter(s => s.target_class !== null)
      .map(s => {
        const classId = classMap[s.target_class!.toUpperCase()] ?? 0;
        return {
          student_id:       s.student_id,
          class_id:         classId,
          academic_year_id: s.target_year_id,
          term_id:          s.target_term_id,
          study_mode_id:    0,          // optional — stored as null
          stream_id:        s.stream_id ?? undefined,
          student_name:     s.name,
          class_name:       s.target_class!,
        };
      });
  }, [manifest, classMap]);

  // ── Start Mission ──────────────────────────────────────────────
  const startMission = async () => {
    const entries = buildEntries();
    if (entries.length === 0) {
      toast.error('No valid entries to enroll');
      return;
    }

    setRunning(true);
    setDone(false);
    setCompleted(0);
    setTotal(entries.length);
    setInserted(0);
    setSkipped(0);
    setFailed(0);
    setProgress([]);
    setCurrentStr('');
    setCurrentCls('');

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch('/api/students/bulk/enroll-sse', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entries }),
        signal:  ctrl.signal,
      });

      if (!res.ok || !res.body) {
        throw new Error(`Server returned ${res.status}`);
      }

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let   buffer  = '';

      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() ?? '';

        for (const chunk of lines) {
          const dataLine = chunk.trim().replace(/^data:\s*/, '');
          if (!dataLine) continue;
          try {
            const evt = JSON.parse(dataLine);
            handleSSEEvent(evt);
          } catch { /* ignore malformed stream line */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== 'AbortError') {
        toast.error('Stream disconnected — some students may not have been enrolled');
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  };

  const handleSSEEvent = (evt: Record<string, unknown>) => {
    switch (evt.type) {
      case 'start':
        setTotal(evt.total as number);
        break;

      case 'progress': {
        const idx     = evt.index as number;
        const name    = evt.student_name as string;
        const cls     = evt.class_name  as string;
        const status  = evt.status      as StudentStatus;
        const message = evt.message     as string | undefined;

        setCompleted(idx);
        setCurrentStr(name);
        setCurrentCls(cls);

        setProgress(prev => [
          ...prev,
          { student_id: evt.student_id as number, student_name: name, class_name: cls, status, message },
        ]);
        break;
      }

      case 'done':
        setInserted(evt.inserted as number);
        setSkipped(evt.skipped  as number);
        setFailed(evt.failed    as number);
        setDone(true);
        setRunning(false);
        toast.success(`Promotion complete — ${evt.inserted} enrolled`);
        break;
    }
  };

  const abort = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  // ── Helpers ───────────────────────────────────────────────────
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  const errors  = progress.filter(p => p.status === 'error');

  const StatusIcon = ({ status }: { status: StudentStatus }) => {
    switch (status) {
      case 'ok':         return <CheckCircle  size={15} className="text-emerald-500 flex-shrink-0" />;
      case 'error':      return <XCircle      size={15} className="text-red-500    flex-shrink-0" />;
      case 'skip':       return <SkipForward  size={15} className="text-amber-500  flex-shrink-0" />;
      case 'processing': return <RefreshCw    size={15} className="text-indigo-400 flex-shrink-0 animate-spin" />;
      default:           return <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-300 flex-shrink-0" />;
    }
  };

  // ── Render ─────────────────────────────────────────────────────
  if (loadingManifest) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 shadow-lg p-8 max-w-sm text-center">
          <AlertCircle size={40} className="text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-gray-900 mb-2">Manifest not found</h2>
          <p className="text-sm text-gray-500 mb-4">{loadError}</p>
          <p className="text-xs text-gray-400">
            Run <code className="bg-gray-100 px-1 rounded">scripts/promote-2025-to-2026.mjs</code> first to generate it.
          </p>
          <Link href="/students/list" className="mt-5 inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline">
            <ArrowLeft size={14} /> Back to Students
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
      {/* Top Nav */}
      <div className="border-b border-white/10 bg-white/5 backdrop-blur px-6 py-4 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-4">
          <Link href="/students/list" className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/60 hover:text-white">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Zap size={18} className="text-yellow-400" />
              <h1 className="text-lg font-bold text-white">Mission Control</h1>
            </div>
            <p className="text-xs text-white/40">2025 → 2026 Student Promotion Engine</p>
          </div>
        </div>

        {manifest && (
          <div className="text-right">
            <p className="text-xs text-white/40">Manifest generated</p>
            <p className="text-xs text-white/60 font-mono">
              {new Date(manifest.generated_at).toLocaleDateString(undefined, { dateStyle: 'medium' })}
            </p>
          </div>
        )}
      </div>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* ── Summary Cards ── */}
        {manifest && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Unique Students',    value: manifest.summary.total_2025_unique_students, color: 'from-blue-500/20  to-blue-600/10',   text: 'text-blue-300'   },
              { label: 'To Be Enrolled',     value: manifest.summary.to_be_enrolled,             color: 'from-indigo-500/20 to-indigo-600/10', text: 'text-indigo-300' },
              { label: 'Already in 2026',    value: manifest.summary.already_in_2026_skipped,    color: 'from-amber-500/20  to-amber-600/10',  text: 'text-amber-300'  },
              { label: 'P7 Graduates',       value: manifest.summary.graduates_excluded,         color: 'from-emerald-500/20 to-emerald-600/10',text: 'text-emerald-300'},
            ].map(card => (
              <div key={card.label} className={`rounded-xl bg-gradient-to-br ${card.color} border border-white/10 p-4 backdrop-blur`}>
                <p className={`text-2xl font-bold ${card.text}`}>{card.value}</p>
                <p className="text-xs text-white/50 mt-0.5">{card.label}</p>
              </div>
            ))}
          </div>
        )}

        {/* ── Main Progress Panel ── */}
        <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-6 py-5 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${running ? 'bg-indigo-500 animate-pulse' : done ? 'bg-emerald-500' : 'bg-white/10'}`}>
                {done ? <CheckCircle size={16} className="text-white" /> : <Zap size={16} className="text-white" />}
              </div>
              <div>
                <h2 className="text-white font-semibold text-sm">Bulk Enrollment Stream</h2>
                <p className="text-white/40 text-xs">
                  {done
                    ? 'Complete'
                    : running
                    ? `Processing ${completed} / ${total} students`
                    : 'Ready to start'}
                </p>
              </div>
            </div>

            {!running && !done && (
              <button
                onClick={startMission}
                disabled={!manifest || Object.keys(classMap).length === 0}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-fuchsia-500 text-white hover:shadow-lg hover:shadow-indigo-500/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={15} fill="currentColor" /> Start Mission
              </button>
            )}
            {running && (
              <button
                onClick={abort}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border border-red-500/40 text-red-400 hover:bg-red-500/10 transition-all"
              >
                Stop
              </button>
            )}
            {done && (
              <button
                onClick={() => { setDone(false); setProgress([]); setCompleted(0); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm text-white/60 hover:text-white border border-white/10 hover:border-white/30 transition-all"
              >
                <RefreshCw size={14} /> Reset
              </button>
            )}
          </div>

          {/* Progress Bar */}
          <div className="px-6 py-4 border-b border-white/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-white/60 text-xs font-mono">
                {running && currentStudent ? `Now: ${currentStudent} → ${currentClass}` : done ? '✓ All done' : 'Waiting...'}
              </span>
              <span className="text-white/60 text-xs font-mono tabular-nums">{percent}%</span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 via-fuchsia-500 to-pink-500 transition-all duration-300 ease-out"
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Stats row (after done) */}
          {done && (
            <div className="px-6 py-4 border-b border-white/10 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-2xl font-bold text-emerald-400 tabular-nums">{inserted}</p>
                <p className="text-xs text-white/40 mt-0.5">Enrolled</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-400 tabular-nums">{skipped}</p>
                <p className="text-xs text-white/40 mt-0.5">Already existed</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-red-400 tabular-nums">{failed}</p>
                <p className="text-xs text-white/40 mt-0.5">Failed</p>
              </div>
            </div>
          )}

          {/* Live Log */}
          {(running || progress.length > 0) && (
            <div
              ref={logRef}
              className="px-4 py-3 max-h-72 overflow-y-auto space-y-0.5 font-mono text-xs"
            >
              {progress.map((entry, idx) => (
                <div key={idx} className={`flex items-center gap-2.5 px-2 py-1 rounded transition-colors ${
                  entry.status === 'error' ? 'bg-red-500/10' :
                  entry.status === 'skip'  ? 'bg-amber-500/5' : ''
                }`}>
                  <StatusIcon status={entry.status} />
                  <span className="text-white/40 w-5 text-right flex-shrink-0">{idx + 1}.</span>
                  <span className={`flex-1 truncate ${
                    entry.status === 'error' ? 'text-red-300' :
                    entry.status === 'skip'  ? 'text-amber-300/60' : 'text-white/70'
                  }`}>
                    {entry.student_name}
                  </span>
                  <span className="text-white/30 truncate max-w-[120px]">{entry.class_name}</span>
                  {entry.message && (
                    <span className="text-red-400/70 italic truncate max-w-[160px]">{entry.message}</span>
                  )}
                </div>
              ))}

              {running && (
                <div className="flex items-center gap-2.5 px-2 py-1.5">
                  <RefreshCw size={15} className="text-indigo-400 animate-spin flex-shrink-0" />
                  <span className="text-indigo-300/60 italic">Processing {currentStudent}…</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Errors accordion ── */}
        {done && errors.length > 0 && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 overflow-hidden">
            <button
              onClick={() => setShowErrors(v => !v)}
              className="w-full flex items-center justify-between px-5 py-4 text-red-300 text-sm font-semibold hover:bg-red-500/10 transition-colors"
            >
              <span className="flex items-center gap-2">
                <XCircle size={16} /> {errors.length} failed enrollment{errors.length !== 1 ? 's' : ''}
              </span>
              {showErrors ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showErrors && (
              <div className="border-t border-red-500/20 divide-y divide-red-500/10">
                {errors.map((e, idx) => (
                  <div key={idx} className="px-5 py-3 flex items-start gap-3 text-xs font-mono">
                    <span className="text-red-400/60 tabular-nums w-5">{idx + 1}.</span>
                    <span className="text-red-300 font-semibold w-40 truncate">{e.student_name}</span>
                    <span className="text-red-400/50 flex-1">{e.message}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Preview table (not running) ── */}
        {!running && !done && manifest && (
          <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center gap-3">
              <Users size={16} className="text-white/40" />
              <h3 className="text-sm font-semibold text-white/60">
                Preview — {manifest.students.filter(s => s.target_class).length} students to promote
              </h3>
            </div>
            <div className="overflow-x-auto max-h-64">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-slate-900/80 backdrop-blur">
                  <tr className="border-b border-white/10">
                    <th className="text-left px-4 py-2 text-white/30 font-medium w-8">#</th>
                    <th className="text-left px-4 py-2 text-white/30 font-medium">Name</th>
                    <th className="text-left px-4 py-2 text-white/30 font-medium">From</th>
                    <th className="text-left px-4 py-2 text-white/30 font-medium">To</th>
                    <th className="text-left px-4 py-2 text-white/30 font-medium">Class Resolved</th>
                  </tr>
                </thead>
                <tbody className="font-mono divide-y divide-white/5">
                  {manifest.students
                    .filter(s => s.target_class !== null)
                    .slice(0, 100)
                    .map((s, idx) => {
                      const resolvedId = classMap[s.target_class!.toUpperCase()];
                      return (
                        <tr key={s.student_id} className="hover:bg-white/5">
                          <td className="px-4 py-1.5 text-white/20">{idx + 1}</td>
                          <td className="px-4 py-1.5 text-white/70">{s.name}</td>
                          <td className="px-4 py-1.5 text-white/40">{s.previous_class}</td>
                          <td className="px-4 py-1.5 text-indigo-300">{s.target_class}</td>
                          <td className="px-4 py-1.5">
                            {resolvedId
                              ? <span className="text-emerald-400">ID {resolvedId}</span>
                              : <span className="text-red-400">⚠ unresolved</span>}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
              {manifest.students.filter(s => s.target_class).length > 100 && (
                <p className="text-center text-white/20 text-xs py-3 font-mono">
                  … and {manifest.students.filter(s => s.target_class).length - 100} more
                </p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
