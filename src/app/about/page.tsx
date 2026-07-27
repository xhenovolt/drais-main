'use client';

/**
 * DRAIS About / System Information — the product's institutional memory.
 *
 * Answers, permanently and without the founder: what version are we running,
 * what changed, when, why, and is the system stable. Data comes from
 * src/data/changelog.json (generated from git history by
 * scripts/update-changelog.mjs on every commit) and package.json — no
 * hardcoded release text in components.
 *
 * Design: enterprise-boring on purpose. No animations, no hero art.
 * This page is the seed of the future DRAIS Control Center.
 */
import React, { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Info, ChevronDown, ChevronRight, CheckCircle, AlertTriangle,
  GitCommit, Package, Server, Database, Shield, Milestone as MilestoneIcon,
} from 'lucide-react';
import changelog from '@/data/changelog.json';
import milestonesData from '@/data/release-milestones.json';

const APP_VERSION: string = (changelog as any).app_version
  || (changelog.releases[changelog.releases.length - 1] as any)?.version || '0.0.0';

interface Milestone {
  version: string;
  period: { from: string; to: string };
  milestone_title: string;
  summary: string;
  significance: string;
  key_capabilities: string[];
  architectural_changes: string[];
  business_impact: string[];
  related_commits: string[];
}
const MILESTONES: Milestone[] = (milestonesData as any).milestones || [];

interface Release {
  version: string; date: string; release_type: string; title: string;
  changes: Array<{ category: string; description: string }>;
  commit: string | null;
}

const CATEGORY_ORDER = ['NEW', 'IMPROVED', 'FIXED', 'SECURITY', 'PERFORMANCE'];
const CATEGORY_STYLE: Record<string, string> = {
  NEW: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  IMPROVED: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  FIXED: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  SECURITY: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  PERFORMANCE: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
};
const TYPE_STYLE: Record<string, string> = {
  major: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  minor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  patch: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** In-page sections — drive the sticky side/top navigation and scrollspy. */
const SECTIONS: Array<{ id: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview',  label: 'Overview',          Icon: Package },
  { id: 'evolution', label: 'Product evolution',  Icon: MilestoneIcon },
  { id: 'history',   label: 'Release history',    Icon: GitCommit },
  { id: 'system',    label: 'System information',  Icon: Server },
];

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/** Highlights the section currently in view; returns its id. */
function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(ids[0]);
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setActive(visible[0].target.id);
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: [0, 0.25, 0.5, 1] },
    );
    ids.forEach((id) => { const el = document.getElementById(id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return active;
}

export default function AboutPage() {
  const releases = (changelog.releases as Release[]).slice().reverse(); // newest first
  const current = releases.find((r) => r.version === APP_VERSION) || releases[0];
  const [openMinor, setOpenMinor] = useState<string | null>(null);
  const [showTech, setShowTech] = useState<Record<string, boolean>>({});
  const active = useScrollSpy(SECTIONS.map((s) => s.id));

  // System status from the Health Center (auth-gated; hidden if unavailable).
  const { data: health } = useSWR<any>('/api/attendance/health',
    (u: string) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    { revalidateOnFocus: false });

  // Group history by minor series (v1.80.x, v1.81.x, …), newest series first.
  const series = useMemo(() => {
    const map = new Map<string, Release[]>();
    for (const r of releases) {
      const key = r.version.split('.').slice(0, 2).join('.');
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    return [...map.entries()];
  }, [releases]);

  // Map each minor series → its milestone from the curated related_commits
  // (authoritative), not date overlap — the eras were built in a compressed
  // burst with interleaved version numbers, so dates can't separate them.
  const milestoneBySeries = useMemo(() => {
    const map = new Map<string, Milestone>();
    for (const m of MILESTONES) {
      const keys = new Set<string>([m.version.split('.').slice(0, 2).join('.')]);
      for (const rc of m.related_commits) {
        const re = /(\d+)\.(\d+)\.\d+/g;
        let x: RegExpExecArray | null;
        while ((x = re.exec(rc))) keys.add(`${x[1]}.${x[2]}`);
      }
      for (const k of keys) if (!map.has(k)) map.set(k, m);
    }
    return map;
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Mobile · sticky horizontal section nav */}
      <nav className="lg:hidden sticky top-0 z-10 -mx-4 px-4 py-2 mb-4 bg-gray-50/90 dark:bg-gray-900/90 backdrop-blur border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <div className="flex gap-1.5 w-max">
          {SECTIONS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => scrollToSection(id)}
              className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full whitespace-nowrap transition-colors ${
                active === id
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>
      </nav>

      <div className="lg:grid lg:grid-cols-[190px_1fr] lg:gap-8">
        {/* Desktop · sticky mini-sidebar */}
        <aside className="hidden lg:block">
          <nav className="sticky top-6 space-y-0.5">
            <p className="text-[11px] font-semibold text-gray-400 uppercase px-3 mb-2">On this page</p>
            {SECTIONS.map(({ id, label, Icon }) => (
              <button key={id} onClick={() => scrollToSection(id)}
                className={`w-full flex items-center gap-2 text-sm px-3 py-2 rounded-lg text-left transition-colors ${
                  active === id
                    ? 'bg-indigo-50 dark:bg-indigo-900/25 text-indigo-700 dark:text-indigo-300 font-medium'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}>
                <Icon className={`w-4 h-4 flex-shrink-0 ${active === id ? 'text-indigo-500' : 'text-gray-400'}`} /> {label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Content column */}
        <div className="space-y-6 min-w-0">
      {/* ── Section · Overview (identity + current release + changes) ── */}
      <section id="overview" className="scroll-mt-20 space-y-6">
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">DRAIS</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Digital Resource &amp; Attendance Intelligence System</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">School Operational Intelligence Infrastructure · by Xhenvolt Uganda</p>
          </div>
          <div className="text-right">
            <div className="text-xl font-bold text-indigo-600 dark:text-indigo-400">v{APP_VERSION}</div>
            <div className="text-[11px] text-gray-400 uppercase">{process.env.NODE_ENV === 'production' ? 'Production' : 'Development'}</div>
          </div>
        </div>
      </div>

      {/* ── Section 2 · Current version ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5"><Package className="w-4 h-4" /> Current release</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div><div className="text-[11px] text-gray-400">Version</div><div className="font-semibold text-gray-900 dark:text-white">{APP_VERSION}</div></div>
          <div><div className="text-[11px] text-gray-400">Released</div><div className="font-semibold text-gray-900 dark:text-white">{current ? fmtDate(current.date) : '—'}</div></div>
          <div><div className="text-[11px] text-gray-400">Release type</div>
            <span className={`inline-block text-[11px] px-2 py-0.5 rounded font-semibold uppercase ${TYPE_STYLE[current?.release_type] || TYPE_STYLE.patch}`}>{current?.release_type || 'patch'}</span>
          </div>
          <div><div className="text-[11px] text-gray-400">Status</div>
            <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><CheckCircle className="w-3.5 h-3.5" /> Stable</div>
          </div>
        </div>
        {current && <p className="text-sm text-gray-600 dark:text-gray-300 mt-3">{current.title}</p>}
      </div>

      {/* ── Section 3 · What changed in this release ── */}
      {current && (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
          <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5"><GitCommit className="w-4 h-4" /> Changes in v{current.version}</h2>
          <ChangeList changes={current.changes} />
        </div>
      )}

      </section>

      {/* ── Section · Product evolution (milestone layer) ── */}
      <section id="evolution" className="scroll-mt-20">
        <ProductEvolution />
      </section>

      {/* ── Section 4 · Release history — grouped for schools, not a raw
             commit dump. Each series shows its meaning (milestone), a
             category summary and the NOTABLE changes; the full technical
             commit list stays available behind a toggle (Layer 1 intact). */}
      <section id="history" className="scroll-mt-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1.5"><Info className="w-4 h-4" /> Release history</h2>
        <p className="text-[11px] text-gray-400 mb-3">{releases.length} recorded releases, grouped so the evolution is readable — full technical detail is one click away in each group.</p>
        <div className="divide-y divide-gray-100 dark:divide-gray-700/50">
          {series.map(([key, rels]) => {
            const open = openMinor === key;
            const isCurrent = current && current.version.startsWith(key + '.');
            // The story of this series: matching milestone + category counts.
            const from = rels[rels.length - 1].date;
            const milestone = milestoneBySeries.get(key);
            const counts: Record<string, number> = {};
            for (const r of rels) for (const c of r.changes) counts[c.category] = (counts[c.category] || 0) + 1;
            const notable = rels.filter((r) =>
              r.release_type !== 'patch' || r.changes.some((c) => c.category === 'NEW' || c.category === 'SECURITY'));
            const technical = rels.filter((r) => !notable.includes(r));
            return (
              <div key={key}>
                <button onClick={() => setOpenMinor(open ? null : key)}
                  className="w-full flex items-center justify-between gap-2 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 rounded px-1">
                  <span className="min-w-0">
                    <span className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                      {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                      v{key}.x
                      {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300 font-semibold uppercase">Current</span>}
                      {milestone && <span className="text-xs text-gray-500 dark:text-gray-400 truncate font-normal">— {milestone.milestone_title}</span>}
                    </span>
                    <span className="block pl-6 text-[11px] text-gray-400">
                      {CATEGORY_ORDER.filter((c) => counts[c]).map((c) => `${counts[c]} ${c.toLowerCase()}`).join(' · ') || `${rels.length} changes`}
                    </span>
                  </span>
                  <span className="text-xs text-gray-400 whitespace-nowrap">{from.slice(0, 7)}</span>
                </button>
                {open && (
                  <div className="pl-7 pb-3 space-y-3">
                    {milestone && (
                      <p className="text-xs text-gray-600 dark:text-gray-300 -mt-1">{milestone.summary}</p>
                    )}
                    {notable.map((r) => (
                      <div key={r.version}>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="font-mono font-semibold text-gray-800 dark:text-gray-100">v{r.version}</span>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${TYPE_STYLE[r.release_type] || TYPE_STYLE.patch}`}>{r.release_type}</span>
                          <span className="text-xs text-gray-400">{fmtDate(r.date)}</span>
                          {r.commit && <span className="text-[10px] font-mono text-gray-300 dark:text-gray-600">{r.commit.slice(0, 7)}</span>}
                        </div>
                        <ChangeList changes={r.changes} compact />
                      </div>
                    ))}
                    {notable.length === 0 && (
                      <p className="text-xs text-gray-400">Maintenance and refinement work only in this series.</p>
                    )}
                    {technical.length > 0 && (
                      <div>
                        <button onClick={() => setShowTech((p) => ({ ...p, [key]: !p[key] }))}
                          className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline">
                          {showTech[key] ? 'Hide' : 'Show'} technical details ({technical.length} maintenance {technical.length === 1 ? 'change' : 'changes'})
                        </button>
                        {showTech[key] && (
                          <div className="mt-2 space-y-1.5">
                            {technical.map((r) => (
                              <div key={r.version} className="flex items-start gap-2 text-[11px]">
                                <span className="font-mono text-gray-400 whitespace-nowrap">v{r.version}</span>
                                <span className="text-gray-400 whitespace-nowrap">{r.date}</span>
                                <span className="text-gray-500 dark:text-gray-400 min-w-0">{r.title}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Section · System information ── */}
      <section id="system" className="scroll-mt-20 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
        <h2 className="text-sm font-semibold text-gray-500 uppercase mb-3 flex items-center gap-1.5"><Server className="w-4 h-4" /> System information</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
          <div><div className="text-[11px] text-gray-400">Application</div><div className="font-medium text-gray-800 dark:text-gray-100">DRAIS v{APP_VERSION}</div></div>
          <div><div className="text-[11px] text-gray-400 flex items-center gap-1"><Database className="w-3 h-3" /> Database</div><div className="font-medium text-gray-800 dark:text-gray-100">TiDB Cloud (MySQL)</div></div>
          <div><div className="text-[11px] text-gray-400">Platform</div><div className="font-medium text-gray-800 dark:text-gray-100">Web · Desktop · Android</div></div>
          <div><div className="text-[11px] text-gray-400">Environment</div><div className="font-medium text-gray-800 dark:text-gray-100 capitalize">{process.env.NODE_ENV || 'production'}</div></div>
          <div><div className="text-[11px] text-gray-400">Changelog updated</div><div className="font-medium text-gray-800 dark:text-gray-100">{changelog.generated_at ? new Date(changelog.generated_at).toLocaleDateString('en-GB') : '—'}</div></div>
          <div>
            <div className="text-[11px] text-gray-400">System health</div>
            {health?.success ? (
              <a href="/attendance/health" className={`font-medium flex items-center gap-1 ${health.score >= 90 ? 'text-emerald-600 dark:text-emerald-400' : health.score >= 70 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {health.score >= 90 ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
                {health.score}% {health.status === 'healthy' ? 'Operational' : health.status}
              </a>
            ) : (
              <div className="font-medium text-gray-400">—</div>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-400 mt-4 flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5" /> This page shows product information only — no credentials, endpoints or infrastructure details are exposed.
        </p>
      </section>
        </div>{/* /content column */}
      </div>{/* /grid */}
    </div>
  );
}

/** Layer 2 — Product Evolution: the story of DRAIS, era by era. Selecting a
 *  milestone answers "what was DRAIS at this point in time, and why?" */
function ProductEvolution() {
  const [selected, setSelected] = useState<Milestone | null>(null);
  const timeline = [...MILESTONES].reverse(); // newest era first

  if (!MILESTONES.length) return null;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
      <h2 className="text-sm font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1.5"><MilestoneIcon className="w-4 h-4" /> Product evolution</h2>
      <p className="text-[11px] text-gray-400 mb-3">
        {MILESTONES.length} milestones — the meaning behind the release history below. Curated by humans, grounded in commits.
      </p>

      {/* Era timeline */}
      <div className="space-y-1">
        {timeline.map((m) => {
          const open = selected?.milestone_title === m.milestone_title;
          return (
            <div key={m.milestone_title}>
              <button
                onClick={() => setSelected(open ? null : m)}
                className={`w-full flex items-center justify-between gap-2 py-2 px-2 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-700/40 ${open ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {open ? <ChevronDown className="w-4 h-4 text-gray-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />}
                  <span className="text-sm font-medium text-gray-800 dark:text-gray-100 truncate">{m.milestone_title}</span>
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">v{m.version} · {m.period.from.slice(0, 7)}</span>
              </button>

              {open && (
                <div className="ml-8 mr-2 mb-3 mt-1 space-y-3 text-sm border-l-2 border-indigo-200 dark:border-indigo-800 pl-4">
                  <p className="text-gray-700 dark:text-gray-200">{m.summary}</p>

                  <div>
                    <p className="text-[11px] font-semibold text-gray-400 uppercase mb-0.5">Why it mattered</p>
                    <p className="text-xs text-gray-600 dark:text-gray-300">{m.significance}</p>
                  </div>

                  {m.key_capabilities.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-0.5">Capabilities unlocked</p>
                      <ul className="space-y-0.5">
                        {m.key_capabilities.map((c, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-emerald-500 mt-px">✓</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.architectural_changes.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-0.5">Technical evolution</p>
                      <ul className="space-y-0.5">
                        {m.architectural_changes.map((c, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-indigo-400 mt-px">▸</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.business_impact.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-0.5">Impact</p>
                      <ul className="space-y-0.5">
                        {m.business_impact.map((c, i) => (
                          <li key={i} className="text-xs text-gray-600 dark:text-gray-300 flex items-start gap-1.5">
                            <span className="text-amber-500 mt-px">●</span> {c}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {m.related_commits.length > 0 && (
                    <div>
                      <p className="text-[11px] font-semibold text-gray-400 uppercase mb-0.5">Related commits</p>
                      <ul className="space-y-0.5">
                        {m.related_commits.map((c, i) => (
                          <li key={i} className="text-[11px] font-mono text-gray-400 dark:text-gray-500">{c}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ChangeList({ changes, compact = false }: { changes: Release['changes']; compact?: boolean }) {
  const grouped = useMemo(() => {
    const g = new Map<string, string[]>();
    for (const c of changes) {
      if (!g.has(c.category)) g.set(c.category, []);
      g.get(c.category)!.push(c.description);
    }
    return CATEGORY_ORDER.filter((k) => g.has(k)).map((k) => [k, g.get(k)!] as const);
  }, [changes]);

  return (
    <div className={compact ? 'mt-1 space-y-1' : 'space-y-3'}>
      {grouped.map(([cat, items]) => (
        <div key={cat} className={compact ? 'flex items-start gap-2' : ''}>
          <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded font-semibold ${CATEGORY_STYLE[cat] || CATEGORY_STYLE.IMPROVED} ${compact ? 'mt-0.5 flex-shrink-0' : 'mb-1'}`}>{cat}</span>
          <ul className={compact ? 'min-w-0' : 'space-y-1'}>
            {items.map((d, i) => (
              <li key={i} className="text-sm text-gray-700 dark:text-gray-200 flex items-start gap-1.5">
                {!compact && <span className="text-emerald-500 mt-0.5">✓</span>}
                <span className={compact ? 'text-xs text-gray-600 dark:text-gray-300' : ''}>{d}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}
