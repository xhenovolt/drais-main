'use client';
/**
 * P1 — bindings hook that merges the static DRCE catalogue with the school's
 * live custom-field set, so every new field defined at /admin/custom-fields
 * shows up automatically in:
 *   • the variable picker
 *   • column / field / cell binding dropdowns
 *   • the comment-rules editor
 *
 * The custom fields are fetched once per session and reused via SWR; refresh
 * happens on focus when needed. Failure is non-fatal — the static catalogue
 * is always returned.
 */
import useSWR from 'swr';
import { AVAILABLE_BINDINGS } from '@/lib/drce/bindingResolver';

export interface BindingEntry {
  group: string;
  binding: string;
  label: string;
  /**
   * When true, the picker should render this binding with a "Coming soon"
   * pill and a tooltip explaining the timeline. The binding still appears
   * in dropdowns so authors can plan templates against future data shapes,
   * but selecting it today yields empty strings in the renderer.
   */
  comingSoon?: boolean;
  /** Optional one-liner shown as a hover tooltip on the picker chip. */
  hint?: string;
}

/**
 * CAFE Phase 1 — assessment bindings exposed as "Coming soon" so template
 * authors can see what's on the way. The data isn't wired into the snapshot
 * pipeline yet (lands in Phase 2 of CAFE); selecting one of these today
 * yields '' in the renderer, by design.
 *
 * Naming follows the pattern of P1 custom fields (student.custom.<code>):
 * the eventual binding lives under student.cafe.* / result.component.* /
 * student.genericSkill.*.
 */
const CAFE_BINDINGS: BindingEntry[] = [
  // CAFE Phase 4 — framework bindings now live (snapshot adapter populates).
  { group: 'CAFE — Framework', binding: 'student.cafe.frameworkName', label: 'Active framework name',
    hint: 'Name of the assessment framework assigned to this learner\'s class for the term.' },
  { group: 'CAFE — Framework', binding: 'student.cafe.frameworkMode', label: 'Framework mode',
    hint: 'numeric · rubric · descriptor · mixed.' },
  // CAFE Phase 2 — these are live bindings now. Snapshot adapter populates
  // them when component data exists for the (student, subject).
  { group: 'CAFE — Components', binding: 'result.components',  label: 'All components (array)',
    hint: 'Per-subject component scores with descriptors and weights.' },
  { group: 'CAFE — Components', binding: 'result.component.theory',     label: 'Theory component',
    hint: 'Example component binding. Schools define their own component codes.' },
  { group: 'CAFE — Components', binding: 'result.component.practical',  label: 'Practical component' },
  { group: 'CAFE — Components', binding: 'result.component.aoi',        label: 'Activity of Integration' },
  { group: 'CAFE — Components', binding: 'result.competencyLevel',      label: 'Rolled-up competency level' },
  { group: 'CAFE — Generic skills', binding: 'student.genericSkills', label: 'All generic skills',
    comingSoon: true, hint: 'Communication · Collaboration · Problem solving · ICT · Creativity · …' },
  { group: 'CAFE — Projects',  binding: 'student.projects',          label: 'Integrated projects',
    comingSoon: true, hint: 'Project portfolio with descriptors and evidence links.' },
];

interface CustomFieldRow {
  code: string; label: string;
}

const fetcher = (url: string) =>
  fetch(url).then(r => r.ok ? r.json() : { fields: [] }).catch(() => ({ fields: [] }));

export function useAvailableBindings(): BindingEntry[] {
  const { data } = useSWR<{ fields: CustomFieldRow[] }>(
    '/api/admin/custom-fields?entity_type=student&active_only=1',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const customEntries: BindingEntry[] = (data?.fields ?? []).map(f => ({
    group:   'Custom Field',
    binding: `student.custom.${f.code}`,
    label:   f.label,
  }));

  // CAFE bindings come last so they appear at the bottom of the picker —
  // they're future-facing and shouldn't push existing groups around.
  return [...AVAILABLE_BINDINGS, ...customEntries, ...CAFE_BINDINGS];
}
