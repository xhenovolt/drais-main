// ============================================================================
// src/lib/drce/mutations.ts
// Pure function mutation processor for DRCEDocument.
// All editor state changes go through applyMutation() for undo/redo safety.
// ============================================================================

import type { DRCEDocument, DRCEMutation, DRCEResultsTableSection, DRCEShape, DRCECommentsSection, DRCESection, DRCEContainerSection } from './schema';
import { setByPath } from './bindingResolver';

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
      // Phase 0 fix C1: deep-walk so style edits work on container children.
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        const cur = (s as { style?: unknown }).style ?? {};
        return { ...s, style: setByPath(cur, mutation.path, mutation.value) } as typeof s;
      }) };
    }

    case 'SET_SECTION_PROP': {
      // Phase 0 fix C1: deep-walk.
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        return setByPath(s, mutation.path, mutation.value) as typeof s;
      }) };
    }

    case 'SET_SECTION_CONTENT': {
      // Phase 0 fix C1: deep-walk.
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('content' in s)) return s;
        return {
          ...s,
          content: setByPath((s as { content: unknown }).content, mutation.path, mutation.value),
        } as typeof s;
      }) };
    }

    case 'TOGGLE_SECTION': {
      // Recurse into container children so toggling works for nested sections.
      return { ...doc, sections: mapSectionsDeep(doc.sections, s =>
        s.id === mutation.sectionId ? { ...s, visible: !s.visible } : s) };
    }

    case 'REORDER_SECTIONS': {
      const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
      return {
        ...doc,
        sections: [...doc.sections].sort((a, b) => {
          const ai = idxMap.get(a.id) ?? a.order;
          const bi = idxMap.get(b.id) ?? b.order;
          return ai - bi;
        }).map((s, i) => ({ ...s, order: i })),
      };
    }

    case 'ADD_SECTION': {
      // Nested insert: if parentContainerId is set, append into that container's
      // children. Otherwise the legacy top-level insert (with afterId positioning).
      if (mutation.parentContainerId) {
        return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
          if (s.id !== mutation.parentContainerId || s.type !== 'container') return s;
          const cs = s as DRCEContainerSection;
          const kids = [...(cs.children ?? []), { ...mutation.section, order: (cs.children ?? []).length }];
          return { ...cs, children: kids.map((k, i) => ({ ...k, order: i })) };
        }) };
      }
      const newSections = [...doc.sections];
      if (mutation.afterId === null) {
        newSections.push({ ...mutation.section, order: newSections.length });
      } else {
        const idx = newSections.findIndex(s => s.id === mutation.afterId);
        newSections.splice(idx + 1, 0, { ...mutation.section, order: idx + 1 });
      }
      return { ...doc, sections: newSections.map((s, i) => ({ ...s, order: i })) };
    }

    case 'DELETE_SECTION': {
      // Recurse: a section can live as a child of any container, at any depth.
      return { ...doc, sections: filterSectionsDeep(doc.sections, s => s.id !== mutation.sectionId) };
    }

    case 'MOVE_SECTION': {
      // Cycle guard: cannot drop a container into itself or its descendants.
      let moving: DRCESection | null = null;
      const findMoving = (arr: DRCESection[]) => {
        for (const s of arr) {
          if (moving) return;
          if (s.id === mutation.sectionId) { moving = s; return; }
          if (s.type === 'container') findMoving(((s as DRCEContainerSection).children ?? []));
        }
      };
      findMoving(doc.sections);
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

      // Extract from source by filtering deeply.
      const withoutSource = filterSectionsDeep(doc.sections, s => s.id !== mutation.sectionId);
      const insertInto = (arr: DRCESection[]): DRCESection[] => {
        const pos = Math.max(0, Math.min(mutation.position, arr.length));
        const out = arr.slice();
        out.splice(pos, 0, moving!);
        return out.map((s, i) => ({ ...s, order: i }));
      };

      if (mutation.targetContainerId === null) {
        return { ...doc, sections: insertInto(withoutSource) };
      }
      return { ...doc, sections: mapSectionsDeep(withoutSource, s => {
        if (s.id !== mutation.targetContainerId || s.type !== 'container') return s;
        const c = s as DRCEContainerSection;
        return { ...c, children: insertInto(c.children ?? []) };
      }) };
    }

    // Phase 0 fix C1: every section-targeted mutation below now deep-walks
    // through container.children so edits work uniformly at any nesting depth.

    case 'ADD_COLUMN': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        return { ...tbl, columns: [...tbl.columns, { ...mutation.column, order: tbl.columns.length }] };
      }) };
    }

    case 'DELETE_COLUMN': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        const filtered = tbl.columns.filter(c => c.id !== mutation.columnId);
        return { ...tbl, columns: filtered.map((c, i) => ({ ...c, order: i })) };
      }) };
    }

    case 'REORDER_COLUMNS': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...tbl.columns]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((c, i) => ({ ...c, order: i }));
        return { ...tbl, columns: sorted };
      }) };
    }

    case 'SET_COLUMN_PROP': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
        const tbl = s as DRCEResultsTableSection;
        return { ...tbl, columns: tbl.columns.map(c =>
          c.id !== mutation.columnId ? c : setByPath(c, mutation.path, mutation.value) as typeof c,
        ) };
      }) };
    }

    case 'ADD_FIELD': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: typeof mutation.field[] };
        return { ...wf, fields: [...wf.fields, { ...mutation.field, order: wf.fields.length }] };
      }) };
    }

    case 'DELETE_FIELD': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string; order: number }> };
        const filtered = wf.fields.filter(f => f.id !== mutation.fieldId);
        return { ...wf, fields: filtered.map((f, i) => ({ ...f, order: i })) };
      }) };
    }

    case 'REORDER_FIELDS': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string; order: number }> };
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...wf.fields]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((f, i) => ({ ...f, order: i }));
        return { ...wf, fields: sorted };
      }) };
    }

    case 'SET_FIELD_PROP': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId) return s;
        if (!('fields' in s)) return s;
        const wf = s as typeof s & { fields: Array<{ id: string }> };
        return { ...wf, fields: wf.fields.map(f =>
          f.id !== mutation.fieldId ? f : setByPath(f, mutation.path, mutation.value),
        ) };
      }) };
    }

    case 'ADD_COMMENT_ITEM': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: typeof mutation.item[] };
        return { ...cs, items: [...cs.items, { ...mutation.item, order: cs.items.length }] };
      }) };
    }

    case 'DELETE_COMMENT_ITEM': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string; order: number }> };
        const filtered = cs.items.filter(it => it.id !== mutation.itemId);
        return { ...cs, items: filtered.map((it, i) => ({ ...it, order: i })) };
      }) };
    }

    case 'REORDER_COMMENT_ITEMS': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string; order: number }> };
        const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
        const sorted = [...cs.items]
          .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
          .map((it, i) => ({ ...it, order: i }));
        return { ...cs, items: sorted };
      }) };
    }

    case 'SET_COMMENT_ITEM_PROP': {
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'comments') return s;
        const cs = s as typeof s & { items: Array<{ id: string }> };
        return { ...cs, items: cs.items.map(it =>
          it.id !== mutation.itemId ? it : setByPath(it, mutation.path, mutation.value),
        ) };
      }) };
    }

    case 'SET_WATERMARK': {
      return {
        ...doc,
        watermark: setByPath(doc.watermark, mutation.path, mutation.value) as DRCEDocument['watermark'],
      };
    }

    case 'SET_GRADE_ROWS': {
      // Phase 0 fix C1: deep-walk.
      return { ...doc, sections: mapSectionsDeep(doc.sections, s => {
        if (s.id !== mutation.sectionId || s.type !== 'grade_table') return s;
        return { ...s, grades: mutation.grades };
      }) };
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

    default:
      return doc;
  }
}
