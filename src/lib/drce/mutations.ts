// ============================================================================
// src/lib/drce/mutations.ts
// Pure function mutation processor for DRCEDocument.
// All editor state changes go through applyMutation() for undo/redo safety.
// ============================================================================

import type { DRCEDocument, DRCEMutation, DRCEResultsTableSection, DRCEShape } from './schema';
import { setByPath } from './bindingResolver';

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
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId) return s;
          return {
            ...s,
            style: setByPath(s.style, mutation.path, mutation.value),
          } as typeof s;
        }),
      };
    }

    case 'SET_SECTION_CONTENT': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId) return s;
          if (!('content' in s)) return s;
          return {
            ...s,
            content: setByPath((s as { content: unknown }).content, mutation.path, mutation.value),
          } as typeof s;
        }),
      };
    }

    case 'TOGGLE_SECTION': {
      return {
        ...doc,
        sections: doc.sections.map(s =>
          s.id === mutation.sectionId ? { ...s, visible: !s.visible } : s
        ),
      };
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
      const newSections = [...doc.sections];
      if (mutation.afterId === null) {
        newSections.push({ ...mutation.section, order: newSections.length });
      } else {
        const idx = newSections.findIndex(s => s.id === mutation.afterId);
        newSections.splice(idx + 1, 0, { ...mutation.section, order: idx + 1 });
      }
      // Re-number orders
      return { ...doc, sections: newSections.map((s, i) => ({ ...s, order: i })) };
    }

    case 'DELETE_SECTION': {
      const filtered = doc.sections.filter(s => s.id !== mutation.sectionId);
      return { ...doc, sections: filtered.map((s, i) => ({ ...s, order: i })) };
    }

    case 'ADD_COLUMN': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
          const tbl = s as DRCEResultsTableSection;
          return {
            ...tbl,
            columns: [...tbl.columns, { ...mutation.column, order: tbl.columns.length }],
          };
        }),
      };
    }

    case 'DELETE_COLUMN': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
          const tbl = s as DRCEResultsTableSection;
          const filtered = tbl.columns.filter(c => c.id !== mutation.columnId);
          return { ...tbl, columns: filtered.map((c, i) => ({ ...c, order: i })) };
        }),
      };
    }

    case 'REORDER_COLUMNS': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
          const tbl = s as DRCEResultsTableSection;
          const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
          const sorted = [...tbl.columns]
            .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
            .map((c, i) => ({ ...c, order: i }));
          return { ...tbl, columns: sorted };
        }),
      };
    }

    case 'SET_COLUMN_PROP': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId || s.type !== 'results_table') return s;
          const tbl = s as DRCEResultsTableSection;
          return {
            ...tbl,
            columns: tbl.columns.map(c => {
              if (c.id !== mutation.columnId) return c;
              return setByPath(c, mutation.path, mutation.value) as typeof c;
            }),
          };
        }),
      };
    }

    case 'ADD_FIELD': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId) return s;
          if (!('fields' in s)) return s;
          const withFields = s as typeof s & { fields: typeof mutation.field[] };
          return {
            ...withFields,
            fields: [...withFields.fields, { ...mutation.field, order: withFields.fields.length }],
          };
        }),
      };
    }

    case 'DELETE_FIELD': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId) return s;
          if (!('fields' in s)) return s;
          const withFields = s as typeof s & { fields: Array<{ id: string; order: number }> };
          const filtered = withFields.fields.filter(f => f.id !== mutation.fieldId);
          return { ...withFields, fields: filtered.map((f, i) => ({ ...f, order: i })) };
        }),
      };
    }

    case 'REORDER_FIELDS': {
      return {
        ...doc,
        sections: doc.sections.map(s => {
          if (s.id !== mutation.sectionId) return s;
          if (!('fields' in s)) return s;
          const withFields = s as typeof s & { fields: Array<{ id: string; order: number }> };
          const idxMap = new Map(mutation.ids.map((id, i) => [id, i]));
          const sorted = [...withFields.fields]
            .sort((a, b) => (idxMap.get(a.id) ?? a.order) - (idxMap.get(b.id) ?? b.order))
            .map((f, i) => ({ ...f, order: i }));
          return { ...withFields, fields: sorted };
        }),
      };
    }

    case 'SET_WATERMARK': {
      return {
        ...doc,
        watermark: setByPath(doc.watermark, mutation.path, mutation.value) as DRCEDocument['watermark'],
      };
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

    default:
      return doc;
  }
}
