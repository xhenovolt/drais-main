/**
 * CAFE — scoring model + grade mapping service.
 *
 * Pure SQL wrappers. Validation lives here, not in routes.
 *
 * Visibility rule: a school sees global scoring models (school_id NULL)
 * PLUS its own (school_id matches). Only its own can be edited.
 */
import { query } from '@/lib/db';
import type {
  ScoringModel, ScoringModelInput, ScoringModelConfig, ScoringKind,
  GradeMapping, GradeMappingInput,
} from './types';

// ─── code helpers ───────────────────────────────────────────────────────────

const CODE_RE = /^[a-z][a-z0-9_]{0,62}$/;
export function normalizeCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}
export function isValidCode(code: string): boolean { return CODE_RE.test(code); }

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  try { return JSON.parse(String(raw)) as T; } catch { return null; }
}

// ─── row mappers ────────────────────────────────────────────────────────────

interface ScoringRow {
  id: number; school_id: number | null; code: string; name: string;
  description: string | null; kind: ScoringKind; config_json: string | null;
  is_active: number; created_at: string; updated_at: string;
}
function rowToModel(r: ScoringRow): ScoringModel {
  return {
    id:          Number(r.id),
    schoolId:    r.school_id == null ? null : Number(r.school_id),
    code:        r.code,
    name:        r.name,
    description: r.description,
    kind:        r.kind,
    config:      parseJson<ScoringModelConfig>(r.config_json),
    isActive:    Boolean(r.is_active),
    createdAt:   r.created_at,
    updatedAt:   r.updated_at,
  };
}

interface GradeRow {
  id: number; scoring_model_id: number;
  lower_bound: string | number | null; upper_bound: string | number | null;
  code: string; label: string; descriptor: string | null;
  color: string | null; points: string | number | null; promotes: number;
  sort_order: number;
}
function rowToGrade(r: GradeRow): GradeMapping {
  const num = (v: unknown): number | null =>
    v == null ? null : (typeof v === 'number' ? v : parseFloat(String(v)));
  return {
    id:             Number(r.id),
    scoringModelId: Number(r.scoring_model_id),
    lowerBound:     num(r.lower_bound),
    upperBound:     num(r.upper_bound),
    code:           r.code,
    label:          r.label,
    descriptor:     r.descriptor,
    color:          r.color,
    points:         num(r.points),
    promotes:       Boolean(r.promotes),
    sortOrder:      Number(r.sort_order),
  };
}

// ─── scoring model CRUD ─────────────────────────────────────────────────────

export async function listScoringModels(args: {
  schoolId: number; activeOnly?: boolean; includeGlobal?: boolean;
}): Promise<ScoringModel[]> {
  const { schoolId, activeOnly = true, includeGlobal = true } = args;
  const where = [
    includeGlobal ? '(school_id IS NULL OR school_id = ?)' : 'school_id = ?',
    activeOnly ? 'is_active = 1' : '1',
  ].join(' AND ');
  const rows = (await query(
    `SELECT * FROM scoring_models WHERE ${where} ORDER BY school_id IS NULL DESC, name`,
    [schoolId],
  )) as ScoringRow[];
  return rows.map(rowToModel);
}

export async function getScoringModel(id: number, schoolId: number): Promise<ScoringModel | null> {
  const rows = (await query(
    `SELECT * FROM scoring_models WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
    [id, schoolId],
  )) as ScoringRow[];
  if (!rows.length) return null;
  const model = rowToModel(rows[0]);
  model.grades = await listGradeMappings(id);
  return model;
}

export async function createScoringModel(args: {
  schoolId:  number; createdBy: number | null; input: ScoringModelInput;
}): Promise<number> {
  const { schoolId, createdBy, input } = args;
  const code = normalizeCode(input.code);
  if (!isValidCode(code))            throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
  if (!input.name.trim())            throw new Error('Name is required');
  validateConfigForKind(input.kind, input.config ?? null);

  const r = (await query(
    `INSERT INTO scoring_models (school_id, code, name, description, kind, config_json, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      schoolId, code, input.name.trim(),
      input.description?.toString().trim() || null,
      input.kind,
      input.config ? JSON.stringify(input.config) : null,
      input.isActive === false ? 0 : 1,
      createdBy,
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateScoringModel(args: {
  id: number; schoolId: number; input: Partial<ScoringModelInput>;
}): Promise<boolean> {
  const { id, schoolId, input } = args;
  // Block edits to global catalog rows.
  const existing = await getScoringModel(id, schoolId);
  if (!existing) return false;
  if (existing.schoolId === null) throw new Error('Global catalog scoring models are not editable');

  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    if (!isValidCode(code)) throw new Error('Code must start with a letter and contain only a–z, 0–9, _');
    input.code = code;
  }
  if (input.kind !== undefined || input.config !== undefined) {
    validateConfigForKind(input.kind ?? existing.kind, input.config ?? existing.config);
  }

  const sets: string[] = []; const params: unknown[] = [];
  if (input.code        !== undefined) { sets.push('code = ?');          params.push(input.code); }
  if (input.name        !== undefined) { sets.push('name = ?');          params.push(input.name.trim()); }
  if (input.description !== undefined) { sets.push('description = ?');   params.push(input.description?.toString().trim() || null); }
  if (input.kind        !== undefined) { sets.push('kind = ?');          params.push(input.kind); }
  if (input.config      !== undefined) { sets.push('config_json = ?');   params.push(input.config ? JSON.stringify(input.config) : null); }
  if (input.isActive    !== undefined) { sets.push('is_active = ?');     params.push(input.isActive ? 1 : 0); }
  if (!sets.length) return true;
  params.push(id, schoolId);
  const r = (await query(
    `UPDATE scoring_models SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

export async function archiveScoringModel(id: number, schoolId: number): Promise<boolean> {
  const r = (await query(
    `UPDATE scoring_models SET is_active = 0 WHERE id = ? AND school_id = ?`,
    [id, schoolId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

function validateConfigForKind(kind: ScoringKind, config: ScoringModelConfig | null) {
  if (config == null) return;
  if (kind === 'numeric' || kind === 'scale') {
    const c = config as { min?: number; max?: number };
    if (typeof c.min !== 'number' || typeof c.max !== 'number') {
      throw new Error(`${kind} config must include numeric min and max`);
    }
    if (c.min >= c.max) throw new Error('min must be < max');
  }
  if (kind === 'letter') {
    const c = config as { letters?: unknown };
    if (!Array.isArray(c.letters) || !c.letters.length) {
      throw new Error('letter config requires a non-empty letters array');
    }
  }
}

// ─── grade mappings ─────────────────────────────────────────────────────────

export async function listGradeMappings(scoringModelId: number): Promise<GradeMapping[]> {
  const rows = (await query(
    `SELECT * FROM grade_mappings WHERE scoring_model_id = ? ORDER BY sort_order ASC, id ASC`,
    [scoringModelId],
  )) as GradeRow[];
  return rows.map(rowToGrade);
}

export async function createGradeMapping(args: {
  scoringModelId: number; schoolId: number; input: GradeMappingInput;
}): Promise<number> {
  const { scoringModelId, schoolId, input } = args;
  const existing = await getScoringModel(scoringModelId, schoolId);
  if (!existing) throw new Error('Scoring model not found');
  if (existing.schoolId === null) throw new Error('Global catalog mappings are not editable');
  if (!input.code?.trim() || !input.label?.trim()) throw new Error('code and label required');

  const r = (await query(
    `INSERT INTO grade_mappings
       (scoring_model_id, lower_bound, upper_bound, code, label, descriptor, color, points, promotes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      scoringModelId,
      input.lowerBound ?? null, input.upperBound ?? null,
      input.code.trim(), input.label.trim(),
      input.descriptor?.trim() || null,
      input.color?.trim() || null,
      input.points ?? null,
      input.promotes === false ? 0 : 1,
      Number(input.sortOrder ?? 100),
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateGradeMapping(args: {
  id: number; scoringModelId: number; schoolId: number; input: Partial<GradeMappingInput>;
}): Promise<boolean> {
  const { id, scoringModelId, schoolId, input } = args;
  const existing = await getScoringModel(scoringModelId, schoolId);
  if (!existing) return false;
  if (existing.schoolId === null) throw new Error('Global catalog mappings are not editable');

  const sets: string[] = []; const params: unknown[] = [];
  if (input.lowerBound !== undefined) { sets.push('lower_bound = ?'); params.push(input.lowerBound); }
  if (input.upperBound !== undefined) { sets.push('upper_bound = ?'); params.push(input.upperBound); }
  if (input.code       !== undefined) { sets.push('code = ?');        params.push(input.code.trim()); }
  if (input.label      !== undefined) { sets.push('label = ?');       params.push(input.label.trim()); }
  if (input.descriptor !== undefined) { sets.push('descriptor = ?');  params.push(input.descriptor?.trim() || null); }
  if (input.color      !== undefined) { sets.push('color = ?');       params.push(input.color?.trim() || null); }
  if (input.points     !== undefined) { sets.push('points = ?');      params.push(input.points); }
  if (input.promotes   !== undefined) { sets.push('promotes = ?');    params.push(input.promotes ? 1 : 0); }
  if (input.sortOrder  !== undefined) { sets.push('sort_order = ?');  params.push(Number(input.sortOrder)); }
  if (!sets.length) return true;
  params.push(id, scoringModelId);
  const r = (await query(
    `UPDATE grade_mappings SET ${sets.join(', ')} WHERE id = ? AND scoring_model_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

export async function deleteGradeMapping(args: {
  id: number; scoringModelId: number; schoolId: number;
}): Promise<boolean> {
  const existing = await getScoringModel(args.scoringModelId, args.schoolId);
  if (!existing) return false;
  if (existing.schoolId === null) throw new Error('Global catalog mappings are not editable');
  const r = (await query(
    `DELETE FROM grade_mappings WHERE id = ? AND scoring_model_id = ?`,
    [args.id, args.scoringModelId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}
