/**
 * DRCE clipboard operations (Phase 2 — canvas controls).
 *
 * Single source of truth for duplicate / copy / paste of sections + shapes,
 * shared by the ContextualToolbar buttons AND the editor keyboard shortcuts
 * (Ctrl+D / Ctrl+C / Ctrl+V) so the two can never drift. Extracted verbatim
 * from the toolbar's original implementations (Phase 0 fix H4 id-rewrite).
 */
import { selection, type SelectionState } from './selectionStore';
import { newSectionId, newShapeId, newColumnId, newFieldId, newItemId } from '@/lib/drce/ids';
import type { DRCEDocument, DRCEMutation, DRCESection, DRCEShape } from '@/lib/drce/schema';

type Emit = (m: DRCEMutation) => void;

export function findSectionDeep(arr: DRCESection[], id: string): DRCESection | null {
  for (const s of arr) {
    if (s.id === id) return s;
    if (s.type === 'container') {
      const hit = findSectionDeep((s as { children?: DRCESection[] }).children ?? [], id);
      if (hit) return hit;
    }
  }
  return null;
}

export function deepClone<T>(v: T): T { return JSON.parse(JSON.stringify(v)); }

/**
 * Rewrite every id in a cloned section subtree so a duplicate/paste never ships
 * duplicate keys (section, container children, table columns, fields, comment
 * items, inner shape id; table cell overrides are dropped as they'd be stale).
 */
export function rewriteIdsDeep(s: DRCESection): DRCESection {
  const out = { ...s, id: newSectionId(s.type) } as DRCESection & Record<string, unknown>;
  if (s.type === 'container') {
    const c = out as unknown as { children?: DRCESection[] };
    c.children = (c.children ?? []).map(rewriteIdsDeep);
  }
  if ('columns' in out && Array.isArray((out as { columns?: { id: string }[] }).columns)) {
    (out as { columns: { id: string }[] }).columns =
      (out as { columns: { id: string }[] }).columns.map(c => ({ ...c, id: newColumnId() }));
  }
  if ('fields' in out && Array.isArray((out as { fields?: { id: string }[] }).fields)) {
    (out as { fields: { id: string }[] }).fields =
      (out as { fields: { id: string }[] }).fields.map(f => ({ ...f, id: newFieldId() }));
  }
  if ('items' in out && Array.isArray((out as { items?: { id: string }[] }).items)) {
    (out as { items: { id: string }[] }).items =
      (out as { items: { id: string }[] }).items.map(it => ({ ...it, id: newItemId() }));
  }
  if (s.type === 'shape') {
    const shp = (out as unknown as { shape?: { id: string } }).shape;
    if (shp) shp.id = newShapeId();
  }
  if (s.type === 'table') (out as { cells?: Record<string, unknown> }).cells = {};
  return out as DRCESection;
}

/** Offset a cloned shape by (dx,dy) so it doesn't sit exactly on the original. */
function nudgeShape(clone: DRCEShape, offset = 20): void {
  if ('x' in clone) (clone as { x: number }).x += offset;
  if ('y' in clone) (clone as { y: number }).y += offset;
  if ('x1' in clone) { (clone as { x1: number }).x1 += offset; (clone as { x2: number }).x2 += offset; }
  if ('y1' in clone) { (clone as { y1: number }).y1 += offset; (clone as { y2: number }).y2 += offset; }
}

/** Duplicate the primary-selected section or shape in place (+offset). */
export function duplicateSelection(doc: DRCEDocument, sel: SelectionState, emit: Emit): void {
  if (!sel.primary) return;
  if (sel.primary.kind === 'section') {
    const s = findSectionDeep(doc.sections, sel.primary.id);
    if (!s) return;
    const clone = rewriteIdsDeep(deepClone(s));
    emit({ type: 'ADD_SECTION', section: clone, afterId: s.id });
    selection.select('section', clone.id);
  } else {
    const sh = doc.shapes?.find(x => x.id === sel.primary!.id);
    if (!sh) return;
    const clone = deepClone(sh);
    clone.id = newShapeId();
    nudgeShape(clone);
    emit({ type: 'ADD_SHAPE', shape: clone });
    selection.select('shape', clone.id);
  }
}

/** Copy the current multi-selection (sections + shapes) into the clipboard. */
export function copySelection(doc: DRCEDocument, sel: SelectionState): boolean {
  const sections = [...sel.sectionIds]
    .map(id => findSectionDeep(doc.sections, id))
    .filter((x): x is DRCESection => !!x);
  const shapes = [...sel.shapeIds]
    .map(id => doc.shapes?.find(s => s.id === id))
    .filter((x): x is DRCEShape => !!x);
  if (!sections.length && !shapes.length) return false;
  selection.copy(sections, shapes);
  return true;
}

/** Paste whatever is in the clipboard (id-rewritten sections + nudged shapes). */
export function pasteClipboard(emit: Emit): void {
  const cb = selection.getClipboard();
  if (!cb) return;
  let lastId: string | null = null;
  cb.sections.forEach(s => {
    const clone = rewriteIdsDeep(deepClone(s));
    emit({ type: 'ADD_SECTION', section: clone, afterId: null });
    lastId = clone.id;
  });
  cb.shapes.forEach(sh => {
    const clone = deepClone(sh);
    clone.id = newShapeId();
    nudgeShape(clone);
    emit({ type: 'ADD_SHAPE', shape: clone });
  });
  if (lastId) selection.select('section', lastId);
}
