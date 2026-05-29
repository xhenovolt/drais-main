/**
 * P1 — Custom Field Engine service layer.
 *
 * Thin SQL wrapper around the `custom_fields` and `student_custom_values`
 * tables. All callers stay school-scoped: every read takes `schoolId`,
 * every write joins back to it. Validation lives here, not in routes.
 *
 * The DRCE binding surface (`student.custom.<code>`) is built from the
 * field list — see src/lib/snapshots/queries.ts for the join that pulls
 * values into the snapshot per student.
 */
import { query } from '@/lib/db';

export type CustomFieldType =
  | 'text' | 'long_text' | 'number' | 'date' | 'boolean'
  | 'select' | 'multiselect' | 'phone' | 'email' | 'url';

export type CustomFieldEntity = 'student' | 'staff';

export interface CustomFieldOption { value: string; label: string }

export interface CustomFieldValidation {
  min?: number; max?: number;
  minLength?: number; maxLength?: number;
  pattern?: string;
  required?: boolean;
}

export interface CustomFieldDef {
  id:               number;
  schoolId:         number;
  entityType:       CustomFieldEntity;
  code:             string;
  label:            string;
  description:      string | null;
  dataType:         CustomFieldType;
  options:          CustomFieldOption[] | null;
  validation:       CustomFieldValidation | null;
  defaultValue:     string | null;
  isRequired:       boolean;
  isSearchable:     boolean;
  readPermission:   string | null;
  writePermission:  string | null;
  displayOrder:     number;
  isActive:         boolean;
  createdAt:        string;
  updatedAt:        string;
}

/** The serialized value type for a single field (over the wire). */
export type CustomFieldValue =
  | string | number | boolean | string[] | null;

// ─── code helpers ───────────────────────────────────────────────────────────

const CODE_RE = /^[a-z][a-z0-9_]{0,62}$/;

export function normalizeCode(input: string): string {
  return input.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '');
}

export function isValidCode(code: string): boolean {
  return CODE_RE.test(code);
}

// ─── row mappers ────────────────────────────────────────────────────────────

interface FieldRow {
  id: number; school_id: number; entity_type: CustomFieldEntity;
  code: string; label: string; description: string | null;
  data_type: CustomFieldType;
  options_json: string | null;
  validation_json: string | null;
  default_value: string | null;
  is_required: number; is_searchable: number;
  read_permission: string | null; write_permission: string | null;
  display_order: number; is_active: number;
  created_at: string; updated_at: string;
}

function rowToDef(r: FieldRow): CustomFieldDef {
  return {
    id:              Number(r.id),
    schoolId:        Number(r.school_id),
    entityType:      r.entity_type,
    code:            r.code,
    label:           r.label,
    description:     r.description,
    dataType:        r.data_type,
    options:         parseJson<CustomFieldOption[]>(r.options_json),
    validation:      parseJson<CustomFieldValidation>(r.validation_json),
    defaultValue:    r.default_value,
    isRequired:      Boolean(r.is_required),
    isSearchable:    Boolean(r.is_searchable),
    readPermission:  r.read_permission,
    writePermission: r.write_permission,
    displayOrder:    Number(r.display_order),
    isActive:        Boolean(r.is_active),
    createdAt:       r.created_at,
    updatedAt:       r.updated_at,
  };
}

function parseJson<T>(raw: string | null): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;  // mysql2 already parses JSON
  try { return JSON.parse(raw) as T; } catch { return null; }
}

// ─── field CRUD ─────────────────────────────────────────────────────────────

export async function listFields(args: {
  schoolId:   number;
  entityType?: CustomFieldEntity;
  activeOnly?: boolean;
}): Promise<CustomFieldDef[]> {
  const { schoolId, entityType = 'student', activeOnly = true } = args;
  const sql = `
    SELECT * FROM custom_fields
     WHERE school_id = ? AND entity_type = ?
       ${activeOnly ? 'AND is_active = 1' : ''}
     ORDER BY display_order ASC, label ASC`;
  const rows = (await query(sql, [schoolId, entityType])) as FieldRow[];
  return rows.map(rowToDef);
}

export async function getFieldById(id: number, schoolId: number): Promise<CustomFieldDef | null> {
  const rows = (await query(
    `SELECT * FROM custom_fields WHERE id = ? AND school_id = ? LIMIT 1`,
    [id, schoolId],
  )) as FieldRow[];
  return rows.length ? rowToDef(rows[0]) : null;
}

export interface FieldInput {
  entityType?:      CustomFieldEntity;
  code:             string;
  label:            string;
  description?:     string | null;
  dataType:         CustomFieldType;
  options?:         CustomFieldOption[] | null;
  validation?:      CustomFieldValidation | null;
  defaultValue?:    string | null;
  isRequired?:      boolean;
  isSearchable?:    boolean;
  readPermission?:  string | null;
  writePermission?: string | null;
  displayOrder?:    number;
  isActive?:        boolean;
}

export async function createField(args: {
  schoolId:  number;
  createdBy: number | null;
  input:     FieldInput;
}): Promise<number> {
  const { schoolId, createdBy, input } = args;
  const code = normalizeCode(input.code);
  if (!isValidCode(code)) throw new Error('Field code must start with a letter and contain only a–z, 0–9, _');
  if (!input.label.trim()) throw new Error('Label is required');
  validateOptionsForType(input);

  const r = (await query(
    `INSERT INTO custom_fields
       (school_id, entity_type, code, label, description, data_type,
        options_json, validation_json, default_value,
        is_required, is_searchable, read_permission, write_permission,
        display_order, is_active, created_by)
     VALUES (?, ?, ?, ?, ?, ?,
             ?, ?, ?,
             ?, ?, ?, ?,
             ?, ?, ?)`,
    [
      schoolId,
      input.entityType ?? 'student',
      code,
      input.label.trim(),
      input.description?.trim() || null,
      input.dataType,
      input.options ? JSON.stringify(input.options) : null,
      input.validation ? JSON.stringify(input.validation) : null,
      input.defaultValue ?? null,
      input.isRequired ? 1 : 0,
      input.isSearchable === false ? 0 : 1,
      input.readPermission ?? null,
      input.writePermission ?? null,
      Number(input.displayOrder ?? 100),
      input.isActive === false ? 0 : 1,
      createdBy,
    ],
  )) as { insertId?: number };
  return Number(r.insertId);
}

export async function updateField(args: {
  id: number; schoolId: number; input: Partial<FieldInput>;
}): Promise<boolean> {
  const { id, schoolId, input } = args;
  if (input.code !== undefined) {
    const code = normalizeCode(input.code);
    if (!isValidCode(code)) throw new Error('Field code must start with a letter and contain only a–z, 0–9, _');
    input.code = code;
  }
  if (input.label !== undefined && !input.label.trim()) throw new Error('Label is required');
  if (input.options !== undefined || input.dataType !== undefined) {
    const existing = await getFieldById(id, schoolId);
    if (!existing) return false;
    const merged: FieldInput = {
      code:     input.code     ?? existing.code,
      label:    input.label    ?? existing.label,
      dataType: input.dataType ?? existing.dataType,
      options:  input.options  ?? existing.options,
    };
    validateOptionsForType(merged);
  }

  const sets: string[] = [];
  const params: unknown[] = [];
  const push = (col: string, val: unknown) => { sets.push(`${col} = ?`); params.push(val); };

  if (input.code        !== undefined) push('code', input.code);
  if (input.label       !== undefined) push('label', input.label.trim());
  if (input.description !== undefined) push('description', input.description?.toString().trim() || null);
  if (input.dataType    !== undefined) push('data_type', input.dataType);
  if (input.options     !== undefined) push('options_json', input.options ? JSON.stringify(input.options) : null);
  if (input.validation  !== undefined) push('validation_json', input.validation ? JSON.stringify(input.validation) : null);
  if (input.defaultValue !== undefined) push('default_value', input.defaultValue);
  if (input.isRequired  !== undefined) push('is_required', input.isRequired ? 1 : 0);
  if (input.isSearchable !== undefined) push('is_searchable', input.isSearchable ? 1 : 0);
  if (input.readPermission  !== undefined) push('read_permission', input.readPermission);
  if (input.writePermission !== undefined) push('write_permission', input.writePermission);
  if (input.displayOrder !== undefined) push('display_order', Number(input.displayOrder));
  if (input.isActive    !== undefined) push('is_active', input.isActive ? 1 : 0);

  if (!sets.length) return true;
  params.push(id, schoolId);
  const r = (await query(
    `UPDATE custom_fields SET ${sets.join(', ')} WHERE id = ? AND school_id = ?`,
    params,
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

/** Soft-delete: flip is_active to 0. Hard-delete would orphan values. */
export async function archiveField(id: number, schoolId: number): Promise<boolean> {
  const r = (await query(
    `UPDATE custom_fields SET is_active = 0 WHERE id = ? AND school_id = ?`,
    [id, schoolId],
  )) as { affectedRows?: number };
  return Number(r.affectedRows) > 0;
}

function validateOptionsForType(input: Pick<FieldInput, 'dataType' | 'options'>) {
  const needs = input.dataType === 'select' || input.dataType === 'multiselect';
  if (needs && (!input.options || !input.options.length)) {
    throw new Error('select / multiselect fields require at least one option');
  }
  if (!needs && input.options && input.options.length) {
    // Silently strip — not an error so editing the data_type later doesn't blow up.
    input.options = null;
  }
}

// ─── value read / write ─────────────────────────────────────────────────────

interface ValueRow {
  field_id: number;
  value_text: string | null;
  value_number: string | number | null;
  value_date: string | null;
  value_bool: number | null;
  value_json: string | null;
}

/** Pulls all custom values for a single student, keyed by field code. */
export async function getStudentCustomValues(
  studentId: number, schoolId: number,
): Promise<Record<string, CustomFieldValue>> {
  const rows = (await query(
    `SELECT v.field_id, v.value_text, v.value_number, v.value_date, v.value_bool, v.value_json,
            f.code, f.data_type
       FROM student_custom_values v
       JOIN custom_fields f ON f.id = v.field_id
      WHERE v.student_id = ? AND f.school_id = ? AND f.is_active = 1`,
    [studentId, schoolId],
  )) as Array<ValueRow & { code: string; data_type: CustomFieldType }>;
  const out: Record<string, CustomFieldValue> = {};
  for (const r of rows) out[r.code] = decodeValue(r, r.data_type);
  return out;
}

/**
 * Bulk read for a batch of students — used by the snapshot builder so each
 * snapshot regeneration is one query, not N.
 */
export async function getStudentCustomValuesBulk(args: {
  studentIds: readonly number[];
  schoolId:   number;
}): Promise<Map<number, Record<string, CustomFieldValue>>> {
  const { studentIds, schoolId } = args;
  const out = new Map<number, Record<string, CustomFieldValue>>();
  if (!studentIds.length) return out;
  const placeholders = studentIds.map(() => '?').join(',');
  const rows = (await query(
    `SELECT v.student_id, v.field_id, v.value_text, v.value_number, v.value_date,
            v.value_bool, v.value_json, f.code, f.data_type
       FROM student_custom_values v
       JOIN custom_fields f ON f.id = v.field_id
      WHERE v.student_id IN (${placeholders}) AND f.school_id = ? AND f.is_active = 1`,
    [...studentIds, schoolId],
  )) as Array<ValueRow & { student_id: number; code: string; data_type: CustomFieldType }>;
  for (const r of rows) {
    const sid = Number(r.student_id);
    if (!out.has(sid)) out.set(sid, {});
    out.get(sid)![r.code] = decodeValue(r, r.data_type);
  }
  return out;
}

function decodeValue(r: ValueRow, type: CustomFieldType): CustomFieldValue {
  switch (type) {
    case 'number': {
      if (r.value_number == null) return null;
      const n = typeof r.value_number === 'number' ? r.value_number : parseFloat(r.value_number);
      return Number.isFinite(n) ? n : null;
    }
    case 'date':    return r.value_date ?? null;
    case 'boolean': return r.value_bool == null ? null : Boolean(r.value_bool);
    case 'multiselect': {
      const j = parseJson<string[]>(r.value_json);
      return Array.isArray(j) ? j : [];
    }
    default: return r.value_text ?? null;
  }
}

/**
 * Upsert one or more values for a single student. Values are keyed by field
 * code (the binding-facing identifier). Unknown / inactive codes are silently
 * skipped so partial UI payloads don't fail. Setting a value to null clears
 * the row.
 */
export async function setStudentCustomValues(args: {
  studentId: number;
  schoolId:  number;
  updatedBy: number | null;
  values:    Record<string, CustomFieldValue>;
}): Promise<{ written: number; cleared: number; skipped: string[] }> {
  const { studentId, schoolId, updatedBy, values } = args;
  const fields = await listFields({ schoolId, entityType: 'student', activeOnly: true });
  const byCode = new Map(fields.map(f => [f.code, f]));
  const written: string[] = [];
  const cleared: string[] = [];
  const skipped: string[] = [];

  for (const [code, raw] of Object.entries(values)) {
    const field = byCode.get(code);
    if (!field) { skipped.push(code); continue; }
    try {
      validateValueAgainstField(field, raw);
    } catch {
      skipped.push(code); continue;
    }

    if (raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) {
      await query(
        `DELETE FROM student_custom_values WHERE student_id = ? AND field_id = ?`,
        [studentId, field.id],
      );
      cleared.push(code);
      continue;
    }

    const enc = encodeValue(field.dataType, raw);
    await query(
      `INSERT INTO student_custom_values
         (student_id, field_id, value_text, value_number, value_date, value_bool, value_json, updated_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         value_text   = VALUES(value_text),
         value_number = VALUES(value_number),
         value_date   = VALUES(value_date),
         value_bool   = VALUES(value_bool),
         value_json   = VALUES(value_json),
         updated_by   = VALUES(updated_by)`,
      [studentId, field.id, enc.text, enc.number, enc.date, enc.bool, enc.json, updatedBy],
    );
    written.push(code);
  }
  return { written: written.length, cleared: cleared.length, skipped };
}

function encodeValue(type: CustomFieldType, raw: CustomFieldValue): {
  text: string | null; number: number | null; date: string | null;
  bool: number | null; json: string | null;
} {
  const empty = { text: null, number: null, date: null, bool: null, json: null };
  if (raw === null || raw === undefined) return empty;
  switch (type) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      return { ...empty, number: Number.isFinite(n) ? n : null };
    }
    case 'date':
      return { ...empty, date: String(raw).slice(0, 10) };  // YYYY-MM-DD
    case 'boolean':
      return { ...empty, bool: raw ? 1 : 0 };
    case 'multiselect': {
      const arr = Array.isArray(raw) ? raw : [String(raw)];
      return { ...empty, json: JSON.stringify(arr) };
    }
    default:
      return { ...empty, text: String(raw) };
  }
}

function validateValueAgainstField(field: CustomFieldDef, raw: CustomFieldValue): void {
  if (raw === null || raw === undefined) {
    if (field.isRequired) throw new Error(`Field "${field.code}" is required`);
    return;
  }
  const v = field.validation ?? {};
  switch (field.dataType) {
    case 'number': {
      const n = typeof raw === 'number' ? raw : parseFloat(String(raw));
      if (!Number.isFinite(n)) throw new Error(`"${field.code}" must be numeric`);
      if (v.min != null && n < v.min) throw new Error(`"${field.code}" must be ≥ ${v.min}`);
      if (v.max != null && n > v.max) throw new Error(`"${field.code}" must be ≤ ${v.max}`);
      return;
    }
    case 'date': {
      if (!/^\d{4}-\d{2}-\d{2}/.test(String(raw))) throw new Error(`"${field.code}" must be a YYYY-MM-DD date`);
      return;
    }
    case 'boolean':
      return;
    case 'select': {
      const opts = field.options ?? [];
      if (opts.length && !opts.some(o => o.value === String(raw))) {
        throw new Error(`"${field.code}" must be one of the configured options`);
      }
      return;
    }
    case 'multiselect': {
      const arr = Array.isArray(raw) ? raw.map(String) : [String(raw)];
      const opts = new Set((field.options ?? []).map(o => o.value));
      if (opts.size) {
        for (const x of arr) if (!opts.has(x)) throw new Error(`"${field.code}" contains an invalid option (${x})`);
      }
      return;
    }
    case 'email': {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(raw))) throw new Error(`"${field.code}" must be an email`);
      return;
    }
    case 'url': {
      try { new URL(String(raw)); } catch { throw new Error(`"${field.code}" must be a URL`); }
      return;
    }
    default: {
      const s = String(raw);
      if (v.minLength != null && s.length < v.minLength) throw new Error(`"${field.code}" too short`);
      if (v.maxLength != null && s.length > v.maxLength) throw new Error(`"${field.code}" too long`);
      if (v.pattern) {
        try {
          if (!new RegExp(v.pattern).test(s)) throw new Error(`"${field.code}" does not match the required pattern`);
        } catch (e) {
          if ((e as Error).message.startsWith(`"${field.code}"`)) throw e;
          // invalid regex in config → ignore validation, never block save
        }
      }
    }
  }
}
