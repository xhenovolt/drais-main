'use client';

import { useMemo } from 'react';
import useSWR from 'swr';
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle,
  Database,
  Fingerprint,
  MessageSquareText,
  Package,
  Server,
  ShieldCheck,
  Tag,
  UserRound,
  Users,
} from 'lucide-react';
import changelog from '@/data/changelog.json';

const APP_VERSION = (changelog as any).app_version || '0.0.0';

interface Release {
  version: string;
  date: string;
  release_type: string;
  title: string;
  changes: Array<{ category: string; description: string }>;
  commit: string | null;
}

const TYPE_STYLE: Record<string, string> = {
  major: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  minor: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
  patch: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const fmtDate = (d: string) =>
  new Date(`${d}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const capabilityCards = [
  {
    title: 'School operational visibility',
    description: 'Give school leadership a clear view of attendance, learner records, identity activity, and institutional operations without relying on disconnected manual tracking.',
    icon: Activity,
  },
  {
    title: 'Learner & staff management',
    description: 'Maintain the people, profiles, and operational context schools need to manage learners, staff, teacher assignments, and institutional records.',
    icon: Users,
  },
  {
    title: 'Biometric attendance',
    description: 'Link device-driven attendance activity to the right people and improve accountability through traceable biometric identity records.',
    icon: Fingerprint,
  },
  {
    title: 'Attendance intelligence',
    description: 'Turn attendance into a useful operational signal by evaluating rules, reconciling time and device evidence, and reviewing school-level patterns.',
    icon: BarChart3,
  },
  {
    title: 'Communication',
    description: 'Support parent and guardian communication through structured notification flows that connect service events to action and follow-up.',
    icon: MessageSquareText,
  },
  {
    title: 'Passout & permission management',
    description: 'Manage school movement requests and gate decisions with verification, auditability, and clearer accountability around learner departures and returns.',
    icon: Tag,
  },
  {
    title: 'Identity & institutional records',
    description: 'Keep identity-related records and issuance workflows aligned with school administration rather than isolated or manually managed processes.',
    icon: UserRound,
  },
  {
    title: 'Reporting & management information',
    description: 'Create the operational reporting schools need to review performance, patterns, and management information with more confidence.',
    icon: Package,
  },
];

export default function AboutPage() {
  const releases = (changelog.releases as Release[]).slice().reverse();
  const current = releases.find((r) => r.version === APP_VERSION) || releases[0];

  const { data: health } = useSWR<any>(
    '/api/attendance/health',
    (u: string) => fetch(u, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    { revalidateOnFocus: false },
  );

  const latestReleases = useMemo(() => releases.slice(0, 3), [releases]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="grid gap-8 p-6 md:grid-cols-[1.4fr_0.9fr] md:p-10">
          <div className="space-y-5">
            <div className="inline-flex items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700 dark:border-indigo-900/60 dark:bg-indigo-950/40 dark:text-indigo-300">
              DRAIS
            </div>
            <div className="space-y-3">
              <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white sm:text-4xl">
                School Operational Intelligence Infrastructure
              </h1>
              <p className="text-lg font-medium text-indigo-700 dark:text-indigo-300">Beyond Attendance.</p>
            </div>
            <p className="max-w-2xl text-base leading-7 text-slate-600 dark:text-slate-300">
              DRAIS helps schools connect the operational signals that matter most: attendance, learner records, staff administration, biometric identity, movement, communication, and reporting. It is built to give institutions more visibility, accountability, and control over school operations.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-slate-400">
              Current release
            </p>
            <div className="mt-3 flex items-end gap-3">
              <span className="text-3xl font-bold text-slate-900 dark:text-white">{APP_VERSION}</span>
              <span className="mb-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold uppercase text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                Stable baseline
              </span>
            </div>
            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900/40">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                DRAIS 1.2.0 represents a dependable foundation for the current operational platform, bringing core attendance, identity, communication, and administrative capabilities together into a stable institutional baseline.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <ShieldCheck className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">What DRAIS is</h2>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
              DRAIS is a school operational platform that helps institutions manage the records and signals that shape daily operations. It brings together attendance, learner data, staff administration, communication, and institutional reporting in one managed environment.
            </p>
          </div>
          <div>
            <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
              The product’s purpose is not just to track presence. It helps schools improve operational visibility, maintain accountability, and make better decisions based on institutional information that is structured and auditable.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <div className="mb-5 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Users className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">What DRAIS helps schools manage</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {capabilityCards.map(({ title, description, icon: Icon }) => (
            <article
              key={title}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="mb-4 inline-flex rounded-lg bg-indigo-50 p-2 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">{title}</h3>
              <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Activity className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">Beyond Attendance</h2>
        </div>
        <p className="text-base leading-7 text-slate-600 dark:text-slate-300">
          Attendance is one of the most visible daily signals in a school, but a school’s operational reality extends well beyond whether a learner was present. DRAIS connects attendance with other institutional processes where the current implementation supports that connection — learner records, identity, communication, permissions, reporting, and administration.
        </p>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Package className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">DRAIS 1.2.0 foundation</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Why this matters</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              This release represents a stable operational baseline for the current DRAIS platform. It brings together the current core capabilities into a dependable foundation for real institutional use.
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
            <p className="text-sm font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-400">Product intent</p>
            <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
              The product remains institutionally focused: stable operations, auditable actions, stronger visibility, and dependable day-to-day management across the school environment.
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-5 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Database className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">Latest release narrative</h2>
        </div>
        <div className="space-y-4">
          {latestReleases.map((release) => (
            <div key={release.version} className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white">v{release.version}</span>
                  <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase ${TYPE_STYLE[release.release_type] || TYPE_STYLE.patch}`}>
                    {release.release_type}
                  </span>
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{fmtDate(release.date)}</span>
              </div>
              <p className="mt-3 text-base font-medium text-slate-800 dark:text-slate-100">{release.title}</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-600 dark:text-slate-300">
                {release.changes.map((change, idx) => (
                  <li key={`${release.version}-${idx}`} className="flex gap-2">
                    <span className="mt-1 text-indigo-500">•</span>
                    <span>{change.description}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700 dark:bg-slate-900">
        <div className="mb-4 flex items-center gap-2 text-slate-700 dark:text-slate-200">
          <Server className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
          <h2 className="text-xl font-semibold">System information</h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Application</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">DRAIS v{APP_VERSION}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Database</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">TiDB Cloud (MySQL)</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">Delivery</p>
            <p className="mt-2 text-sm font-medium text-slate-900 dark:text-white">Web · Desktop · Android</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 dark:text-slate-400">System health</p>
            {health?.success ? (
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="h-4 w-4" />
                <span>{health.score}% operational</span>
              </div>
            ) : (
              <div className="mt-2 flex items-center gap-2 text-sm font-medium text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-4 w-4" />
                <span>Health unavailable</span>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
