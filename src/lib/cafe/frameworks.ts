/**
 * CAFE — framework + component service.
 *
 * Each framework is a per-school bundle of components. Each component
 * carries its own scoring_model so a framework can mix numeric (Theory
 * 80%) with rubric (Practical 1–5) with descriptor (Generic skills).
 *
 * Visibility rule: a school sees its own frameworks only (no global
 * catalog — every framework is an opt-in school decision).
 */
import { query } from '@/lib/db';
import { getScoringModel } from './scoring';
import type {
  AssessmentFramework, AssessmentComponent,
  FrameworkInput, ComponentInput, FrameworkMode,
} from './types';

const CODE_RE = /^[a-z][a-z0-9_]{0,62}$/;
function normalizeCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}
function isValidCode(code: string): boolean { return CODE_RE.test(code); }

// ─── row mappers ────────────────────────────────────────────────────────────

interface FrameworkRow {
  id: number; school_id: number; code: string; name: string;
  description: string | null; mode: FrameworkMode;
  is_active: number; created_at: string; updated_at: string;
}
function rowToFramework(r: FrameworkRow): AssessmentFramework {
  return {
    id:          Number(r.id),
    schoolId:    Number(r.school_id),
    code:        r.code,
    name:        r.name,
    description: r.description,
    mode:        r.mode,
    isActive:    Boolean(r.is_active),
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

interface ComponentRow {
  id: number; framework_id: number; code: string; name: string;
  description: string | null; scoring_model_id: number;
  weight: string | number; min_score: string | number | null;
  max_score: string | number | null;
  is_required: number; sequence_locked: number; sort_order: number;
}
function rowToComponent(r: ComponentRow): AssessmentComponent {
  const num = (v: unknown): number | null =>
    v == null ? null : (typeof v === 'number' ? v : parseFloat(String(v)));
  return {
    id:             Number(r.id),
    frameworkId:    Number(r.framework_id),
    code:           r.code,
    name:           r.name,
    description:    r.description,
    scoringModelId: Number(r.scoring_model_id),
    weight:         num(r.weight) ?? 1,
    minScore:       num(r.min_score),
    maxScore:       num(r.max_score),
    isRequired:     Boolean(r.is_required),
    sequenceLocked: Boolean(r.sequence_locked),
    sortOrder:      Number(r.sort_order),
  };
}

// ─── Framework CRUD ─────────────────────────────────────────────────────────

export async function listFrameworks(args: {
  schoolId: number; activeOnly?: boolean;
}): Promise<AssessmentFramework[]> {
  const { schoolId, activeOnly = true } = args;
  const rows = (await query(
    `SELECT * FROM assessment_frameworks
      WHERE school_id = ? ${activeOnly ? 'AND is_active = 1' : ''}
      ORDER BY name`,
    [schoolId],
  )) as FrameworkRow[];
  return rows.map(rowToFramework);
}

export async function getFramework(id: number, schoolId: number): Promise<AssessmentFramework | null> {
  const rows = (await query(
    `SELECT * FROM assessment_frameworks WHERE id = ? AND school_id = ? LIMIT 1`,
    [id, schoolId],
  )) as FrameworkRow[];
  if (!rows.length) return null;
  const framework = rowToFramework(rows[0]);
  framework.components = await listComponents(id);

  // Hydrate per-component scoring models for convenience.
  const seen = new Map<number, Awaited<ReturnType<typeof getScoringModel>>>();
  for (const c of framework.components) {
    if (!seen.has(c.scoringModelId)) {
      seen.set(c.scoringModelId, await getScoringModel(c.scoringModelId, schoolId));
    }
    c.scoringModel = seen.get(c.scoringModelId) ?? undefined;
  }
  return framework;
}

export async function createFramework(args: {
  schoolId:  number; createdBy: number | null; input: FrameworkInput;
}): Promise<number> {
  const { schoolId, createdBy, input } = args;
  const code = normalizeCode(input.code);
  if (!isValidCode(code))      throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
  if (!input.name?.trim())     throw new Error('Name is required');

  const r = (await query(
    `INSERT INTO assessment_frameworks
       (school_id, code, name, description, mode, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      schoolId, code, input.name.trim(),
      input.description?.toString().trim() || null,
      input.mode ?? 'numeric',
      input.isActive === false ? 0 : 1,
      createdBy,
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateFramework(args: {
  id: number; schoolId: number; input: Partial<FrameworkInput>;
}): Promise<boolean> {
  const { id, schoolId, input } = args;
  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    if (!isValidCode(code)) throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
    input.code = code;
  }
  const sets: string[] = []; const params: unknown[] = [];
  if (input.code        !== undefined) { sets.push('code = ?');         params.push(input.code); }
  if (input.name        !== undefined) { sets.push('name = ?');         params.push(input.name.trim()); }
  if (input.description !== undefined) { sets.push('description = ?');  params.push(input.description?.toString().trim() || null); }
  if (input.mode        !== undefined) { sets.push('mode = ?');         params.push(input.mode); }
  if (input.isActive    !== undefined) { sets.push('is_active = ?');    params.push(input.isActive ? 1 : 0); }
  if (!sets.length) return true;
  params.push(id, schoolId);
  const r = (await query(
    `UPDATE assessment_frameworks SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

export async function archiveFramework(id: number, schoolId: number): Promise<boolean> {
  const r = (await query(
    `UPDATE assessment_frameworks SET is_active = 0 WHERE id = ? AND school_id = ?`,
    [id, schoolId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

// ─── Component CRUD ────────────────────────────────────────────────────────

export async function listComponents(frameworkId: number): Promise<AssessmentComponent[]> {
  const rows = (await query(
    `SELECT * FROM assessment_components WHERE framework_id = ? ORDER BY sort_order ASC, id ASC`,
    [frameworkId],
  )) as ComponentRow[];
  return rows.map(rowToComponent);
}

export async function createComponent(args: {
  frameworkId: number; schoolId: number; input: ComponentInput;
}): Promise<number> {
  const { frameworkId, schoolId, input } = args;
  const framework = await getFramework(frameworkId, schoolId);
  if (!framework) throw new Error('Framework not found');
  const code = normalizeCode(input.code);
  if (!isValidCode(code))       throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
  if (!input.name?.trim())      throw new Error('Name is required');
  if (!input.scoringModelId)    throw new Error('scoringModelId required');
  const scoringExists = await getScoringModel(input.scoringModelId, schoolId);
  if (!scoringExists) throw new Error('Scoring model not visible to this school');

  const r = (await query(
    `INSERT INTO assessment_components
       (framework_id, code, name, description, scoring_model_id, weight,
        min_score, max_score, is_required, sequence_locked, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      frameworkId, code, input.name.trim(),
      input.description?.toString().trim() || null,
      input.scoringModelId,
      input.weight ?? 1,
      input.minScore ?? null, input.maxScore ?? null,
      input.isRequired ? 1 : 0,
      input.sequenceLocked ? 1 : 0,
      Number(input.sortOrder ?? 100),
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateComponent(args: {
  id: number; frameworkId: number; schoolId: number; input: Partial<ComponentInput>;
}): Promise<boolean> {
  const { id, frameworkId, schoolId, input } = args;
  const framework = await getFramework(frameworkId, schoolId);
  if (!framework) return false;

  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    if (!isValidCode(code)) throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
    input.code = code;
  }
  if (input.scoringModelId !== undefined) {
    const exists = await getScoringModel(input.scoringModelId, schoolId);
    if (!exists) throw new Error('Scoring model not visible to this school');
  }

  const sets: string[] = []; const params: unknown[] = [];
  if (input.code           !== undefined) { sets.push('code = ?');             params.push(input.code); }
  if (input.name           !== undefined) { sets.push('name = ?');             params.push(input.name.trim()); }
  if (input.description    !== undefined) { sets.push('description = ?');      params.push(input.description?.toString().trim() || null); }
  if (input.scoringModelId !== undefined) { sets.push('scoring_model_id = ?'); params.push(input.scoringModelId); }
  if (input.weight         !== undefined) { sets.push('weight = ?');           params.push(input.weight); }
  if (input.minScore       !== undefined) { sets.push('min_score = ?');        params.push(input.minScore); }
  if (input.maxScore       !== undefined) { sets.push('max_score = ?');        params.push(input.maxScore); }
  if (input.isRequired     !== undefined) { sets.push('is_required = ?');      params.push(input.isRequired ? 1 : 0); }
  if (input.sequenceLocked !== undefined) { sets.push('sequence_locked = ?');  params.push(input.sequenceLocked ? 1 : 0); }
  if (input.sortOrder      !== undefined) { sets.push('sort_order = ?');       params.push(Number(input.sortOrder)); }
  if (!sets.length) return true;
  params.push(id, frameworkId);
  const r = (await query(
    `UPDATE assessment_components SET ${sets.join(', ')} WHERE id = ? AND framework_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

export async function deleteComponent(args: {
  id: number; frameworkId: number; schoolId: number;
}): Promise<boolean> {
  const framework = await getFramework(args.frameworkId, args.schoolId);
  if (!framework) return false;
  const r = (await query(
    `DELETE FROM assessment_components WHERE id = ? AND framework_id = ?`,
    [args.id, args.frameworkId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}
