/**
 * Phase H — template inheritance + block-ref resolution.
 *
 * Both run at LOAD time, before the renderer ever sees the document. The
 * renderer remains a pure function of a flat DRCEDocument; no new branching.
 *
 * Inheritance merge rules:
 *   - Child sections with the same id REPLACE parent sections of the same id
 *     (deep replacement; the child wins).
 *   - Child sections with new ids APPEND after the merged parent set.
 *   - Theme / watermark / commentRules / teacherMappings — child fields, when
 *     present, override parent fields. Absent child fields fall through to
 *     the parent.
 *   - Cycles are broken by tracking visited ids; max depth 8 by default.
 *
 * Block resolution:
 *   - Every `block_ref` section in the tree is replaced by the referenced
 *     block's `section` (a single DRCESection, typically a container).
 *   - Missing / cross-school block ids replace the ref with an invisible
 *     spacer so the document still renders cleanly.
 */
import { query } from '@/lib/db';
import type {
  DRCEDocument, DRCESection, DRCEContainerSection, DRCEBlockRefSection,
} from './schema';
import { parseDRCERow, type DVCFDocumentRow } from './schema';
import type { Block } from './blocks';

// ── Inheritance ────────────────────────────────────────────────────────────

const MAX_DEPTH = 8;

async function fetchDocRow(id: number, schoolId: number): Promise<DRCEDocument | null> {
  const rows = (await query(
    `SELECT id, school_id, document_type, name, description,
            schema_json, schema_version, is_default, template_key,
            template_category, created_at, updated_at
       FROM dvcf_documents
      WHERE id = ? AND (school_id IS NULL OR school_id = ?)
      LIMIT 1`,
    [id, schoolId],
  )) as DVCFDocumentRow[];
  return rows[0] ? parseDRCERow(rows[0]) : null;
}

function mergeSections(parent: DRCESection[], child: DRCESection[]): DRCESection[] {
  const childIds = new Set(child.map(s => s.id));
  const replaced = parent.map(p => {
    const replacement = child.find(c => c.id === p.id);
    return replacement ?? p;
  });
  // Append children whose ids are new.
  const appended = child.filter(c => !parent.some(p => p.id === c.id));
  // Preserve declared order; renumber to keep `order` contiguous after merge.
  const out = [...replaced, ...appended];
  return out.map((s, i) => ({ ...s, order: i }));
}

function mergeDocument(parent: DRCEDocument, child: DRCEDocument): DRCEDocument {
  return {
    ...parent,
    ...child,                               // child-level scalar fields win
    meta:        { ...parent.meta,       ...child.meta },
    theme:       { ...parent.theme,      ...child.theme },
    watermark:   { ...parent.watermark,  ...child.watermark },
    sections:    mergeSections(parent.sections ?? [], child.sections ?? []),
    shapes:      child.shapes && child.shapes.length ? child.shapes : (parent.shapes ?? []),
    commentRules:    child.commentRules    ?? parent.commentRules,
    teacherMappings: child.teacherMappings ?? parent.teacherMappings,
  };
}

/**
 * Resolve a document's full inherited form. If meta.parent_id is set, fetch
 * the parent, recurse (capped at MAX_DEPTH), and merge. Returns the original
 * document unchanged when there is no parent.
 */
export async function resolveInheritance(
  doc:      DRCEDocument,
  schoolId: number,
  visited:  Set<number> = new Set(),
  depth:    number = 0,
): Promise<DRCEDocument> {
  const parentId = doc.meta.parent_id;
  if (!parentId || depth >= MAX_DEPTH || visited.has(parentId)) return doc;
  visited.add(parentId);
  const parent = await fetchDocRow(parentId, schoolId);
  if (!parent) return doc;
  const resolvedParent = await resolveInheritance(parent, schoolId, visited, depth + 1);
  return mergeDocument(resolvedParent, doc);
}

// ── Block resolution ───────────────────────────────────────────────────────

function inlineBlocksDeep(sections: DRCESection[], blocksById: Map<number, Block>, depth = 0): DRCESection[] {
  if (depth > 4) return sections;            // safety against block self-ref loops
  const out: DRCESection[] = [];
  for (const s of sections) {
    if (s.type === 'block_ref') {
      const ref = s as DRCEBlockRefSection;
      const block = blocksById.get(Number(ref.block_id));
      if (block) {
        // Recurse into the inlined block in case it contains block_refs too.
        const inlined = inlineBlocksDeep([block.section], blocksById, depth + 1)[0];
        if (inlined) out.push({ ...inlined, id: s.id, order: s.order });
      } else {
        // Missing → invisible spacer so render still works.
        out.push({ id: s.id, type: 'spacer', visible: false, order: s.order, style: { height: 0 } });
      }
      continue;
    }
    if (s.type === 'container') {
      const c = s as DRCEContainerSection;
      out.push({ ...c, children: inlineBlocksDeep(c.children ?? [], blocksById, depth) });
      continue;
    }
    out.push(s);
  }
  return out;
}

/**
 * Walk the document tree, replacing every `block_ref` with its referenced
 * block's section. Block content survives container nesting. Pure transform
 * over the input map; no I/O here — the caller fetches blocks once and
 * passes the map.
 */
export function resolveBlockRefs(doc: DRCEDocument, blocks: Block[]): DRCEDocument {
  if (!blocks.length) return doc;
  const map = new Map(blocks.map(b => [b.id, b]));
  return { ...doc, sections: inlineBlocksDeep(doc.sections ?? [], map) };
}

/** Returns every block_id referenced anywhere in the document tree. */
export function collectBlockRefIds(sections: DRCESection[]): number[] {
  const out = new Set<number>();
  const walk = (arr: DRCESection[]) => {
    for (const s of arr) {
      if (s.type === 'block_ref') out.add(Number((s as DRCEBlockRefSection).block_id));
      if (s.type === 'container') walk(((s as DRCEContainerSection).children ?? []));
    }
  };
  walk(sections);
  return [...out];
}
