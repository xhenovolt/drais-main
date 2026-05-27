/**
 * Search index builders. Project source tables into search_index rows.
 *
 * Two entry points:
 *  - reindexSchool(schoolId, type?)  — bulk rebuild (backfill / admin button / cron)
 *  - reindexEntity(schoolId, type, id) — incremental upsert; mutation routes may
 *    call this fire-and-forget after a write to keep the index fresh.
 *
 * Builders are deliberately defensive: a missing optional table/column must
 * not break indexing of the others (each is wrapped by the caller).
 */
import { query } from '@/lib/db';
import type { SearchEntityType } from './entities';
import { SEARCH_ENTITIES } from './entities';

interface IndexRow {
  entity_type: SearchEntityType;
  entity_id:   number;
  title:       string;
  subtitle:    string | null;
  search_text: string;
  url_path:    string | null;
  metadata:    Record<string, unknown> | null;
}

function norm(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

async function upsertRows(schoolId: number, type: SearchEntityType, rows: IndexRow[]): Promise<void> {
  if (!rows.length) return;
  const weight = SEARCH_ENTITIES[type].rankWeight;
  // Chunk to keep statements bounded.
  const CHUNK = 200;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const values = slice.map(() => '(?,?,?,?,?,?,?,?,?)').join(',');
    const params: any[] = [];
    for (const r of slice) {
      params.push(
        schoolId, r.entity_type, r.entity_id, r.title, r.subtitle,
        r.search_text, weight, r.url_path, r.metadata ? JSON.stringify(r.metadata) : null,
      );
    }
    await query(
      `INSERT INTO search_index
         (school_id, entity_type, entity_id, title, subtitle, search_text, rank_weight, url_path, metadata)
       VALUES ${values}
       ON DUPLICATE KEY UPDATE
         title=VALUES(title), subtitle=VALUES(subtitle), search_text=VALUES(search_text),
         rank_weight=VALUES(rank_weight), url_path=VALUES(url_path), metadata=VALUES(metadata)`,
      params,
    );
  }
}

// ── builders ────────────────────────────────────────────────────────────────

async function buildStudents(schoolId: number): Promise<IndexRow[]> {
  const rows = (await query(
    `SELECT s.id, s.admission_no, s.status,
            p.first_name, p.last_name, p.phone,
            c.name AS class_name
       FROM students s
       LEFT JOIN people p  ON p.id = s.person_id
       LEFT JOIN classes c ON c.id = s.class_id
      WHERE s.school_id = ? AND s.deleted_at IS NULL`,
    [schoolId],
  )) as any[];
  return rows.map(r => {
    const name = norm(r.first_name, r.last_name) || `learner ${r.id}`;
    const title = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || `Learner #${r.id}`;
    return {
      entity_type: 'student', entity_id: Number(r.id), title,
      subtitle: [r.admission_no ? `Adm ${r.admission_no}` : null, r.class_name, r.status]
        .filter(Boolean).join(' • ') || null,
      search_text: norm(name, r.admission_no, r.class_name, r.status, r.phone),
      url_path: `/students/${r.id}`,
      metadata: { class_name: r.class_name ?? null, status: r.status ?? null, phone: r.phone ?? null },
    };
  });
}

async function buildStaff(schoolId: number): Promise<IndexRow[]> {
  const rows = (await query(
    `SELECT st.id, st.position,
            p.first_name, p.last_name, p.phone, p.email
       FROM staff st
       LEFT JOIN people p ON p.id = st.person_id
      WHERE st.school_id = ? AND st.deleted_at IS NULL`,
    [schoolId],
  )) as any[];
  return rows.map(r => {
    const title = `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || `Staff #${r.id}`;
    return {
      entity_type: 'staff', entity_id: Number(r.id), title,
      subtitle: [r.position, r.phone].filter(Boolean).join(' • ') || null,
      search_text: norm(r.first_name, r.last_name, r.position, r.phone, r.email),
      url_path: `/staff/${r.id}`,
      metadata: { position: r.position ?? null, phone: r.phone ?? null },
    };
  });
}

async function buildClasses(schoolId: number): Promise<IndexRow[]> {
  const rows = (await query(
    `SELECT id, name, class_level FROM classes WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  return rows.map(r => ({
    entity_type: 'class', entity_id: Number(r.id), title: r.name,
    subtitle: r.class_level != null ? `Level ${r.class_level}` : null,
    search_text: norm(r.name, r.class_level != null ? `level ${r.class_level}` : ''),
    url_path: `/academics/classes/${r.id}`,
    metadata: null,
  }));
}

async function buildSubjects(schoolId: number): Promise<IndexRow[]> {
  const rows = (await query(
    `SELECT id, name, code FROM subjects WHERE school_id = ?`,
    [schoolId],
  )) as any[];
  return rows.map(r => ({
    entity_type: 'subject', entity_id: Number(r.id), title: r.name,
    subtitle: r.code || null,
    search_text: norm(r.name, r.code),
    url_path: `/academics/subjects/${r.id}`,
    metadata: null,
  }));
}

const BUILDERS: Partial<Record<SearchEntityType, (schoolId: number) => Promise<IndexRow[]>>> = {
  student: buildStudents,
  staff:   buildStaff,
  class:   buildClasses,
  subject: buildSubjects,
};

/** Rebuild the index for one school (optionally one entity type). Returns counts. */
export async function reindexSchool(
  schoolId: number,
  only?: SearchEntityType,
): Promise<Record<string, number>> {
  const types = only ? [only] : (Object.keys(BUILDERS) as SearchEntityType[]);
  const counts: Record<string, number> = {};
  for (const type of types) {
    const builder = BUILDERS[type];
    if (!builder) continue;
    try {
      const rows = await builder(schoolId);
      // Replace this type's slice atomically-ish: delete stale, upsert fresh.
      await query(`DELETE FROM search_index WHERE school_id = ? AND entity_type = ?`, [schoolId, type]);
      await upsertRows(schoolId, type, rows);
      counts[type] = rows.length;
    } catch (e) {
      console.error(`[search] reindex ${type} failed for school ${schoolId}`, e);
      counts[type] = -1;
    }
  }
  return counts;
}

/** Incremental upsert of a single entity. Fire-and-forget safe. */
export async function reindexEntity(
  schoolId: number,
  type: SearchEntityType,
  entityId: number,
): Promise<void> {
  const builder = BUILDERS[type];
  if (!builder) return;
  try {
    const rows = (await builder(schoolId)).filter(r => r.entity_id === entityId);
    if (rows.length) await upsertRows(schoolId, type, rows);
    else await query(
      `DELETE FROM search_index WHERE school_id = ? AND entity_type = ? AND entity_id = ?`,
      [schoolId, type, entityId],
    );
  } catch (e) {
    console.error(`[search] reindexEntity ${type}#${entityId} failed`, e);
  }
}
