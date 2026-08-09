/**
 * GET /api/reports/custom — the query engine behind /reports/custom.
 *
 * A report builder is, by definition, a place where the user chooses columns,
 * filters and sort order. Those are SQL *identifiers*, and `?` placeholders
 * cannot carry identifiers — so the only safe construction is an ALLOW-LIST:
 * the client sends keys, and this file maps keys to SQL it wrote itself. A key
 * that is not in the catalogue is dropped, never interpolated. User-supplied
 * VALUES always go through `?`.
 *
 * Two modes:
 *   ?meta=1                  → the catalogue (datasets, columns, filters)
 *   ?dataset=…&columns=…&…   → rows
 *
 * The UI renders itself from the catalogue rather than hardcoding a second copy
 * of it, so adding a column here makes it appear in the builder with no client
 * change.
 *
 * Tenancy: every dataset's `where` opens with a school_id predicate bound from
 * the session. It is not optional and not client-supplied.
 */
import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

type FilterType = 'text' | 'enum' | 'date';

interface FilterDef {
  label: string;
  sql: string;
  type: FilterType;
  options?: string[];
  /** date filters bind as a range: ?f_from / ?f_to */
  range?: boolean;
}

interface ColumnDef {
  label: string;
  sql: string;
  /** money/number columns right-align and format in the client */
  kind?: 'text' | 'number' | 'money' | 'date';
}

interface DatasetDef {
  label: string;
  description: string;
  from: string;
  /** MUST begin with the school_id predicate; one `?` bound to schoolId. */
  where: string;
  groupBy?: string;
  columns: Record<string, ColumnDef>;
  filters: Record<string, FilterDef>;
  defaultColumns: string[];
  defaultOrder: string;
}

const DATASETS: Record<string, DatasetDef> = {
  students: {
    label: 'Learners',
    description: 'Enrolled learners with class, demographics and admission details.',
    from: `
      FROM students s
      JOIN people p ON p.id = s.person_id AND p.deleted_at IS NULL
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      LEFT JOIN classes c ON c.id = e.class_id
    `,
    where: `s.school_id = ? AND s.deleted_at IS NULL`,
    columns: {
      admission_no: { label: 'Admission no', sql: 's.admission_no' },
      name: { label: 'Name', sql: `CONCAT(p.first_name, ' ', p.last_name)` },
      class_name: { label: 'Class', sql: 'c.name' },
      gender: { label: 'Gender', sql: 'p.gender' },
      date_of_birth: { label: 'Date of birth', sql: 'p.date_of_birth', kind: 'date' },
      status: { label: 'Status', sql: 's.status' },
      admission_date: { label: 'Admitted', sql: 's.admission_date', kind: 'date' },
    },
    filters: {
      status: { label: 'Status', sql: 's.status', type: 'enum', options: ['active', 'inactive'] },
      gender: { label: 'Gender', sql: 'p.gender', type: 'enum', options: ['M', 'F'] },
      class_name: { label: 'Class', sql: 'c.name', type: 'text' },
      admission_date: { label: 'Admitted', sql: 's.admission_date', type: 'date', range: true },
    },
    defaultColumns: ['admission_no', 'name', 'class_name', 'gender', 'status'],
    defaultOrder: 'name',
  },

  staff: {
    label: 'Staff',
    description: 'Staff records with position, status and length of service.',
    from: `
      FROM staff st
      JOIN people p ON p.id = st.person_id AND p.deleted_at IS NULL
    `,
    // staff carries deleted_at — 14 of 279 rows are soft-deleted in production.
    // Omitting this filter is how a departed staff member reappears in a count.
    where: `st.school_id = ? AND st.deleted_at IS NULL`,
    columns: {
      staff_no: { label: 'Staff no', sql: 'st.staff_no' },
      name: { label: 'Name', sql: `CONCAT(p.first_name, ' ', p.last_name)` },
      position: { label: 'Position', sql: 'st.position' },
      status: { label: 'Status', sql: 'st.status' },
      hire_date: { label: 'Hired', sql: 'st.hire_date', kind: 'date' },
      years_served: {
        label: 'Years served',
        sql: `ROUND(DATEDIFF(CURDATE(), st.hire_date) / 365, 1)`,
        kind: 'number',
      },
      gender: { label: 'Gender', sql: 'p.gender' },
    },
    filters: {
      status: { label: 'Status', sql: 'st.status', type: 'enum', options: ['active', 'inactive'] },
      position: { label: 'Position', sql: 'st.position', type: 'text' },
      hire_date: { label: 'Hired', sql: 'st.hire_date', type: 'date', range: true },
    },
    defaultColumns: ['staff_no', 'name', 'position', 'status', 'hire_date'],
    defaultOrder: 'name',
  },

  fee_balances: {
    label: 'Fee balances',
    description: 'Per-learner expected, paid and outstanding amounts.',
    from: `
      FROM students s
      JOIN people p ON p.id = s.person_id AND p.deleted_at IS NULL
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      LEFT JOIN classes c ON c.id = e.class_id
      LEFT JOIN student_fee_items sfi ON sfi.student_id = s.id
    `,
    where: `s.school_id = ? AND s.deleted_at IS NULL AND s.status = 'active'`,
    groupBy: 's.id, p.first_name, p.last_name, s.admission_no, c.name',
    columns: {
      admission_no: { label: 'Admission no', sql: 's.admission_no' },
      name: { label: 'Name', sql: `CONCAT(p.first_name, ' ', p.last_name)` },
      class_name: { label: 'Class', sql: 'c.name' },
      expected: { label: 'Expected', sql: 'COALESCE(SUM(sfi.amount), 0)', kind: 'money' },
      paid: { label: 'Paid', sql: 'COALESCE(SUM(sfi.paid), 0)', kind: 'money' },
      balance: { label: 'Balance', sql: 'COALESCE(SUM(sfi.balance), 0)', kind: 'money' },
    },
    filters: {
      class_name: { label: 'Class', sql: 'c.name', type: 'text' },
    },
    defaultColumns: ['admission_no', 'name', 'class_name', 'expected', 'paid', 'balance'],
    defaultOrder: 'balance',
  },

  attendance: {
    label: 'Attendance',
    description: 'Daily learner attendance, with arrival time and lateness.',
    /**
     * Reads `attendance_records` — the table the attendance ENGINE writes.
     *
     * NOT `student_attendance`. That table still exists and is empty (0 rows in
     * production), while attendance_records holds 15,347. Anything still
     * pointed at the old table reports "no attendance" forever and looks like
     * a broken query rather than a wrong one. `/api/analytics/attendance` is
     * still in that state — see the note on this commit.
     *
     * attendance_records is keyed by (person_id, role_type), NOT student_id, so
     * the join to students goes through people.
     */
    from: `
      FROM attendance_records ar
      JOIN people p ON p.id = ar.person_id AND p.deleted_at IS NULL
      LEFT JOIN students s ON s.person_id = ar.person_id
        AND s.school_id = ar.school_id AND s.deleted_at IS NULL
      LEFT JOIN enrollments e ON e.student_id = s.id AND e.status = 'active'
      LEFT JOIN classes c ON c.id = e.class_id
    `,
    where: `ar.school_id = ? AND ar.role_type = 'student'`,
    columns: {
      date: { label: 'Date', sql: 'ar.attendance_date', kind: 'date' },
      admission_no: { label: 'Admission no', sql: 's.admission_no' },
      name: { label: 'Name', sql: `CONCAT(p.first_name, ' ', p.last_name)` },
      class_name: { label: 'Class', sql: 'c.name' },
      status: { label: 'Status', sql: 'ar.status' },
      first_in_at: { label: 'Arrived', sql: 'ar.first_in_at' },
      late_minutes: { label: 'Late (min)', sql: 'ar.late_minutes', kind: 'number' },
    },
    filters: {
      status: {
        label: 'Status',
        sql: 'ar.status',
        type: 'enum',
        // Exactly the enum the column declares — a value outside it is dropped.
        options: ['present', 'late', 'absent', 'half_day', 'early_leave', 'holiday', 'weekend'],
      },
      class_name: { label: 'Class', sql: 'c.name', type: 'text' },
      date: { label: 'Date', sql: 'ar.attendance_date', type: 'date', range: true },
    },
    defaultColumns: ['date', 'admission_no', 'name', 'class_name', 'status', 'late_minutes'],
    defaultOrder: 'date',
  },
};

/** The catalogue, minus the SQL — the client never needs (or sees) that. */
function catalogue() {
  return Object.entries(DATASETS).map(([key, d]) => ({
    key,
    label: d.label,
    description: d.description,
    defaultColumns: d.defaultColumns,
    defaultOrder: d.defaultOrder,
    columns: Object.entries(d.columns).map(([ck, c]) => ({
      key: ck,
      label: c.label,
      kind: c.kind ?? 'text',
    })),
    filters: Object.entries(d.filters).map(([fk, f]) => ({
      key: fk,
      label: f.label,
      type: f.type,
      options: f.options ?? null,
      range: !!f.range,
    })),
  }));
}

const MAX_ROWS = 5000;

export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;
    const sp = new URL(req.url).searchParams;

    if (sp.get('meta') === '1') {
      return NextResponse.json({ success: true, datasets: catalogue() });
    }

    const datasetKey = sp.get('dataset') || '';
    const ds = DATASETS[datasetKey];
    if (!ds) {
      return NextResponse.json(
        { success: false, error: `Unknown dataset. Choose one of: ${Object.keys(DATASETS).join(', ')}` },
        { status: 400 },
      );
    }

    // ── Columns: keys only, mapped to SQL we wrote. Unknown keys are dropped. ──
    const requested = (sp.get('columns') || '').split(',').map((c) => c.trim()).filter(Boolean);
    const cols = (requested.length ? requested : ds.defaultColumns).filter((c) => c in ds.columns);
    if (cols.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid columns selected' }, { status: 400 });
    }
    const selectSql = cols.map((c) => `${ds.columns[c].sql} AS \`${c}\``).join(', ');

    // ── Filters: value-bound, key allow-listed. ──
    const where: string[] = [ds.where];
    const params: any[] = [schoolId];

    for (const [fk, f] of Object.entries(ds.filters)) {
      if (f.range) {
        const from = sp.get(`f_${fk}_from`);
        const to = sp.get(`f_${fk}_to`);
        if (from) { where.push(`${f.sql} >= ?`); params.push(from); }
        if (to) { where.push(`${f.sql} <= ?`); params.push(to); }
        continue;
      }
      const raw = sp.get(`f_${fk}`);
      if (!raw) continue;
      if (f.type === 'enum') {
        if (!f.options?.includes(raw)) continue; // silently drop a value not in the set
        where.push(`${f.sql} = ?`);
        params.push(raw);
      } else {
        where.push(`${f.sql} LIKE ?`);
        params.push(`%${raw}%`);
      }
    }

    // ── Sort: must name a selected column; direction is a two-value choice. ──
    const orderKey = sp.get('order_by') || ds.defaultOrder;
    const orderCol = orderKey in ds.columns ? orderKey : ds.defaultOrder;
    const dir = sp.get('order_dir') === 'desc' ? 'DESC' : 'ASC';

    const limit = Math.min(Math.max(parseInt(sp.get('limit') || '500', 10) || 500, 1), MAX_ROWS);

    const sql = `
      SELECT ${selectSql}
      ${ds.from}
      WHERE ${where.join(' AND ')}
      ${ds.groupBy ? `GROUP BY ${ds.groupBy}` : ''}
      ORDER BY \`${orderCol}\` ${dir}
      LIMIT ${limit}
    `;

    const rows = await query(sql, params);

    return NextResponse.json({
      success: true,
      dataset: datasetKey,
      columns: cols.map((c) => ({ key: c, label: ds.columns[c].label, kind: ds.columns[c].kind ?? 'text' })),
      rows,
      count: Array.isArray(rows) ? rows.length : 0,
      truncated: Array.isArray(rows) && rows.length >= limit,
    });
  } catch (err: any) {
    console.error('[reports/custom] failed:', err?.message || err);
    return NextResponse.json({ success: false, error: 'Could not build this report' }, { status: 500 });
  }
}
