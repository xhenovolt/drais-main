'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { BookOpen, ChevronRight, ShieldAlert, FileCode2, Search, X, Compass } from 'lucide-react';
import { DOCS, DOC_SECTIONS, docsInSection, searchDocs, type DocMeta } from './registry';

function DocCard({ doc }: { doc: DocMeta }) {
  return (
    <Link
      href={`/control/docs/${doc.slug}`}
      className="group flex items-start gap-3 p-5 rounded-2xl border border-slate-800 hover:border-indigo-700 bg-slate-900/60 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-bold text-slate-100 text-sm group-hover:text-indigo-300 transition-colors">
          {doc.title}
        </p>
        <p className="text-xs text-slate-400 mt-1 leading-relaxed">{doc.blurb}</p>
        <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
          {doc.topics.map((t) => (
            <span key={t} className="text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">
              {t}
            </span>
          ))}
          <span className="text-[10px] text-slate-600">{doc.minutes} min</span>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0 mt-0.5 group-hover:translate-x-0.5 transition-all" />
    </Link>
  );
}

export default function KnowledgeBaseIndex() {
  const [q, setQ] = useState('');
  const results = useMemo(() => (q.trim() ? searchDocs(q) : null), [q]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="flex items-center gap-2.5 mb-2">
        <BookOpen className="w-6 h-6 text-indigo-400" />
        <h1 className="text-3xl font-extrabold text-slate-100">DRAIS Knowledge Base</h1>
      </div>
      <p className="text-slate-400 max-w-3xl">
        Architecture, decisions, data flow and playbooks — what an engineer needs to understand, extend and
        debug DRAIS without asking someone who was there when it was written.
      </p>

      {/* Search */}
      <div className="not-prose mt-6 max-w-2xl">
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search — a table, a hook, an error, or the symptom you're chasing…"
            className="w-full rounded-xl border border-slate-800 bg-slate-900 pl-11 pr-10 py-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-indigo-600"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {!q && (
          <p className="text-xs text-slate-600 mt-2">
            Try <button onClick={() => setQ('cannot login')} className="text-indigo-400 hover:underline">cannot login</button>
            {' · '}
            <button onClick={() => setQ('snapshot')} className="text-indigo-400 hover:underline">snapshot</button>
            {' · '}
            <button onClick={() => setQ('school_id')} className="text-indigo-400 hover:underline">school_id</button>
            {' · '}
            <button onClick={() => setQ('cron')} className="text-indigo-400 hover:underline">cron</button>
            {' · '}
            <button onClick={() => setQ('new table')} className="text-indigo-400 hover:underline">new table</button>
          </p>
        )}
      </div>

      {/* Results, or the full index */}
      {results ? (
        <section className="mt-8">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
            {results.length} {results.length === 1 ? 'result' : 'results'} for &ldquo;{q}&rdquo;
          </p>
          {results.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-6">
              <p className="text-sm text-slate-400">
                Nothing matched. Search covers titles, topics and keywords — not the body text of each page.
              </p>
              <p className="text-sm text-slate-400 mt-2">
                If you searched for something real that should have matched, add the term to that document&apos;s{' '}
                <code className="text-indigo-300">keywords</code> in{' '}
                <code className="text-indigo-300">src/app/control/docs/registry.ts</code>. The gap is the bug.
              </p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {results.map((d) => <DocCard key={d.slug} doc={d} />)}
            </div>
          )}
        </section>
      ) : (
        <>
          <div className="not-prose mt-6 grid gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-rose-800/60 bg-rose-950/40 p-5">
              <div className="flex items-center gap-2 font-bold text-sm text-rose-300 mb-2">
                <ShieldAlert className="w-4 h-4" />
                Xhenvolt internal — do not surface to schools
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                Gated by the Control Center session. School-facing how-tos belong at{' '}
                <code className="text-indigo-300">/help/guides</code>; public product docs belong on the
                marketing site. Never copy schema, invariants, credentials or operational limits into either.
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-5">
              <div className="flex items-center gap-2 font-bold text-sm text-slate-300 mb-2">
                <FileCode2 className="w-4 h-4 text-slate-500" />
                The repository is the source of truth
              </div>
              <p className="text-sm text-slate-400 leading-relaxed">
                These pages teach architecture and intent. The authoritative details live in{' '}
                <code className="text-indigo-300">docs/adr/</code> and{' '}
                <code className="text-indigo-300">src/lib/&lt;subsystem&gt;/README.md</code>. Every page names
                its sources. Where they disagree, <strong className="text-slate-200">the repo wins</strong> —
                and the page is a bug.
              </p>
            </div>
          </div>

          {DOC_SECTIONS.map((section) => (
            <section key={section} className="mt-10">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-3">{section}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {docsInSection(section).map((d) => <DocCard key={d.slug} doc={d} />)}
              </div>
            </section>
          ))}

          <section className="mt-12 rounded-2xl border border-indigo-900/60 bg-indigo-950/20 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-1">New to the codebase? Start with the course.</h2>
            <p className="text-sm text-slate-400 mb-4">
              The <strong className="text-slate-200">Learn</strong> track is a curriculum, ordered so that a
              developer who knows only JavaScript never meets a concept before it has been taught. Roughly
              3.5 hours of reading, and every example is real DRAIS code — not a generic tutorial.
            </p>
            <ol className="text-sm text-slate-300 space-y-1.5 list-decimal pl-5">
              <li><Link href="/control/docs/learn-react" className="text-indigo-400">React</Link> → <Link href="/control/docs/learn-hooks-deep" className="text-indigo-400">Hooks</Link> — components, state, the dependency array.</li>
              <li><Link href="/control/docs/learn-typescript" className="text-indigo-400">TypeScript</Link> → <Link href="/control/docs/learn-tsx" className="text-indigo-400">TSX</Link> — types, and what the compiler prevents.</li>
              <li><Link href="/control/docs/learn-nextjs" className="text-indigo-400">Next.js</Link> → <Link href="/control/docs/learn-async" className="text-indigo-400">Async</Link> → <Link href="/control/docs/learn-sql" className="text-indigo-400">SQL</Link> — routing, concurrency, the database.</li>
              <li><Link href="/control/docs/learn-patterns" className="text-indigo-400">Good, better, best</Link> — the six patterns, and the bug each one fixed.</li>
              <li><Link href="/control/docs/learn-lab-attendance" className="text-indigo-400">Lab</Link> → <Link href="/control/docs/learn-capstone" className="text-indigo-400">Capstone</Link> — trace a real flow, then ship a feature.</li>
            </ol>
            <p className="text-sm text-slate-400 mt-4">
              Finish the capstone unaided and you can build to DRAIS standards. The reference sections below
              carry the domain knowledge for whatever you are asked to change next.
            </p>
          </section>

          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/40 p-6">
            <h2 className="text-lg font-bold text-slate-100 mb-1">Already know React and TypeScript?</h2>
            <p className="text-sm text-slate-400 mb-4">Skip the course. About two hours to be productive.</p>
            <ol className="text-sm text-slate-300 space-y-2 list-decimal pl-5">
              <li><Link href="/control/docs/system-map" className="text-indigo-400">System map</Link> — the measured shape of what you have inherited.</li>
              <li><Link href="/control/docs/architecture" className="text-indigo-400">Architecture overview</Link> — and the constraints that explain the odd parts.</li>
              <li><Link href="/control/docs/decisions" className="text-indigo-400">Architecture decisions</Link> — intent cannot be read from code.</li>
              <li><Link href="/control/docs/security" className="text-indigo-400">Auth &amp; tenancy</Link> — before touching anything that reads school data.</li>
              <li><Link href="/control/docs/request-lifecycle" className="text-indigo-400">Request lifecycles</Link> — how a click becomes a row.</li>
              <li><Link href="/control/docs/learn-patterns" className="text-indigo-400">Good, better, best</Link> — the house patterns, quickly.</li>
              <li>Then the <Link href="/control/docs/module-attendance" className="text-indigo-400">module guide</Link> for whatever you were asked to change.</li>
            </ol>
            <p className="text-sm text-slate-400 mt-4">
              Before your first pull request: <code className="text-indigo-300">CONTRIBUTING.md</code> and{' '}
              <Link href="/control/docs/playbook-api" className="text-indigo-400">the playbooks</Link>.
            </p>
          </section>

          <p className="mt-8 text-xs text-slate-600 flex items-center gap-1.5">
            <Compass className="w-3.5 h-3.5" />
            {DOCS.length} documents across {DOC_SECTIONS.length} sections.
          </p>
        </>
      )}
    </div>
  );
}
