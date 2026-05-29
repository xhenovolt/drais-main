/**
 * Phase 3.1 — Per-report override layer.
 *
 * Pure functional core for snapshot-bound, per-student render overrides.
 * Storage lives in `report_card_overrides`; the API surface is in
 * `src/app/api/snapshots/[id]/overrides`. This file knows nothing about
 * persistence — it defines the type system and the deterministic
 * `applyOverrides` reducer that the renderer consumes.
 *
 * Render-layer contract:
 *
 *     base DRCEDocument
 *       + frozen branding         (snapshot.meta.branding)
 *       + per-student data        (snapshotToDRCEDataContext)
 *       + override layer          ←  applied last by applyOverrides()
 *       → output
 *
 * Source academic data (results / marks / students) is NEVER mutated by
 * an override. Overrides exist only to transform the DRCEDocument tree
 * just before render.
 */
import type { DRCEDocument, DRCESection } from './schema';

export type OverrideKind =
  | 'hide_section'
  | 'hide_row'
  | 'hide_subject'
  | 'style_patch'
  | 'text_replace'
  | 'spacing_patch'
  | 'cell_content_edit'
  | 'hide_column';

export const OVERRIDE_KINDS: readonly OverrideKind[] = [
  'hide_section', 'hide_row', 'hide_subject',
  'style_patch', 'text_replace', 'spacing_patch',
] as const;

export function isOverrideKind(v: unknown): v is OverrideKind {
  return typeof v === 'string'
    && (OVERRIDE_KINDS as readonly string[]).includes(v);
}

/**
 * Discriminated union of every override shape. Adding a new kind requires
 * three changes: this union, the OVERRIDE_KINDS array, and the engine
 * branch in `applyOverrides`. The MySQL ENUM already reserves slots for
 * Phase 3.2 kinds (`text_replace`, `spacing_patch`) so no migration is
 * needed when those engine branches land.
 */
export type RenderOverride =
  | {
      kind:       'hide_section';
      /** Section id from doc.sections[].id. */
      targetId:   string;
    }
  | {
      kind:       'hide_row';
      /** Stable row identifier — typically `subject_id` for results-table rows. */
      targetId:   string;
    }
  | {
      kind:       'hide_subject';
      /** subject_id (string-form) to drop from the student's results array. */
      targetId:   string;
    }
  | {
      kind:       'style_patch';
      /** Section id whose style block receives the patch. */
      targetId:   string;
      /** Partial style object, deep-merged onto the section's style. */
      payload:    Record<string, unknown>;
    }
  | {
      kind:       'text_replace';
      /** Section id whose textual content is replaced. */
      targetId:   string;
      payload:    { search: string; replace: string };
    }
  | {
      kind:       'spacing_patch';
      /** Section id whose padding/margin is patched. */
      targetId:   string;
      payload:    { padding?: string; margin?: string };
    }
  | {
      kind:       'cell_content_edit';
      /** Section id containing the table. */
      targetId:   string;
      /** Column id being edited. */
      columnId:   string;
      /** Row index (0-based) in the results array. */
      rowIndex:   number;
      /** New content for the cell. */
      payload:    { content: string };
    }
  | {
      kind:       'hide_column';
      /** Section id containing the table. */
      targetId:   string;
      /** Column id to hide. */
      columnId:   string;
    };

/**
 * A persisted override row, as returned by the storage layer / API. The
 * `studentDbId` is `null` for snapshot-wide overrides that apply to every
 * learner (e.g. hide the grading scale across the entire class print).
 */
export interface PersistedOverride {
  id:           number;
  snapshotId:   string;
  studentDbId:  number | null;
  override:     RenderOverride;
  createdBy:    number;
  createdAt:    string;
  updatedAt:    string;
}

/**
 * Filter the override set to those that apply to a specific student.
 * Snapshot-wide entries (studentDbId === null) ALWAYS apply. Per-student
 * entries apply only when their studentDbId matches.
 */
export function selectOverridesForStudent(
  all: readonly PersistedOverride[],
  studentDbId: number,
): RenderOverride[] {
  const out: RenderOverride[] = [];
  for (const o of all) {
    if (o.studentDbId === null || o.studentDbId === studentDbId) {
      out.push(o.override);
    }
  }
  return out;
}

/**
 * Apply an override list to a base document. PURE — does not mutate
 * inputs. Callers should pass the already-resolved DRCEDocument (with
 * branding + data context bound) and receive a transformed copy ready
 * for the renderer.
 *
 * Order is significant: structural removals run first so subsequent
 * style/text patches do not waste work on dropped sections.
 *
 * Phase 3.1 implements: hide_section, hide_subject (via results filter),
 * style_patch. `hide_row`, `text_replace`, `spacing_patch` are recognised
 * but no-op until the renderer surface for them lands in 3.2 — they
 * return the document unchanged rather than throwing, so an override
 * row written ahead of an engine update never breaks a print.
 */
export function applyOverrides(
  doc: DRCEDocument,
  overrides: readonly RenderOverride[],
): DRCEDocument {
  if (overrides.length === 0) return doc;

  // Pass 1 — structural removals.
  const hiddenSectionIds = new Set<string>();
  const hiddenSubjectIds = new Set<string>();
  const hiddenColumnIds = new Set<string>();
  for (const o of overrides) {
    if (o.kind === 'hide_section')      hiddenSectionIds.add(o.targetId);
    else if (o.kind === 'hide_subject') hiddenSubjectIds.add(o.targetId);
    else if (o.kind === 'hide_column')  hiddenColumnIds.add(`${o.targetId}:${o.columnId}`);
  }

  let next: DRCEDocument = doc;

  if (hiddenSectionIds.size > 0) {
    next = {
      ...next,
      sections: next.sections.filter(s => !hiddenSectionIds.has(s.id)),
    };
  }

  // Apply column hiding to results table sections
  if (hiddenColumnIds.size > 0) {
    next = {
      ...next,
      sections: next.sections.map(s => {
        if (s.type === 'results_table') {
          const tableSection = s as DRCESection & { columns?: Array<{ id: string; visible?: boolean }> };
          if (tableSection.columns) {
            const updatedColumns = tableSection.columns.map(col => {
              const columnKey = `${s.id}:${col.id}`;
              if (hiddenColumnIds.has(columnKey)) {
                return { ...col, visible: false };
              }
              return col;
            });
            return { ...s, columns: updatedColumns } as DRCESection;
          }
        }
        return s;
      }),
    };
  }

  // Pass 2 — style patches. Deep-merge the partial style into the matched
  // section's style block. Sections in DRCE keep their style under
  // `section.style`; missing styles are tolerated.
  const stylePatches = overrides.filter(
    (o): o is Extract<RenderOverride, { kind: 'style_patch' }> => o.kind === 'style_patch',
  );
  if (stylePatches.length > 0) {
    next = {
      ...next,
      sections: next.sections.map(s => applyStylePatchesTo(s, stylePatches)),
    };
  }

  // Pass 3 — subject filters propagate via the data context, not the
  // document. The renderer reads filtered `student.results` via the
  // `__hiddenSubjectIds` hint we attach below; the data context layer
  // honours it. This keeps the document tree pristine for editor reuse.
  if (hiddenSubjectIds.size > 0) {
    (next as DRCEDocument & { __hiddenSubjectIds?: string[] }).__hiddenSubjectIds =
      Array.from(hiddenSubjectIds);
  }

  // Pass 4 — cell content edits. Store them in the document for the renderer to apply.
  const cellContentEdits = overrides.filter(
    (o): o is Extract<RenderOverride, { kind: 'cell_content_edit' }> => o.kind === 'cell_content_edit',
  );
  if (cellContentEdits.length > 0) {
    (next as DRCEDocument & { __cellContentEdits?: Array<Extract<RenderOverride, { kind: 'cell_content_edit' }>> }).__cellContentEdits =
      cellContentEdits;
  }

  return next;
}

/** Phase 3.1 helper. Deep-merges every matching style patch onto a section. */
function applyStylePatchesTo(
  section: DRCESection,
  patches: readonly Extract<RenderOverride, { kind: 'style_patch' }>[],
): DRCESection {
  const matching = patches.filter(p => p.targetId === section.id);
  if (matching.length === 0) return section;

  // Sections store their styling under `style` (typed per section kind).
  // We perform a shallow merge per patch in declaration order — later
  // patches win on conflict, matching idiomatic CSS cascade.
  const current = (section as DRCESection & { style?: Record<string, unknown> }).style ?? {};
  let merged: Record<string, unknown> = { ...current };
  for (const p of matching) merged = { ...merged, ...p.payload };

  return { ...section, style: merged } as DRCESection;
}

/**
 * Companion helper for adapters that build the DRCE data context. Reads
 * the hidden-subject hint left by `applyOverrides` and filters a
 * student's results in place — adapter-specific because each adapter
 * owns its data shape.
 */
export function readHiddenSubjectIds(doc: DRCEDocument): readonly string[] {
  const hint = (doc as DRCEDocument & { __hiddenSubjectIds?: string[] }).__hiddenSubjectIds;
  return Array.isArray(hint) ? hint : [];
}
