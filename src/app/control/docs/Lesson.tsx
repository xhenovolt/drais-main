'use client';

/**
 * DRAIS Developer University — lesson primitives.
 *
 * Teaching components, distinct from the reference primitives in ControlDoc.
 * A reference page states what is true; a lesson takes a developer who does
 * not yet know the concept and leaves them able to use it.
 *
 * RULE FOR ALL CURRICULUM CONTENT: every example is real DRAIS code, cited
 * with its path. If a concept cannot be taught from this codebase, it does not
 * belong here — generic React/TypeScript tutorials exist elsewhere and are
 * better than anything we would write.
 */

import React from 'react';
import {
  GraduationCap, Lightbulb, AlertTriangle, CheckCircle2, XCircle,
  ArrowRight, Wrench, HelpCircle, FileCode2, TrendingUp,
} from 'lucide-react';

/** Header for a lesson: what you will be able to do, and what you need first. */
export function LessonIntro({
  level, prereqs, teaches, outcome,
}: {
  level: 'Foundation' | 'Intermediate' | 'Advanced';
  prereqs?: string;
  teaches: string[];
  outcome: React.ReactNode;
}) {
  const levelCls = {
    Foundation: 'bg-emerald-500/15 text-emerald-300 border-emerald-800/60',
    Intermediate: 'bg-amber-500/15 text-amber-300 border-amber-800/60',
    Advanced: 'bg-rose-500/15 text-rose-300 border-rose-800/60',
  }[level];

  return (
    <div className="not-prose my-6 rounded-2xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900">
        <GraduationCap className="w-4 h-4 text-indigo-400" />
        <span className="font-bold text-sm text-slate-200">Lesson</span>
        <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded border ${levelCls}`}>
          {level}
        </span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">By the end you can</p>
          <div className="text-sm text-slate-300 leading-relaxed">{outcome}</div>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Concepts taught</p>
          <div className="flex flex-wrap gap-1.5">
            {teaches.map((t) => (
              <span key={t} className="text-xs px-2 py-1 rounded bg-slate-800 text-indigo-300 font-mono">{t}</span>
            ))}
          </div>
        </div>
        {prereqs && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Assumed first</p>
            <p className="text-sm text-slate-400">{prereqs}</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stop and teach a language concept encountered in the code above.
 * `from` cites the DRAIS file the example came from.
 */
export function Concept({
  name, from, children,
}: { name: string; from?: string; children: React.ReactNode }) {
  return (
    <div className="not-prose my-6 rounded-xl border-l-4 border-indigo-500 border-y border-r border-slate-800 bg-slate-900/60 p-5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4 text-indigo-400 shrink-0" />
        <span className="font-bold text-sm text-slate-100">Concept — <code className="text-indigo-300 font-mono">{name}</code></span>
        {from && (
          <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-500 font-mono">
            <FileCode2 className="w-3 h-3" />{from}
          </span>
        )}
      </div>
      <div className="text-sm text-slate-300 leading-relaxed space-y-3 [&_code]:bg-slate-800 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-indigo-300 [&_code]:text-[13px]">
        {children}
      </div>
    </div>
  );
}

/** Bad → Better → Best. Each stage states its own consequence. */
export function Evolution({ stages }: {
  stages: Array<{
    verdict: 'bad' | 'better' | 'best';
    label: string;
    code: string;
    why: React.ReactNode;
  }>;
}) {
  const style = {
    bad:    { icon: XCircle,      cls: 'border-rose-800/60',    fg: 'text-rose-300',    chip: 'bg-rose-500/15 text-rose-300' },
    better: { icon: TrendingUp,   cls: 'border-amber-800/60',   fg: 'text-amber-300',   chip: 'bg-amber-500/15 text-amber-300' },
    best:   { icon: CheckCircle2, cls: 'border-emerald-800/60', fg: 'text-emerald-300', chip: 'bg-emerald-500/15 text-emerald-300' },
  };
  return (
    <div className="not-prose my-6 space-y-3">
      {stages.map((s, i) => {
        const st = style[s.verdict];
        const Icon = st.icon;
        return (
          <div key={i} className={`rounded-xl border ${st.cls} bg-slate-900/60 overflow-hidden`}>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-slate-800">
              <Icon className={`w-4 h-4 ${st.fg}`} />
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${st.chip}`}>
                {s.verdict}
              </span>
              <span className="text-sm font-semibold text-slate-200">{s.label}</span>
            </div>
            <pre className="overflow-x-auto p-4 text-[12.5px] leading-relaxed text-slate-300 font-mono bg-slate-950 whitespace-pre">{s.code}</pre>
            <div className="px-4 py-3 text-sm text-slate-400 leading-relaxed border-t border-slate-800">{s.why}</div>
          </div>
        );
      })}
    </div>
  );
}

/** A practical task against the real codebase. */
export function Exercise({
  n, title, objective, hints, mistakes, solution,
}: {
  n: number;
  title: string;
  objective: React.ReactNode;
  hints?: React.ReactNode;
  mistakes?: React.ReactNode;
  solution?: React.ReactNode;
}) {
  return (
    <div className="not-prose my-6 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900">
        <Wrench className="w-4 h-4 text-amber-400" />
        <span className="font-bold text-sm text-slate-200">Exercise {n} — {title}</span>
      </div>
      <div className="p-5 space-y-4 text-sm text-slate-300 leading-relaxed">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Objective</p>
          {objective}
        </div>
        {hints && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Hints</p>
            <div className="text-slate-400">{hints}</div>
          </div>
        )}
        {mistakes && (
          <div className="rounded-lg border border-amber-800/60 bg-amber-950/30 p-3.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300 mb-1.5">
              <AlertTriangle className="w-3.5 h-3.5" /> Common mistakes
            </div>
            <div className="text-slate-400">{mistakes}</div>
          </div>
        )}
        {solution && (
          <details className="rounded-lg border border-slate-800 bg-slate-950/60 p-3.5">
            <summary className="cursor-pointer text-xs font-bold text-emerald-300 select-none">
              Recommended solution — try it yourself first
            </summary>
            <div className="mt-3 text-slate-300 space-y-2">{solution}</div>
          </details>
        )}
      </div>
    </div>
  );
}

/** End-of-lesson questions. Educational only — never gates anything. */
export function SelfCheck({ questions }: { questions: Array<{ q: React.ReactNode; a: React.ReactNode }> }) {
  return (
    <div className="not-prose my-6 rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 bg-slate-900">
        <HelpCircle className="w-4 h-4 text-sky-400" />
        <span className="font-bold text-sm text-slate-200">Check yourself</span>
        <span className="ml-auto text-[11px] text-slate-500">Answer before expanding</span>
      </div>
      <div className="divide-y divide-slate-800">
        {questions.map((item, i) => (
          <details key={i} className="p-4 group">
            <summary className="cursor-pointer text-sm text-slate-200 font-medium select-none flex gap-2">
              <ArrowRight className="w-4 h-4 text-slate-600 shrink-0 mt-0.5 group-open:rotate-90 transition-transform" />
              <span>{item.q}</span>
            </summary>
            <div className="mt-3 pl-6 text-sm text-slate-400 leading-relaxed space-y-2">{item.a}</div>
          </details>
        ))}
      </div>
    </div>
  );
}
