// ============================================================================
// src/lib/drce/mutations.ts
// Pure function mutation processor for DRCEDocument.
// All editor state changes go through applyMutation() for undo/redo safety.
// ============================================================================

import type { DRCEDocument, DRCEMutation, DRCEResultsTableSection, DRCEShape, DRCECommentsSection, DRCESection, DRCEContainerSection } from './schema';
import { setByPath } from './bindingResolver';
import {
  enableMultiPage, addPage, deletePage, reorderPages, setPageProp, addSectionToPage,
} from './pages';

/**
 * Recursive helpers — needed for Phase C containers so mutations work uniformly
 * across the top-level sections array AND any container's children at any depth.
 */
function mapSectionsDeep(
  sections: DRCESection[],
  fn: (s: DRCESection) => DRCESection,
): DRCESection[] {
  return sections.map(s => {
    const mapped = fn(s);
    if (mapped.type === 'container') {
      const c = mapped as DRCEContainerSection;
      return { ...c, children: mapSectionsDeep(c.children ?? [], fn) };
    }
    return mapped;
  });
}

function filterSectionsDeep(
  sections: DRCESection[],
  predicate: (s: DRCESection) => boolean,
): DRCESection[] {
  const out: DRCESection[] = [];
  for (const s of sections) {
    if (!predicate(s)) continue;
    if (s.type === 'container') {
      const c = s as DRCEContainerSection;
      out.push({ ...c, children: filterSectionsDeep(c.children ?? [], predicate) });
    } else {
      out.push(s);
    }
  }
  // Re-number top-level orders; container children renumber within themselves.
  return out.map((s, i) => ({ ...s, order: i }));
}

/**
 * P5 — apply a section-array transform to BOTH the top-level `doc.sections`
 * (legacy single-page tree) AND every page's `sections` (multi-page tree).
 * Each handler below uses this so a mutation finds the target section
 * regardless of which array it actually lives in. Section IDs are unique
 * across the document so the same transform can safely run everywhere.
 */
function patchSections(
  doc: DRCEDocument,
  fn: (arr: DRCESection[]) => DRCESection[],
): DRCEDocument {
  const top = fn(doc.sections ?? []);
  if (!doc.pages || !doc.pages.length) return { ...doc, sections: top };
  return {
    ...doc,
    sections: top,
    pages: doc.pages.map(p => ({ ...p, sections: fn(p.sections ?? []) })),
  };
}

/**
 * Apply a single mutation to a document, returning a new document object.
 * All mutations are immutable — the original document is never modified.
 */
export function applyMutation(doc: DRCEDocument, mutation: DRCEMutation): DRCEDocument {
  switch (mutation.type) {

    case 'SET_THEME': {
      return {
        ...doc,
        theme: setByPath(doc.theme, mutation.path, mutation.value) as DRCEDocument['theme'],
      };
    }

    case 'SET_SECTION_STYLE': {
      // Phase 0 fix C1 + P5: deep-walk across every page so style edits hit
      // the matched section wherever it lives.
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        const cur = (s as { style?: unknown }).style ?? {};
        return { ...s, style: setByPath(cur, mutation.path, mutation.value) } as typeof s;
      }));
    }

    case 'SET_SECTION_PROP': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        return setByPath(s, mutation.path, mutation.value) as typeof s;
      }));
    }

    case 'SET_SECTION_CONTENT': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('content' in s)) return s;
        return {
          ...s,
          content: setByPath((s as { content: unknown }).content, mutation.path, mutation.value),
        } as typeof s;
      }));
    }

    case 'TOGGLE_SECTION': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s =>
        s.id === mutation.sectionId ? { ...s, visible: !s.visible } : s));
    }

    case 'REORDER_SECTIONS': {
      // P5 — when `pageId` is set, reorder only within that page. Otherwise
      // the legacy single-page behaviour: reorder the top-level array.
      const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
      const reorderArr = (arr: DRCESection[]) =>
        [...arr].sort((a, b) => {
          const ai = idxMap.get(a.id) ?? a.order;
          const bi = idxMap.get(b.id) ?? b.order;
          return ai - bi;
        }).map((s, i) => ({ ...s, order: i }));
      if (mutation.pageId && doc.pages) {
        return {
          ...doc,
          pages: doc.pages.map(p => p.id === mutation.pageId ? { ...p, sections: reorderArr(p.sections ?? []) } : p),
        };
      }
      return { ...doc, sections: reorderArr(doc.sections) };
    }

    case 'ADD_SECTION': {
      // Nested insert: append into a container — searches across all pages.
      if (mutation.parentContainerId) {
        return patchSections(doc, arr => mapSectionsDeep(arr, s => {
          if (s.id !== mutation.parentContainerId || s.type !== 'container') return s;
          const cs = s as DRCEContainerSection;
          const kids = [...(cs.children ?? []), { ...mutation.section, order: (cs.children ?? []).length }];
          return { ...cs, children: kids.map((k, i) => ({ ...k, order: i })) };
        }));
      }
      // P5 — page-scoped insert when `pageId` is set; otherwise legacy top-level.
      return addSectionToPage(doc, mutation.pageId, mutation.section, mutation.afterId);
    }

    case 'DELETE_SECTION': {
      // P5 — search-and-remove across top-level AND every page; renumber per array.
      return patchSections(doc, arr => filterSectionsDeep(arr, s => s.id !== mutation.sectionId));
    }

    case 'MOVE_SECTION': {
      // P5 — move across top-level + every page. Cycle guard unchanged.
      let moving: DRCESection | null = null;
      const findMoving = (arr: DRCESection[]) => {
        for (const s of arr) {
          if (moving) return;
          if (s.id === mutation.sectionId) { moving = s; return; }
          if (s.type === 'container') findMoving(((s as DRCEContainerSection).children ?? []));
        }
      };
      findMoving(doc.sections);
      for (const p of doc.pages ?? []) { if (!moving) findMoving(p.sections ?? []); }
      if (!moving) return doc;

      if (mutation.targetContainerId) {
        const subtreeIds = new Set<string>();
        const collect = (arr: DRCESection[]) => {
          for (const s of arr) {
            subtreeIds.add(s.id);
            if (s.type === 'container') collect(((s as DRCEContainerSection).children ?? []));
          }
        };
        collect([moving]);
        if (subtreeIds.has(mutation.targetContainerId)) return doc;  // illegal
      }

      const insertInto = (arr: DRCESection[]): DRCESection[] => {
        const pos = Math.max(0, Math.min(mutation.position, arr.length));
        const out = arr.slice();
        out.splice(pos, 0, moving!);
        return out.map((s, i) => ({ ...s, order: i }));
      };

      // Strip the moving node from every section array first (cheap if not present).
      const stripped = patchSections(doc, arr =>
        filterSectionsDeep(arr, s => s.id !== mutation.sectionId));

      // Re-insert. targetContainerId === null → top level of the current doc.
      if (mutation.targetContainerId === null) {
        return { ...stripped, sections: insertInto(stripped.sections ?? []) };
      }
      // Otherwise insert under the matched container, wherever it lives.
      return patchSections(stripped, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.targetContainerId || s.type !== 'container') return s;
        const c = s as DRCEContainerSection;
        return { ...c, children: insertInto(c.children ?? []) };
      }));
    }

    // Phase 0 fix C1: every section-targeted mutation below now deep-walks
    // through container.children so edits work uniformly at any nesting depth.

    case 'ADD_COLUMN': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        return { ...tbl, columns: [...tbl.columns, { ...mutation.column, order: tbl.columns.length }] };
      }));
    }

    case 'DELETE_COLUMN': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        const filtered = tbl.columns.filter(c => c.id !== mutation.columnId);
        return { ...tbl, columns: filtered.map((c, i) => ({ ...c, order: i })) };
      }));
    }

    case 'REORDER_COLUMNS': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...tbl.columns]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((c, i) => ({ ...c, order: i }));
        return { ...tbl, columns: sorted };
      }));
    }

    case 'SET_COLUMN_PROP': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        return { ...tbl, columns: tbl.columns.map(c =>
          c.id !== mutation.columnId ? c : setByPath(c, mutation.path, mutation.value) as typeof c,
        ) };
      }));
    }

    case 'ADD_FIELD': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: typeof mutation.field[] };
        return { ...wf, fields: [...wf.fields, { ...mutation.field, order: wf.fields.length }] };
      }));
    }

    case 'DELETE_FIELD': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string; order: number }> };
        const filtered = wf.fields.filter(f => f.id !== mutation.fieldId);
        return { ...wf, fields: filtered.map((f, i) => ({ ...f, order: i })) };
      }));
    }

    case 'REORDER_FIELDS': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string; order: number }> };
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...wf.fields]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((f, i) => ({ ...f, order: i }));
        return { ...wf, fields: sorted };
      }));
    }

    case 'SET_FIELD_PROP': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string }> };
        return { ...wf, fields: wf.fields.map(f =>
          f.id !== mutation.fieldId ? f : setByPath(f, mutation.path, mutation.value),
        ) };
      }));
    }

    case 'ADD_COMMENT_ITEM': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: typeof mutation.item[] };
        return { ...cs, items: [...cs.items, { ...mutation.item, order: cs.items.length }] };
      }));
    }

    case 'DELETE_COMMENT_ITEM': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string; order: number }> };
        const filtered = cs.items.filter(it => it.id !== mutation.itemId);
        return { ...cs, items: filtered.map((it, i) => ({ ...it, order: i })) };
      }));
    }

    case 'REORDER_COMMENT_ITEMS': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string; order: number }> };
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...cs.items]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((it, i) => ({ ...it, order: i }));
        return { ...cs, items: sorted };
      }));
    }

    case 'SET_COMMENT_ITEM_PROP': {
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string }> };
        return { ...cs, items: cs.items.map(it =>
          it.id !== mutation.itemId ? it : setByPath(it, mutation.path, mutation.value),
        ) };
      }));
    }

    case 'SET_WATERMARK': {
      return {
        ...doc,
        watermark: setByPath(doc.watermark, mutation.path, mutation.value) as DRCEDocument['watermark'],
      };
    }

    case 'SET_RUNNING_HEADER': {
      const cur = doc.runningHeader ?? { show: false, text: '' };
      return {
        ...doc,
        runningHeader: setByPath(cur, mutation.path, mutation.value) as DRCEDocument['runningHeader'],
      };
    }

    case 'SET_RUNNING_FOOTER': {
      const cur = doc.runningFooter ?? { show: false, text: '' };
      return {
        ...doc,
        runningFooter: setByPath(cur, mutation.path, mutation.value) as DRCEDocument['runningFooter'],
      };
    }

    case 'SET_PAGE_HEADER':
    case 'SET_PAGE_FOOTER': {
      const slot = mutation.type === 'SET_PAGE_HEADER' ? 'pageHeader' : 'pageFooter';
      if (!doc.pages) return doc;
      return {
        ...doc,
        pages: doc.pages.map(p => p.id === mutation.pageId
          ? { ...p, [slot]: mutation.section ?? undefined }
          : p,
        ),
      };
    }

    case 'SET_GRADE_ROWS': {
      // Phase 0 fix C1: deep-walk.
      return patchSections(doc, arr => mapSectionsDeep(arr, s => {
        if (s.id !== mutation.sectionId || s.type !== 'grade_table') return s;
        return { ...s, grades: mutation.grades };
      }));
    }

    case 'ADD_SHAPE': {
      return { ...doc, shapes: [...(doc.shapes ?? []), mutation.shape] };
    }

    case 'UPDATE_SHAPE': {
      return {
        ...doc,
        shapes: (doc.shapes ?? []).map(s =>
          s.id === mutation.id ? { ...s, ...mutation.updates } as DRCEShape : s
        ),
      };
    }

    case 'DELETE_SHAPE': {
      return { ...doc, shapes: (doc.shapes ?? []).filter(s => s.id !== mutation.id) };
    }

    case 'SET_COMMENT_RULES': {
      return { ...doc, commentRules: mutation.rules };
    }

    case 'SET_TEACHER_MAPPINGS': {
      return { ...doc, teacherMappings: mutation.mappings };
    }

    // ── P5 — multi-page mutations ─────────────────────────────────────────────

    case 'ENABLE_MULTI_PAGE': {
      return enableMultiPage(doc);
    }

    case 'ADD_PAGE': {
      return addPage(doc, mutation.name, mutation.afterId);
    }

    case 'DELETE_PAGE': {
      return deletePage(doc, mutation.pageId);
    }

    case 'REORDER_PAGES': {
      return reorderPages(doc, mutation.ids);
    }

    case 'SET_PAGE_PROP': {
      return setPageProp(doc, mutation.pageId, mutation.prop, mutation.value);
    }

    default:
      return doc;
  }
}
