'use client';

import { useMemo, useState } from 'react';
import { Eye, EyeOff, RotateCcw, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import type { DRCEDocument, DRCESection } from '@/lib/drce/schema';
import type {
  PersistedOverride,
  RenderOverride,
  OverrideKind,
} from '@/lib/drce/overrides';

export interface OverridesPanelProps {
  snapshotId:    string;
  /** The base DRCE document. Used to enumerate available sections. */
  document:      DRCEDocument;
  /** All overrides for the snapshot (snapshot-wide + every student). */
  overrides:     PersistedOverride[];
  /** Currently-previewed student db id; null = no per-student scope yet. */
  studentDbId:   number | null;
  /** Subjects available for the currently-previewed student. */
  subjects:      Array<{ id: string | number; name: string }>;
  /** Called after any successful write so the parent can refetch overrides. */
  onChanged:     () => void;
}

/**
 * Phase 3.2 — visual override editor.
 *
 * Renders next to the DRCE preview. Three groups:
 *   1. Document sections — toggle hide_section overrides (snapshot-wide).
 *   2. Subjects for current student — toggle hide_subject overrides
 *      (per-student) on the currently previewed learner.
 *   3. Active overrides — list everything in scope, with per-row remove.
 *
 * All writes go through the Phase 3.1 CRUD API. Optimistic update is
 * deliberately NOT used: every mutation refetches via `onChanged()` so
 * the panel always reflects the canonical server state and concurrent
 * edits from other tabs reconcile cleanly.
 */
export function OverridesPanel(props: OverridesPanelProps) {
  const { snapshotId, document, overrides, studentDbId, subjects, onChanged } = props;
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Indexed lookups for the toggles.
  const hiddenSectionIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of overrides) {
      if (o.override.kind === 'hide_section') set.add(o.override.targetId);
    }
    return set;
  }, [overrides]);

  // hide_subject overrides for the current student (snapshot-wide entries
  // also count, since they apply to everyone).
  const hiddenSubjectIds = useMemo(() => {
    const set = new Set<string>();
    for (const o of overrides) {
      if (o.override.kind !== 'hide_subject') continue;
      if (o.studentDbId === null || o.studentDbId === studentDbId) {
        set.add(o.override.targetId);
      }
    }
    return set;
  }, [overrides, studentDbId]);

  // Only overrides that apply to the currently-previewed student.
  const activeForStudent = useMemo(() => {
    return overrides
      .filter(o => o.studentDbId === null || o.studentDbId === studentDbId)
      .sort((a, b) => a.id - b.id);
  }, [overrides, studentDbId]);

  async function postOverride(override: RenderOverride, scopedToStudent: boolean) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`/api/snapshots/${encodeURIComponent(snapshotId)}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_db_id: scopedToStudent ? studentDbId : null,
          kind:          override.kind,
          target_id:     override.targetId,
          payload:       'payload' in override ? override.payload : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Write failed');
    } finally {
      setBusy(false);
    }
  }

  async function deleteOverrideRow(overrideId: number) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(
        `/api/snapshots/${encodeURIComponent(snapshotId)}/overrides/${overrideId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  /**
   * Toggle a hide-style override. If currently hidden, find the matching
   * override row and delete it. Otherwise, post a new one.
   */
  async function toggleHide(args: {
    kind:        Extract<OverrideKind, 'hide_section' | 'hide_subject'>;
    targetId:    string;
    scopedToStudent: boolean;
  }) {
    const matching = overrides.find(o =>
      o.override.kind === args.kind &&
      o.override.targetId === args.targetId &&
      (args.scopedToStudent
        ? o.studentDbId === studentDbId
        : o.studentDbId === null),
    );
    if (matching) {
      await deleteOverrideRow(matching.id);
    } else {
      await postOverride({ kind: args.kind, targetId: args.targetId }, args.scopedToStudent);
    }
  }

  async function clearStudentOverrides() {
    if (studentDbId === null) return;
    if (!confirm('Remove every override applied to this student?')) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(
        `/api/snapshots/${encodeURIComponent(snapshotId)}/overrides?student_db_id=${studentDbId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Clear failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden text-sm">
      <button
        onClick={() => setCollapsed(c => !c)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900"
      >
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Layers className="w-4 h-4" />
          Overrides
          <span className="text-xs text-slate-500">
            ({activeForStudent.length} active{studentDbId !== null ? ' for this student' : ''})
          </span>
        </span>
        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {error && (
            <div className="px-3 py-2 text-xs text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300">
              {error}
            </div>
          )}

          {/* — Sections — */}
          <Group title="Document sections" hint="Toggles apply to every learner.">
            {document.sections.length === 0 && (
              <div className="text-xs text-slate-500">No sections in this template.</div>
            )}
            {document.sections.map(s => (
              <SectionRow
                key={s.id}
                section={s}
                hidden={hiddenSectionIds.has(s.id)}
                disabled={busy}
                onToggle={() => toggleHide({
                  kind: 'hide_section', targetId: s.id, scopedToStudent: false,
                })}
              />
            ))}
          </Group>

          {/* — Subjects (per-student) — */}
          <Group
            title="Subjects (this student)"
            hint={studentDbId === null
              ? 'Pick a student to scope overrides per learner.'
              : 'Hidden subjects are removed from this student\'s results only.'}
          >
            {studentDbId === null && (
              <div className="text-xs text-slate-500">No student selected.</div>
            )}
            {studentDbId !== null && subjects.length === 0 && (
              <div className="text-xs text-slate-500">This student has no subject results.</div>
            )}
            {studentDbId !== null && subjects.map(subj => {
              const sid = String(subj.id);
              return (
                <ToggleRow
                  key={sid}
                  label={subj.name}
                  hidden={hiddenSubjectIds.has(sid)}
                  disabled={busy}
                  onToggle={() => toggleHide({
                    kind: 'hide_subject', targetId: sid, scopedToStudent: true,
                  })}
                />
              );
            })}
          </Group>

          {/* — Active overrides list — */}
          <Group
            title="Active overrides"
            hint="Snapshot-wide entries apply to every learner; per-student entries are scoped."
            trailing={
              studentDbId !== null && activeForStudent.length > 0 ? (
                <button
                  onClick={clearStudentOverrides}
                  disabled={busy}
                  className="inline-flex items-center gap-1 text-xs text-rose-600 hover:underline disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" /> Reset student
                </button>
              ) : null
            }
          >
            {activeForStudent.length === 0 && (
              <div className="text-xs text-slate-500">No overrides in scope.</div>
            )}
            {activeForStudent.map(o => (
              <ActiveOverrideRow
                key={o.id}
                override={o}
                disabled={busy}
                onRemove={() => deleteOverrideRow(o.id)}
              />
            ))}
          </Group>
        </div>
      )}
    </div>
  );
}

function Group(props: {
  title:    string;
  hint?:    string;
  trailing?:React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="p-3 space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs uppercase tracking-wider text-slate-500">{props.title}</div>
          {props.hint && (
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{props.hint}</div>
          )}
        </div>
        {props.trailing}
      </div>
      <div className="space-y-0.5">{props.children}</div>
    </div>
  );
}

function SectionRow(props: {
  section:  DRCESection;
  hidden:   boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <ToggleRow
      label={`${prettifySectionType(props.section.type)} · ${props.section.id}`}
      hidden={props.hidden}
      disabled={props.disabled}
      onToggle={props.onToggle}
    />
  );
}

function ToggleRow(props: {
  label:    string;
  hidden:   boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      onClick={props.onToggle}
      disabled={props.disabled}
      className={`w-full flex items-center justify-between gap-2 px-2 py-1 rounded text-left text-xs hover:bg-slate-100 dark:hover:bg-slate-900 disabled:opacity-50 ${
        props.hidden ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-200'
      }`}
    >
      <span className="truncate">{props.label}</span>
      {props.hidden
        ? <EyeOff className="w-3.5 h-3.5 text-rose-500 shrink-0" />
        : <Eye    className="w-3.5 h-3.5 text-slate-400 shrink-0" />}
    </button>
  );
}

function ActiveOverrideRow(props: {
  override: PersistedOverride;
  disabled: boolean;
  onRemove: () => void;
}) {
  const o = props.override;
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1 rounded text-xs hover:bg-slate-50 dark:hover:bg-slate-900">
      <div className="min-w-0">
        <div className="truncate">
          <span className="font-medium">{prettifyKind(o.override.kind)}</span>
          <span className="text-slate-500"> · </span>
          <span className="text-slate-600 dark:text-slate-400">{o.override.targetId}</span>
        </div>
        <div className="text-[10px] text-slate-400">
          {o.studentDbId === null ? 'snapshot-wide' : `student #${o.studentDbId}`}
          {' · '}
          {new Date(o.createdAt).toLocaleString()}
        </div>
      </div>
      <button
        onClick={props.onRemove}
        disabled={props.disabled}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-50"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </div>
  );
}

function prettifySectionType(t: string): string {
  return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function prettifyKind(k: OverrideKind): string {
  switch (k) {
    case 'hide_section':  return 'Hide section';
    case 'hide_row':      return 'Hide row';
    case 'hide_subject':  return 'Hide subject';
    case 'style_patch':   return 'Style patch';
    case 'text_replace':  return 'Text replace';
    case 'spacing_patch': return 'Spacing patch';
  }
}
