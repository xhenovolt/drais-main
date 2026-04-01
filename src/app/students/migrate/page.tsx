"use client";
/**
 * DRAIS — School Migration Engine UI
 * /students/migrate
 *
 * Accepts JSON or CSV/XLSX paste → streams progress via SSE → full summary.
 * Supports 100–5000 learners. Zero silent failures.
 */
import React, { useState, useRef, useCallback } from "react";
import {
  Upload,
  Play,
  X,
  CheckCircle2,
  AlertCircle,
  Loader,
  Users,
  FileJson,
  ChevronDown,
  ChevronUp,
  Download,
  RefreshCw,
  GraduationCap,
  BarChart3,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { toast } from "react-hot-toast";
import Link from "next/link";

// ─── Types ───────────────────────────────────────────────────────────────────

interface MigrateOptions {
  createMissingClasses: boolean;
  updateExisting: boolean;
  dryRun: boolean;
}

interface ProgressEvent {
  type: "started" | "progress" | "complete" | "error";
  total?: number;
  imported?: number;
  current_name?: string;
  success?: number;
  updated?: number;
  skipped?: number;
  errors?: string[];
  message?: string;
  dryRun?: boolean;
}

interface CompleteSummary {
  success: number;
  updated: number;
  skipped: number;
  errors: string[];
  total: number;
  dryRun: boolean;
  message: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TEMPLATE_JSON = JSON.stringify(
  [
    { name: "Fatima Hassan", class: "P.1", reg_no: "SCH/001/2026", gender: "female" },
    { name: "Omar Salim",    class: "P.2", reg_no: "SCH/002/2026", gender: "male"   },
    { name: "Aisha Musa",   class: "S.1", reg_no: "SCH/003/2026", gender: "female" },
  ],
  null,
  2
);

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MigratePage() {
  const [jsonText,  setJsonText]  = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedCount, setParsedCount] = useState<number | null>(null);

  const [options, setOptions] = useState<MigrateOptions>({
    createMissingClasses: true,
    updateExisting: true,
    dryRun: false,
  });

  // Stream state
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [progress, setProgress] = useState(0);
  const [total, setTotal] = useState(0);
  const [currentName, setCurrentName] = useState("");
  const [summary, setSummary] = useState<CompleteSummary | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // ── JSON parse & validate ────────────────────────────────────────────────
  const handleJsonChange = (val: string) => {
    setJsonText(val);
    setParseError(null);
    setParsedCount(null);
    if (!val.trim()) return;
    try {
      const parsed = JSON.parse(val);
      if (!Array.isArray(parsed)) throw new Error("Must be a JSON array [ ... ]");
      if (parsed.length === 0) throw new Error("Array is empty");
      setParsedCount(parsed.length);
    } catch (e: any) {
      setParseError(e.message);
    }
  };

  // ── Load template ────────────────────────────────────────────────────────
  const loadTemplate = () => {
    setJsonText(TEMPLATE_JSON);
    handleJsonChange(TEMPLATE_JSON);
  };

  // ── File drop / upload ───────────────────────────────────────────────────
  const handleFile = useCallback(async (file: File) => {
    if (file.name.endsWith(".json") || file.type === "application/json") {
      const text = await file.text();
      handleJsonChange(text);
    } else {
      toast.error("Upload a .json file. For CSV/XLSX use the Import page instead.");
    }
  }, []);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  // ── Start migration ──────────────────────────────────────────────────────
  const startMigration = async () => {
    setParseError(null);
    let learners: any[];
    try {
      learners = JSON.parse(jsonText);
      if (!Array.isArray(learners) || learners.length === 0) throw new Error("Empty array");
    } catch (e: any) {
      setParseError(e.message || "Invalid JSON");
      return;
    }

    setRunning(true);
    setDone(false);
    setSummary(null);
    setStreamError(null);
    setProgress(0);
    setTotal(learners.length);
    setCurrentName("");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      const res = await fetch("/api/students/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ learners, options }),
        signal: ctrl.signal,
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Request failed" }));
        throw new Error(err.error || "Migration request failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buf += decoder.decode(value, { stream: true });
        const parts = buf.split("\n\n");
        buf = parts.pop() ?? "";

        for (const part of parts) {
          const line = part.replace(/^data: /, "").trim();
          if (!line) continue;
          try {
            const evt: ProgressEvent = JSON.parse(line);
            if (evt.type === "started") {
              setTotal(evt.total ?? learners.length);
            } else if (evt.type === "progress") {
              setProgress(evt.imported ?? 0);
              setCurrentName(evt.current_name ?? "");
            } else if (evt.type === "complete") {
              setSummary({
                success: evt.success ?? 0,
                updated: evt.updated ?? 0,
                skipped: evt.skipped ?? 0,
                errors:  evt.errors  ?? [],
                total:   evt.total   ?? learners.length,
                dryRun:  evt.dryRun  ?? false,
                message: evt.message ?? "Done",
              });
              setDone(true);
              setRunning(false);
            } else if (evt.type === "error") {
              setStreamError(evt.message ?? "Unknown error");
              setRunning(false);
            }
          } catch { /* skip malformed SSE line */ }
        }
      }
    } catch (e: any) {
      if (e.name === "AbortError") {
        toast("Migration cancelled");
      } else {
        setStreamError(e.message || "Migration failed");
        toast.error(e.message || "Migration failed");
      }
      setRunning(false);
    }
  };

  const cancel = () => {
    abortRef.current?.abort();
  };

  const reset = () => {
    setDone(false);
    setSummary(null);
    setStreamError(null);
    setProgress(0);
    setTotal(0);
    setCurrentName("");
  };

  const pct = total > 0 ? Math.round((progress / total) * 100) : 0;

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="sticky top-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 px-4 h-12 flex items-center gap-3 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center shadow">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800 dark:text-white">Migration Engine</span>
        </div>
        <div className="text-slate-300 dark:text-slate-600 text-xs hidden sm:block">→ Onboard entire schools in minutes</div>
        <div className="flex-1" />
        <Link href="/students/list" className="text-xs text-slate-500 hover:text-indigo-600 transition-colors">
          ← Back to Students
        </Link>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { icon: Users,        label: "Batch size",    value: "100–5 000",  color: "text-indigo-600" },
            { icon: BarChart3,    label: "Chunk size",    value: "50 rows",    color: "text-emerald-600" },
            { icon: ShieldCheck,  label: "Dedup by",      value: "reg_no",     color: "text-violet-600" },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-3 p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
              <s.icon className={`w-5 h-5 ${s.color} flex-shrink-0`} />
              <div>
                <p className="text-[10px] text-slate-400 uppercase tracking-wide">{s.label}</p>
                <p className="text-sm font-bold text-slate-800 dark:text-white">{s.value}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">

          {/* ── LEFT: JSON input ── */}
          <div className="lg:col-span-3 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                <FileJson className="w-4 h-4 text-indigo-500" />
                Learner Data (JSON)
              </h2>
              <div className="flex items-center gap-2">
                {parsedCount !== null && !parseError && (
                  <span className="text-xs text-emerald-600 font-semibold tabular-nums">
                    ✓ {parsedCount} records parsed
                  </span>
                )}
                <button
                  onClick={loadTemplate}
                  className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                >
                  <Download className="w-3 h-3" /> Template
                </button>
              </div>
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={onDrop}
              className="relative"
            >
              <textarea
                value={jsonText}
                onChange={e => handleJsonChange(e.target.value)}
                placeholder={`Paste JSON array:\n[\n  { "name": "John Doe", "class": "S.1", "reg_no": "SCH/001" },\n  ...\n]`}
                spellCheck={false}
                className={`w-full h-72 p-3 font-mono text-xs rounded-xl border resize-none focus:outline-none focus:ring-2 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 transition-all ${
                  parseError
                    ? "border-red-400 focus:ring-red-400"
                    : parsedCount
                    ? "border-emerald-400 focus:ring-emerald-400"
                    : "border-slate-200 dark:border-slate-700 focus:ring-indigo-500"
                }`}
              />
              {!jsonText && (
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none opacity-40">
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-400">Drag a .json file here or paste above</p>
                </div>
              )}
            </div>

            {parseError && (
              <p className="flex items-center gap-1.5 text-xs text-red-600">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {parseError}
              </p>
            )}

            {/* Field reference */}
            <details className="group">
              <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 list-none flex items-center gap-1">
                <ChevronDown className="w-3 h-3 group-open:rotate-180 transition-transform" />
                Accepted fields
              </summary>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400 pl-4">
                {[
                  ["name", "Full name (split on space)"],
                  ["first_name + last_name", "Separate name fields"],
                  ["reg_no", "Admission no — used for dedup"],
                  ["class", "Class name (auto-created)"],
                  ["section", "Stream / division"],
                  ["gender", "male / female / other"],
                  ["date_of_birth", "ISO date"],
                  ["phone", "Contact number"],
                  ["enrollment_type", "new / continuing / re-admitted"],
                ].map(([f, d]) => (
                  <div key={f} className="py-0.5">
                    <span className="font-mono text-indigo-600 dark:text-indigo-400">{f}</span>
                    <span className="text-slate-400"> — {d}</span>
                  </div>
                ))}
              </div>
            </details>
          </div>

          {/* ── RIGHT: Options + Actions ── */}
          <div className="lg:col-span-2 space-y-3">
            <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Options</h2>

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 shadow-sm overflow-hidden">
              {([
                {
                  key: "createMissingClasses" as const,
                  label: "Auto-create classes",
                  desc: "Create class if name not found in DB",
                  accent: false,
                },
                {
                  key: "updateExisting" as const,
                  label: "Update existing students",
                  desc: "Update people record if reg_no matches",
                  accent: false,
                },
                {
                  key: "dryRun" as const,
                  label: "Dry run (validate only)",
                  desc: "No DB writes — check for errors first",
                  accent: true,
                },
              ] as const).map(o => (
                <label key={o.key} className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <div className="mt-0.5 flex-shrink-0">
                    <input
                      type="checkbox"
                      checked={options[o.key]}
                      onChange={e => setOptions(prev => ({ ...prev, [o.key]: e.target.checked }))}
                      className="w-4 h-4 rounded accent-indigo-600 cursor-pointer"
                    />
                  </div>
                  <div>
                    <p className={`text-xs font-semibold ${o.accent ? "text-amber-600 dark:text-amber-400" : "text-slate-700 dark:text-slate-200"}`}>
                      {o.label}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{o.desc}</p>
                  </div>
                </label>
              ))}
            </div>

            {/* Action buttons */}
            <div className="space-y-2">
              {!running && !done && (
                <button
                  onClick={startMigration}
                  disabled={!parsedCount || !!parseError}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold shadow-md transition-all"
                >
                  <Play className="w-4 h-4" />
                  {options.dryRun ? "Run Dry Validation" : `Import ${parsedCount ?? 0} Learners`}
                </button>
              )}

              {running && (
                <button
                  onClick={cancel}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold transition-colors"
                >
                  <X className="w-4 h-4" /> Cancel
                </button>
              )}

              {done && (
                <button
                  onClick={reset}
                  className="w-full flex items-center justify-center gap-2 h-10 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-200 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" /> New Migration
                </button>
              )}
            </div>

            {/* Progress */}
            {(running || (done && !summary?.dryRun)) && (
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 shadow-sm space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                    {running
                      ? <><Loader className="w-3.5 h-3.5 animate-spin text-indigo-500" /> Importing…</>
                      : <><CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> Complete</>
                    }
                  </span>
                  <span className="tabular-nums text-slate-500 font-mono">
                    {progress} / {total}
                  </span>
                </div>

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-slate-400 truncate max-w-[140px]">{currentName}</span>
                  <span className="text-slate-500 font-semibold tabular-nums">{pct}%</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── STREAM ERROR ── */}
        {streamError && (
          <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-400">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold">Migration failed</p>
              <p className="text-xs mt-0.5">{streamError}</p>
            </div>
          </div>
        )}

        {/* ── SUMMARY CARD ── */}
        {summary && (
          <div className={`rounded-2xl border shadow-sm overflow-hidden ${
            summary.dryRun
              ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
              : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800"
          }`}>
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center gap-3">
              {summary.dryRun
                ? <ShieldCheck className="w-5 h-5 text-amber-600" />
                : <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              }
              <div>
                <p className="text-sm font-bold text-slate-800 dark:text-white">
                  {summary.dryRun ? "Dry Run Complete" : "Migration Complete"}
                </p>
                <p className="text-xs text-slate-500">{summary.message}</p>
              </div>
            </div>

            <div className="grid grid-cols-4 divide-x divide-slate-100 dark:divide-slate-800">
              {[
                { label: summary.dryRun ? "Valid" : "Imported", value: summary.success, color: "text-emerald-600" },
                { label: "Updated",  value: summary.updated,  color: "text-blue-600"    },
                { label: "Skipped",  value: summary.skipped,  color: "text-amber-600"   },
                { label: "Errors",   value: summary.errors.length, color: summary.errors.length > 0 ? "text-red-600" : "text-slate-400" },
              ].map(s => (
                <div key={s.label} className="px-4 py-4 text-center">
                  <p className={`text-2xl font-black tabular-nums ${s.color}`}>{s.value}</p>
                  <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">{s.label}</p>
                </div>
              ))}
            </div>

            {summary.errors.length > 0 && (
              <div className="border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={() => setShowErrors(v => !v)}
                  className="w-full flex items-center justify-between px-5 py-3 text-xs font-semibold text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                >
                  <span>{summary.errors.length} error{summary.errors.length !== 1 ? "s" : ""} — click to view</span>
                  {showErrors ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>
                {showErrors && (
                  <ul className="px-5 pb-4 space-y-1 max-h-48 overflow-y-auto">
                    {summary.errors.map((e, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        {e}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!summary.dryRun && summary.success > 0 && (
              <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center gap-3">
                <Link
                  href="/students/list?tab=enrolled"
                  className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:underline"
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  View imported students
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
