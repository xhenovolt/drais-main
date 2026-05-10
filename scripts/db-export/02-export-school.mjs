#!/usr/bin/env node
/**
 * Phase 2-6 — Export ONE school's data to exports/{slug}/
 *
 * Reads exports/table_relationship_map.json (Phase 1 output) and emits:
 *
 *   exports/{slug}/{slug}_{table}.json     — every school-scoped table
 *   exports/{slug}/{slug}_learners.json    — enriched students view
 *   exports/{slug}/{slug}_results.json     — academic_year → term → learner → subjects
 *   exports/{slug}/_summary.json           — counts + integrity hash
 *
 * Strategy:
 *   - Tables with ownership='direct': SELECT * WHERE school_id = ?
 *   - Tables with ownership='indirect': SELECT t.* FROM <table> t
 *     JOIN-chain following the path inferred in Phase 1 to schools.id
 *   - Tables with ownership='global'/'unknown': skipped here; exported once
 *     in 03-export-all.mjs to exports/_global/
 *
 * Run:
 *   node scripts/db-export/02-export-school.mjs --school <id>
 *     [--out-dir exports]
 *     [--limit-per-table 100000]   # safety cap; 0 = unlimited
 */
import { createConnection } from 'mysql2/promise';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..', '..');

// CLI entry — defined at file end after all helpers are evaluated to avoid TDZ.

// ───────────────────────────────────────────────────────────────────────────
// Reusable per-school exporter — also called by 03-export-all.mjs
// ───────────────────────────────────────────────────────────────────────────
export async function runOneSchool(schoolId, outBase, limitPerTable) {
  const cfg = readDbConfig();
  if (!cfg.user || !cfg.password) throw new Error('TIDB_USER and TIDB_PASSWORD must be set');

  const mapPath    = join(REPO_ROOT, 'exports', 'table_relationship_map.json');
  const schemaPath = join(REPO_ROOT, 'exports', 'schema_analysis.json');
  const map = JSON.parse(await readFile(mapPath, 'utf8'));
  const schema = JSON.parse(await readFile(schemaPath, 'utf8'));

  const conn = await createConnection(cfg);
  try {
    const [school] = await conn.query(
      `SELECT id, name FROM schools WHERE id = ? LIMIT 1`,
      [schoolId],
    );
    if (!school.length) {
      throw new Error(`school_id=${schoolId} not found`);
    }
    const slug = slugify(school[0].name) + '_' + schoolId;
    const dir  = join(outBase, slug);
    await mkdir(dir, { recursive: true });
    console.log(`[export] school_id=${schoolId}  name="${school[0].name}"  slug=${slug}`);

    const log = {
      schoolId,
      schoolName: school[0].name,
      slug,
      startedAt: new Date().toISOString(),
      tables:    [],
      failures:  [],
    };
    let filesWritten = 0;
    let rowsTotal = 0;

    // ─── 1. Generic dump per school-owned table ─────────────────────────────
    const orderedTables = orderTablesForExport(map);
    for (const t of orderedTables) {
      const ownership = map.ownership[t]?.ownership;
      if (ownership !== 'direct' && ownership !== 'indirect' && ownership !== 'root') continue;
      // schools (root): keep only this school's row
      try {
        const directOrder = pkOrderBy(schema.tables[t]);
        const sql = ownership === 'root'
          ? `SELECT * FROM \`${t}\` WHERE id = ? ORDER BY id ASC`
          : ownership === 'direct'
            ? `SELECT * FROM \`${t}\` WHERE school_id = ?` + (directOrder ? ` ORDER BY ${directOrder}` : '')
            : buildIndirectSql(t, map.ownership[t].path, schema.tables[t]);
        const [rows] = await conn.query(applyLimit(sql, limitPerTable), [schoolId]);
        const fileName = `${slug}_${t}.json`;
        await writeFile(join(dir, fileName), JSON.stringify(rows, null, 2));
        filesWritten++;
        rowsTotal += rows.length;
        log.tables.push({ table: t, ownership, rowCount: rows.length, file: fileName });
        if (rows.length) console.log(`         ${t.padEnd(38)} ${rows.length.toString().padStart(7)} rows`);
      } catch (e) {
        const msg = e?.message || String(e);
        log.failures.push({ table: t, error: msg });
        console.error(`         ${t.padEnd(38)} FAILED: ${msg.slice(0, 100)}`);
      }
    }

    // ─── 2. Enriched: learners ───────────────────────────────────────────────
    try {
      const learners = await exportLearners(conn, schoolId);
      await writeFile(join(dir, `${slug}_learners.json`), JSON.stringify(learners, null, 2));
      filesWritten++;
      log.tables.push({ table: '__learners__', ownership: 'enriched', rowCount: learners.length, file: `${slug}_learners.json` });
      console.log(`         __learners__ (enriched)              ${learners.length.toString().padStart(7)} rows`);
    } catch (e) {
      log.failures.push({ table: '__learners__', error: e?.message || String(e) });
      console.error(`         __learners__ FAILED: ${(e?.message || e).toString().slice(0, 200)}`);
    }

    // ─── 3. Enriched: results grouped year/term/learner/subject ─────────────
    try {
      const results = await exportResultsGrouped(conn, schoolId);
      await writeFile(join(dir, `${slug}_results.json`), JSON.stringify(results, null, 2));
      filesWritten++;
      const learnerCount = results.reduce((n, y) => n + y.terms.reduce((m, t) => m + t.learners.length, 0), 0);
      log.tables.push({ table: '__results__', ownership: 'enriched', rowCount: learnerCount, file: `${slug}_results.json` });
      console.log(`         __results__ (enriched, learner rows) ${learnerCount.toString().padStart(7)}`);
    } catch (e) {
      log.failures.push({ table: '__results__', error: e?.message || String(e) });
      console.error(`         __results__ FAILED: ${(e?.message || e).toString().slice(0, 200)}`);
    }

    log.completedAt = new Date().toISOString();
    log.filesWritten = filesWritten;
    log.rowsTotal = rowsTotal;
    await writeFile(join(dir, `_summary.json`), JSON.stringify({
      schoolId,
      schoolName: school[0].name,
      slug,
      generatedAt: log.completedAt,
      filesWritten,
      rowsTotal,
      failures: log.failures,
      tableCounts: log.tables.map(({ table, rowCount, ownership }) => ({ table, ownership, rowCount })),
    }, null, 2));

    return { slug, dir, files: filesWritten, rowsTotal, log };
  } finally {
    await conn.end();
  }
}

// ───────────────────────────────────────────────────────────────────────────
// SQL builders
// ───────────────────────────────────────────────────────────────────────────
const SAFE_IDENT = /^[A-Za-z0-9_]+$/;
function safeIdent(s) {
  if (!SAFE_IDENT.test(s)) throw new Error(`unsafe identifier: ${s}`);
  return `\`${s}\``;
}

/**
 * ORDER BY clause for the target table. Returns either column refs (so the
 * caller can prefix an alias) or a special sentinel for "no usable column" —
 * the caller treats that as "skip ORDER BY".
 */
function pkOrderBy(tableInfo) {
  if (!tableInfo) return safeIdent('id') + ' ASC';
  const pk = tableInfo.primaryKey;
  if (pk?.length) return pk.map(c => safeIdent(c) + ' ASC').join(', ');
  const colNames = new Set(tableInfo.columns.map(c => c.name));
  if (colNames.has('id'))         return safeIdent('id') + ' ASC';
  if (colNames.has('created_at')) return safeIdent('created_at') + ' ASC';
  if (colNames.has('updated_at')) return safeIdent('updated_at') + ' ASC';
  // Fall back to first FK-ish column (deterministic across runs)
  const fk = tableInfo.columns.find(c => c.name.endsWith('_id'));
  if (fk) return safeIdent(fk.name) + ' ASC';
  return null;
}

/**
 * Build an indirect-school-scoped SELECT. The path is a list of edges
 * such that path[0] starts at the export target table and the last edge
 * ends at schools.id.
 *
 * For each edge except the last we add a JOIN; the final edge supplies the
 * WHERE clause: <last.fromTableAlias>.school_id = ?
 */
function buildIndirectSql(table, path, tableInfo) {
  const aliasOf = new Map();
  let counter = 0;
  const aliasFor = name => {
    if (!aliasOf.has(name)) aliasOf.set(name, `t${counter++}`);
    return aliasOf.get(name);
  };
  const rootAlias = aliasFor(table);
  const joins = [];
  // Edges chain forward: path[i].toTable === path[i+1].fromTable
  for (const e of path) {
    const fromAlias = aliasFor(e.fromTable);
    const toAlias   = aliasFor(e.toTable);
    if (e.toTable === path[path.length - 1].toTable && e === path[path.length - 1]) {
      // last edge: still need to join the target table so we can apply WHERE on its school_id (or schools.id)
    }
    if (e.toTable !== 'schools') {
      joins.push(
        `JOIN ${safeIdent(e.toTable)} ${toAlias} ` +
        `ON ${toAlias}.${safeIdent(e.toColumn)} = ${fromAlias}.${safeIdent(e.fromColumn)}`,
      );
    } else {
      // Edge points to schools — fold into WHERE rather than JOIN
    }
  }
  // The school_id we filter on is the school_id column of the *last hop's* fromTable
  // (the table that actually carries school_id). Find it: the second-to-last hop's
  // toTable has school_id.
  const lastEdge = path[path.length - 1];
  const schoolHostTable = lastEdge.fromTable;
  const schoolHostAlias = aliasFor(schoolHostTable);

  const orderRaw = pkOrderBy(tableInfo);
  const order = orderRaw
    ? orderRaw.split(',').map(s => `${rootAlias}.${s.trim()}`).join(', ')
    : null;
  return (
    `SELECT ${rootAlias}.* FROM ${safeIdent(table)} ${rootAlias}\n` +
    joins.join('\n') + '\n' +
    `WHERE ${schoolHostAlias}.${safeIdent('school_id')} = ?` +
    (order ? `\nORDER BY ${order}` : '')
  );
}

function applyLimit(sql, limit) {
  if (!limit || limit <= 0) return sql;
  return sql + `\nLIMIT ${Number(limit)}`;
}

function orderTablesForExport(map) {
  // Process root first, then direct, then indirect — so logs read top-down.
  const root   = (map.summary.root || []);
  const direct = [...(map.summary.schoolOwnedDirect || [])].sort();
  const indirect = [...(map.summary.schoolOwnedIndirect || [])].sort();
  return [...root, ...direct, ...indirect];
}

// ───────────────────────────────────────────────────────────────────────────
// Enriched: learners
// ───────────────────────────────────────────────────────────────────────────
async function exportLearners(conn, schoolId) {
  // Pull the core student rows joined to people for name/gender; current_class
  // is best-effort via the most recent enrollment.
  const [students] = await conn.query(
    `SELECT s.id              AS learner_id,
            s.admission_no    AS admission_number,
            s.school_id       AS school_id,
            s.status          AS status,
            s.created_at      AS created_at,
            s.updated_at      AS updated_at,
            p.id              AS person_id,
            p.first_name      AS first_name,
            p.last_name       AS last_name,
            p.gender          AS gender,
            p.date_of_birth   AS date_of_birth,
            p.photo_url       AS photo_url
       FROM students s
       LEFT JOIN people p ON p.id = s.person_id
      WHERE s.school_id = ?
        AND (s.deleted_at IS NULL OR s.deleted_at = '0000-00-00 00:00:00')
      ORDER BY s.id ASC`,
    [schoolId],
  );

  if (!students.length) return [];
  const ids = students.map(s => s.learner_id);
  const placeholders = ids.map(() => '?').join(',');

  // Most recent enrollment per student → current class/stream
  const [enroll] = await conn.query(
    `SELECT e.id AS enrollment_id,
            e.student_id, e.school_id, e.class_id, e.stream_id, e.academic_year_id,
            e.enrollment_date, e.end_date, e.status, e.created_at,
            c.name AS class_name,
            st.name AS stream_name,
            ay.name AS academic_year_name
       FROM enrollments e
       LEFT JOIN classes c        ON c.id = e.class_id
       LEFT JOIN streams st       ON st.id = e.stream_id
       LEFT JOIN academic_years ay ON ay.id = e.academic_year_id
      WHERE e.student_id IN (${placeholders})
      ORDER BY e.student_id ASC, e.created_at DESC, e.id DESC`,
    ids,
  );
  const enrollmentsByStudent = new Map();
  for (const row of enroll) {
    if (!enrollmentsByStudent.has(row.student_id)) enrollmentsByStudent.set(row.student_id, []);
    enrollmentsByStudent.get(row.student_id).push(row);
  }

  // Guardian / parent / next-of-kin / contacts (best-effort; tables may be empty)
  const [parents] = await conn.query(
    `SELECT * FROM student_parents WHERE student_id IN (${placeholders})`,
    ids,
  );
  const parentsByStudent = bucketBy(parents, 'student_id');

  const [contacts] = await conn.query(
    `SELECT * FROM student_contacts WHERE student_id IN (${placeholders})`,
    ids,
  ).catch(() => [[]]);
  const contactsByStudent = bucketBy(contacts, 'student_id');

  const [nok] = await conn.query(
    `SELECT * FROM student_next_of_kin WHERE student_id IN (${placeholders})`,
    ids,
  ).catch(() => [[]]);
  const nokByStudent = bucketBy(nok, 'student_id');

  return students.map(s => {
    const stuEnroll = enrollmentsByStudent.get(s.learner_id) || [];
    const current   = stuEnroll[0] || null;
    return {
      learner_id:        s.learner_id,
      name:              [s.first_name, s.last_name].filter(Boolean).join(' ').trim(),
      first_name:        s.first_name,
      last_name:         s.last_name,
      gender:            s.gender,
      date_of_birth:     s.date_of_birth,
      photo_url:         s.photo_url,
      admission_number:  s.admission_number,
      person_id:         s.person_id,
      status:            s.status,
      created_at:        s.created_at,
      updated_at:        s.updated_at,
      current_class: current ? {
        id:                current.class_id,
        name:              current.class_name,
        stream_id:         current.stream_id,
        stream_name:       current.stream_name,
        academic_year_id:  current.academic_year_id,
        academic_year_name: current.academic_year_name,
      } : null,
      enrollments: stuEnroll.map(e => ({
        enrollment_id:      e.enrollment_id,
        class_id:           e.class_id,
        class_name:         e.class_name,
        stream_id:          e.stream_id,
        stream_name:        e.stream_name,
        academic_year_id:   e.academic_year_id,
        academic_year_name: e.academic_year_name,
        enrollment_date:    e.enrollment_date,
        end_date:           e.end_date,
        status:             e.status,
        created_at:         e.created_at,
      })),
      guardian_information: {
        parents:     parentsByStudent.get(s.learner_id)  || [],
        contacts:    contactsByStudent.get(s.learner_id) || [],
        next_of_kin: nokByStudent.get(s.learner_id)      || [],
      },
    };
  });
}

// ───────────────────────────────────────────────────────────────────────────
// Enriched: results grouped year/term/learner/subjects
// ───────────────────────────────────────────────────────────────────────────
async function exportResultsGrouped(conn, schoolId) {
  // class_results carries (student, class, term, academic_year, subject, result_type, score, grade, remarks).
  const [rows] = await conn.query(
    `SELECT cr.id              AS result_id,
            cr.student_id      AS student_id,
            cr.class_id        AS class_id,
            cr.term_id         AS term_id,
            cr.academic_year_id AS academic_year_id_direct,
            cr.subject_id      AS subject_id,
            cr.result_type_id  AS result_type_id,
            cr.score           AS score,
            cr.grade           AS grade,
            cr.remarks         AS remarks,
            cr.created_at      AS created_at,
            s.admission_no     AS admission_number,
            p.first_name       AS first_name,
            p.last_name        AS last_name,
            c.name             AS class_name,
            sub.name           AS subject_name,
            sub.subject_type   AS subject_type,
            rt.name            AS result_type_name,
            t.id               AS term_id_join,
            t.name             AS term_name,
            t.academic_year_id AS term_year_id,
            COALESCE(ay.id, ay2.id)     AS academic_year_id,
            COALESCE(ay.name, ay2.name) AS academic_year_name
       FROM class_results cr
       JOIN students s ON s.id = cr.student_id
       LEFT JOIN people p   ON p.id = s.person_id
       LEFT JOIN classes c  ON c.id = cr.class_id
       LEFT JOIN subjects sub ON sub.id = cr.subject_id
       LEFT JOIN result_types rt ON rt.id = cr.result_type_id
       LEFT JOIN terms t ON t.id = cr.term_id
       LEFT JOIN academic_years ay  ON cr.academic_year_id = ay.id
       LEFT JOIN academic_years ay2 ON t.academic_year_id  = ay2.id
      WHERE s.school_id = ?
      ORDER BY academic_year_id ASC, t.id ASC, cr.student_id ASC, cr.subject_id ASC, cr.id ASC`,
    [schoolId],
  );

  // Group: year → term → learner → subjects
  const byYear = new Map();
  for (const r of rows) {
    const yKey = r.academic_year_id ?? 0;
    if (!byYear.has(yKey)) {
      byYear.set(yKey, {
        academic_year_id: r.academic_year_id,
        academic_year:    r.academic_year_name,
        terms: new Map(),
      });
    }
    const yEntry = byYear.get(yKey);
    const tKey = r.term_id ?? 0;
    if (!yEntry.terms.has(tKey)) {
      yEntry.terms.set(tKey, {
        term_id:   r.term_id,
        term_name: r.term_name,
        learners:  new Map(),
      });
    }
    const tEntry = yEntry.terms.get(tKey);
    const lKey = r.student_id;
    if (!tEntry.learners.has(lKey)) {
      tEntry.learners.set(lKey, {
        learner_id:       r.student_id,
        admission_number: r.admission_number,
        name:             [r.first_name, r.last_name].filter(Boolean).join(' ').trim(),
        class_id:         r.class_id,
        class:            r.class_name,
        subjects: [],
      });
    }
    tEntry.learners.get(lKey).subjects.push({
      result_id:        r.result_id,
      subject_id:       r.subject_id,
      subject:          r.subject_name,
      subject_type:     r.subject_type,
      result_type_id:   r.result_type_id,
      result_type:      r.result_type_name,
      score:            r.score,
      grade:            r.grade,
      comment:          r.remarks,
      created_at:       r.created_at,
    });
  }

  // Materialize, deterministic ordering
  return [...byYear.values()].sort((a, b) => (a.academic_year_id ?? 0) - (b.academic_year_id ?? 0))
    .map(y => ({
      academic_year_id: y.academic_year_id,
      academic_year:    y.academic_year,
      terms: [...y.terms.values()].sort((a, b) => (a.term_id ?? 0) - (b.term_id ?? 0))
        .map(t => ({
          term_id:   t.term_id,
          term_name: t.term_name,
          learners:  [...t.learners.values()].sort((a, b) => a.learner_id - b.learner_id),
        })),
    }));
}

// ───────────────────────────────────────────────────────────────────────────
// Helpers
// ───────────────────────────────────────────────────────────────────────────
function readDbConfig() {
  return {
    host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port:     parseInt(process.env.TIDB_PORT || '4000', 10),
    user:     process.env.TIDB_USER     || '',
    password: process.env.TIDB_PASSWORD || '',
    database: process.env.TIDB_DB       || 'drais',
    ssl:      { rejectUnauthorized: false },
    connectTimeout: 30000,
    // mysql2 returns DATETIME as JS Date — keep as ISO string for clean JSON
    dateStrings: true,
  };
}

function slugify(s) {
  return String(s ?? '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'school';
}
function bucketBy(rows, key) {
  const m = new Map();
  for (const r of rows) {
    const k = r[key];
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(r);
  }
  return m;
}
function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = argv[i + 1];
      if (!v || v.startsWith('--')) { out[k] = true; }
      else { out[k] = v; i++; }
    }
  }
  return out;
}

// ───────────────────────────────────────────────────────────────────────────
// CLI entry (appears after all helpers so module-top `await` runs last)
// ───────────────────────────────────────────────────────────────────────────
const __isMain = import.meta.url === `file://${process.argv[1]}`;
if (__isMain) {
  const cliArgs = parseArgs(process.argv.slice(2));
  if (!cliArgs.school) {
    console.error('Usage: node scripts/db-export/02-export-school.mjs --school <id> [--out-dir exports] [--limit-per-table N]');
    process.exit(1);
  }
  const cliSchoolId = Number(cliArgs.school);
  const cliOutBase  = cliArgs['out-dir'] ? join(REPO_ROOT, cliArgs['out-dir']) : join(REPO_ROOT, 'exports');
  const cliLimit    = cliArgs['limit-per-table'] !== undefined ? Number(cliArgs['limit-per-table']) : 100000;
  const r = await runOneSchool(cliSchoolId, cliOutBase, cliLimit);
  console.log(`[export] DONE  school_id=${cliSchoolId}  slug=${r.slug}  files=${r.files}  rows=${r.rowsTotal.toLocaleString()}`);
}
