'use client';

/**
 * Allocation health surface (Phase 8).
 *
 * Consumes /api/academics/allocations/warnings and shows admins the problems
 * they can fix without SQL: subjects with no primary teacher, more than one
 * primary, report rows with no initials, and graded subjects that have no
 * active teacher at all. Each card links back to the allocations page.
 */
import React from 'react';
import useSWR from 'swr';
import { Card, CardContent, CardHeader, CardTitle, Badge } from '@/components/ui';
import { AlertTriangle, CheckCircle2, Loader2, Users, UserX, Type, GraduationCap } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

interface CS { class_id?: number; class_name: string; subject_id?: number; subject_name: string; teachers?: number; count?: number }
interface WarningsRes {
  success: boolean;
  summary: { no_primary: number; multiple_primary: number; missing_initials: number; unallocated_graded: number };
  no_primary: CS[];
  multiple_primary: CS[];
  missing_initials: CS[];
  unallocated_graded: CS[];
}

function Section({ icon: Icon, title, tone, items, render }: {
  icon: React.ElementType; title: string; tone: 'amber' | 'red';
  items: CS[]; render: (c: CS) => string;
}) {
  if (!items.length) return null;
  const toneCls = tone === 'red'
    ? 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 text-red-700 dark:text-red-300'
    : 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300';
  return (
    <div className={`rounded-lg border p-3 ${toneCls}`}>
      <div className="flex items-center gap-2 font-medium text-sm mb-2">
        <Icon className="w-4 h-4" /> {title} <Badge variant="secondary">{items.length}</Badge>
      </div>
      <ul className="space-y-1 text-sm max-h-56 overflow-y-auto">
        {items.slice(0, 100).map((c, i) => (
          <li key={i} className="flex items-center justify-between gap-2">
            <span>{render(c)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export const AllocationWarnings: React.FC = () => {
  const { data, isLoading } = useSWR<WarningsRes>(`${API_BASE}/academics/allocations/warnings`, fetcher);

  if (isLoading) {
    return (
      <Card><CardContent className="flex items-center gap-2 text-sm text-slate-500 py-6">
        <Loader2 className="w-4 h-4 animate-spin" /> Checking allocation health…
      </CardContent></Card>
    );
  }

  const s = data?.summary;
  const total = s ? s.no_primary + s.multiple_primary + s.missing_initials + s.unallocated_graded : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {total === 0
            ? <><CheckCircle2 className="w-5 h-5 text-emerald-600" /> Allocation health</>
            : <><AlertTriangle className="w-5 h-5 text-amber-600" /> Allocation warnings <Badge variant="secondary">{total}</Badge></>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {total === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-400">
            Every allocated subject has a single primary teacher, report initials, and no graded subject is missing a teacher.
          </p>
        ) : (
          <>
            <Section icon={GraduationCap} tone="red" title="Graded subjects with no teacher"
              items={data!.unallocated_graded} render={(c) => `${c.class_name} · ${c.subject_name}`} />
            <Section icon={UserX} tone="amber" title="No primary teacher"
              items={data!.no_primary} render={(c) => `${c.class_name} · ${c.subject_name} (${c.teachers ?? 0} teacher${(c.teachers ?? 0) === 1 ? '' : 's'})`} />
            <Section icon={Users} tone="amber" title="More than one primary teacher"
              items={data!.multiple_primary} render={(c) => `${c.class_name} · ${c.subject_name} (${c.count} primaries)`} />
            <Section icon={Type} tone="amber" title="Missing report initials"
              items={data!.missing_initials} render={(c) => `${c.class_name} · ${c.subject_name}`} />
          </>
        )}
      </CardContent>
    </Card>
  );
};
