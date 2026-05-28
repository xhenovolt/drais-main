/**
 * Phase H — shared block library.
 *
 * A block is one reusable DRCESection (typically a container with children)
 * stored in `drce_blocks`. Documents reference blocks via a `block_ref`
 * section; the loader inlines the block's contents (`resolveBlockRefs`)
 * before the renderer ever sees the tree. Editing a block updates every
 * document that references it.
 *
 * Tenant safety: school-owned blocks are visible only to their school;
 * NULL-school blocks are global (available to every school, like built-in
 * templates).
 */
import { query } from '@/lib/db';
import type { DRCESection } from './schema';

export type BlockKind = 'header' | 'footer' | 'comment_rules' | 'custom';

export interface BlockRow {
  id:           number;
  school_id:    number | null;
  name:         string;
  description:  string;
  kind:         BlockKind;
  schema_json:  string;
  created_by:   number | null;
  created_at:   string;
  updated_at:   string;
}

export interface Block extends Omit<BlockRow, 'schema_json'> {
  section: DRCESection;
}

function parseBlock(row: BlockRow): Block {
  let section: DRCESection;
  try {
    section = typeof row.schema_json === 'string' ? JSON.parse(row.schema_json) : (row.schema_json as DRCESection);
  } catch {
    // Corrupt JSON → render-safe no-op
    section = { id: `block-${row.id}-fallback`, type: 'spacer', visible: false, order: 0, style: { height: 0 } } as DRCESection;
  }
  return { ...row, section };
}

/** All blocks visible to a school (school-owned + globals). */
export async function listBlocks(schoolId: number, kind?: BlockKind): Promise<Block[]> {
  const where = ['(school_id IS NULL OR school_id = ?)'];
  const params: unknown[] = [schoolId];
  if (kind) { where.push('kind = ?'); params.push(kind); }
  const rows = (await query(
    `SELECT id, school_id, name, description, kind, schema_json, created_by, created_at, updated_at
       FROM drce_blocks
      WHERE ${where.join(' AND ')}
      ORDER BY kind, name`,
    params,
  )) as BlockRow[];
  return rows.map(parseBlock);
}

export async function getBlock(id: number, schoolId: number): Promise<Block | null> {
  const rows = (await query(
    `SELECT id, school_id, name, description, kind, schema_json, created_by, created_at, updated_at
       FROM drce_blocks
      WHERE id = ? AND (school_id IS NULL OR school_id = ?)
      LIMIT 1`,
    [id, schoolId],
  )) as BlockRow[];
  return rows[0] ? parseBlock(rows[0]) : null;
}

export async function createBlock(input: {
  schoolId:    number;
  name:        string;
  description?: string;
  kind:        BlockKind;
  section:     DRCESection;
  createdBy:   number;
}): Promise<{ id: number }> {
  const res = (await query(
    `INSERT INTO drce_blocks (school_id, name, description, kind, schema_json, created_by)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.schoolId,
      input.name,
      input.description ?? '',
      input.kind,
      JSON.stringify(input.section),
      input.createdBy,
    ],
  )) as unknown as { insertId: number };
  return { id: res.insertId };
}

export async function updateBlock(id: number, schoolId: number, patch: {
  name?:        string;
  description?: string;
  kind?:        BlockKind;
  section?:     DRCESection;
}): Promise<void> {
  const fields: string[] = [];
  const values: unknown[] = [];
  if (patch.name !== undefined)        { fields.push('name = ?');        values.push(patch.name); }
  if (patch.description !== undefined) { fields.push('description = ?'); values.push(patch.description); }
  if (patch.kind !== undefined)        { fields.push('kind = ?');        values.push(patch.kind); }
  if (patch.section !== undefined)     { fields.push('schema_json = ?'); values.push(JSON.stringify(patch.section)); }
  if (fields.length === 0) return;
  values.push(id, schoolId);
  await query(
    `UPDATE drce_blocks
        SET ${fields.join(', ')}
      WHERE id = ? AND school_id = ?`,         // global blocks (school_id NULL) are read-only from tenant APIs
    values,
  );
}

export async function deleteBlock(id: number, schoolId: number): Promise<void> {
  // Same constraint as update — globals are protected from tenant DELETE.
  await query(`DELETE FROM drce_blocks WHERE id = ? AND school_id = ?`, [id, schoolId]);
}
