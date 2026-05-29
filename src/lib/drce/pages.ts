/**
 * P5 — multi-page document helpers. Pure functions only; no React, no DB.
 *
 * Routing model: section mutations target a section by ID; the section can
 * live either at `document.sections` (legacy / single-page) or inside any
 * page's `sections` array. The mutation engine doesn't need to know which —
 * helpers below walk every section tree and apply the change wherever the
 * id matches.
 *
 * Page CRUD is explicit because pages live in their own array.
 */
import type {
  DRCEDocument, DRCEPage, DRCESection, DRCEContainerSection,
} from './schema';
import { newId } from './ids';

// ─── Section traversal helpers (mirror mutations.ts but operate on any array) ─

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
  return out.map((s, i) => ({ ...s, order: i }));
}

/**
 * Map a section anywhere it lives in the document (top-level OR inside any
 * page). The id-based callback runs once per section; non-matching sections
 * are returned unchanged. This lets every section-targeting mutation in
 * mutations.ts work transparently in both single-page and multi-page docs.
 */
export function mapSectionAnywhere(
  doc: DRCEDocument,
  fn: (s: DRCESection) => DRCESection,
): DRCEDocument {
  const top   = mapSectionsDeep(doc.sections ?? [], fn);
  const pages = doc.pages?.map(p => ({
    ...p,
    sections: mapSectionsDeep(p.sections ?? [], fn),
  }));
  return { ...doc, sections: top, ...(pages ? { pages } : {}) };
}

/** Filter (delete) a section by id anywhere in the document. */
export function filterSectionAnywhere(
  doc: DRCEDocument,
  predicate: (s: DRCESection) => boolean,
): DRCEDocument {
  const top   = filterSectionsDeep(doc.sections ?? [], predicate);
  const pages = doc.pages?.map(p => ({
    ...p,
    sections: filterSectionsDeep(p.sections ?? [], predicate),
  }));
  return { ...doc, sections: top, ...(pages ? { pages } : {}) };
}

/** Locate a section by id in any section tree of the document. Returns null
 *  if no match. Used by MOVE_SECTION to find the source before extraction. */
export function findSectionAnywhere(
  doc: DRCEDocument, id: string,
): DRCESection | null {
  function walk(arr: DRCESection[]): DRCESection | null {
    for (const s of arr) {
      if (s.id === id) return s;
      if (s.type === 'container') {
        const hit = walk(((s as DRCEContainerSection).children ?? []));
        if (hit) return hit;
      }
    }
    return null;
  }
  const top = walk(doc.sections ?? []);
  if (top) return top;
  for (const p of doc.pages ?? []) {
    const inPage = walk(p.sections ?? []);
    if (inPage) return inPage;
  }
  return null;
}

// ─── Page CRUD ──────────────────────────────────────────────────────────────

export function blankPage(name?: string): DRCEPage {
  return {
    id:       newId('pg'),
    name:     name ?? 'New page',
    sections: [],
  };
}

/**
 * Convert a single-page document to multi-page. Wraps the existing flat
 * `sections` array into `pages[0]` so the user can start adding more pages.
 * Idempotent: if the document is already multi-page, it's returned unchanged.
 */
export function enableMultiPage(doc: DRCEDocument): DRCEDocument {
  if (doc.pages && doc.pages.length) return doc;
  const firstPage: DRCEPage = {
    id:       newId('pg'),
    name:     'Page 1',
    sections: doc.sections ?? [],
  };
  return { ...doc, pages: [firstPage], sections: [] };
}

export function addPage(doc: DRCEDocument, name?: string, afterId?: string | null): DRCEDocument {
  const base = doc.pages?.length ? doc : enableMultiPage(doc);
  const pages = base.pages ?? [];
  const page  = blankPage(name ?? `Page ${pages.length + 1}`);
  if (afterId == null) return { ...base, pages: [...pages, page] };
  const idx = pages.findIndex(p => p.id === afterId);
  if (idx < 0) return { ...base, pages: [...pages, page] };
  return { ...base, pages: [...pages.slice(0, idx + 1), page, ...pages.slice(idx + 1)] };
}

export function deletePage(doc: DRCEDocument, pageId: string): DRCEDocument {
  if (!doc.pages || doc.pages.length <= 1) return doc;  // must keep ≥1 page
  return { ...doc, pages: doc.pages.filter(p => p.id !== pageId) };
}

export function reorderPages(doc: DRCEDocument, ids: string[]): DRCEDocument {
  if (!doc.pages) return doc;
  const idxMap = new Map(ids.map((id, i) => [id, i]));
  const sorted = [...doc.pages].sort((a, b) =>
    (idxMap.get(a.id) ?? 999) - (idxMap.get(b.id) ?? 999),
  );
  return { ...doc, pages: sorted };
}

export function setPageProp(
  doc: DRCEDocument, pageId: string, prop: keyof DRCEPage, value: unknown,
): DRCEDocument {
  if (!doc.pages) return doc;
  return {
    ...doc,
    pages: doc.pages.map(p =>
      p.id === pageId ? ({ ...p, [prop]: value } as DRCEPage) : p,
    ),
  };
}

/**
 * Append a new section to a specific page (used by ADD_SECTION when the
 * editor's active page is set). Falls back to top-level when no pageId.
 */
export function addSectionToPage(
  doc: DRCEDocument,
  pageId: string | null | undefined,
  section: DRCESection,
  afterId?: string | null,
): DRCEDocument {
  if (!pageId) {
    // Legacy / single-page — append to top level.
    const list = doc.sections ?? [];
    const next = afterId == null
      ? [...list, { ...section, order: list.length }]
      : (() => {
          const idx = list.findIndex(s => s.id === afterId);
          if (idx < 0) return [...list, { ...section, order: list.length }];
          return [...list.slice(0, idx + 1), section, ...list.slice(idx + 1)];
        })();
    return { ...doc, sections: next.map((s, i) => ({ ...s, order: i })) };
  }
  if (!doc.pages) return doc;
  return {
    ...doc,
    pages: doc.pages.map(p => {
      if (p.id !== pageId) return p;
      const list = p.sections ?? [];
      const next = afterId == null
        ? [...list, { ...section, order: list.length }]
        : (() => {
            const idx = list.findIndex(s => s.id === afterId);
            if (idx < 0) return [...list, { ...section, order: list.length }];
            return [...list.slice(0, idx + 1), section, ...list.slice(idx + 1)];
          })();
      return { ...p, sections: next.map((s, i) => ({ ...s, order: i })) };
    }),
  };
}
