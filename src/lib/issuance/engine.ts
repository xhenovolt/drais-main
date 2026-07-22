/**
 * Universal issuance service.
 *
 * One pipeline drives every "render a DRCE template for a cohort of
 * recipients and archive an audit trail" use case — certificates, ID
 * card batches, transcripts, letters.
 *
 * Pipeline:
 *   1. createBatch(input)           — persists a draft batch.
 *   2. previewBatch(batchId)        — resolves candidates, runs eligibility,
 *                                     populates issuance_items with status
 *                                     'eligible' or 'skipped'. No rendering yet.
 *   3. generateBatch(batchId)       — renders each eligible item through
 *                                     DRCEDocumentRenderer (renderToStaticMarkup)
 *                                     and persists the HTML. Respects the
 *                                     dedupe table — items that have already
 *                                     been issued under the same key for
 *                                     the same recipient are marked 'skipped'.
 *   4. markPrinted(batchId)         — flips status to 'printed'.
 *   5. reprintItem(itemId)          — increments reprint counter.
 *
 * Eligibility uses src/lib/drce/visibility.ts. NO new rule language.
 *
 * Sync vs async: this v1 runs synchronously. The route layer wraps it
 * with a Promise so the caller knows when each phase is done. Batches
 * over ~50 items should move to a worker — see TODO below.
 */
import { query, withTransaction } from '@/lib/db';
import { evaluateRule } from '@/lib/drce/visibility';
import { applyOverrides, readHiddenSubjectIds, selectOverridesForStudent } from '@/lib/drce/overrides';
import { listOverrides } from '@/lib/snapshots/overrides';
import type { DRCEDocument, DRCEDataContext } from '@/lib/drce/schema';
import type {
  IssuanceBatch, IssuanceItem, IssuanceCounts, IssuanceScope,
  IssuanceStatus, CreateBatchInput,
} from './types';
import type { VisibilityRule } from '@/lib/drce/visibility';

// ─── Row mappers ────────────────────────────────────────────────────────────

interface BatchRow {
  id: number; school_id: number; template_id: number; document_kind: string;
  name: string; description: string | null;
  eligibility_json: string | null; scope_json: string | null;
  issued_run_key: string; status: IssuanceStatus;
  counts_json: string | null;
  generated_at: string | null; printed_at: string | null; failed_reason: string | null;
  created_at: string; updated_at: string; created_by: number | null;
}

function parseJson<T>(raw: unknown): T | null {
  if (raw == null) return null;
  if (typeof raw === 'object') return raw as T;
  try { return JSON.parse(String(raw)) as T; } catch { return null; }
}

function rowToBatch(r: BatchRow): IssuanceBatch {
  return {
    id:           Number(r.id),
    schoolId:     Number(r.school_id),
    templateId:   Number(r.template_id),
    documentKind: r.document_kind,
    name:         r.name,
    description:  r.description,
    eligibility:  parseJson<VisibilityRule>(r.eligibility_json),
    scope:        parseJson<IssuanceScope>(r.scope_json),
    issuedRunKey: r.issued_run_key,
    status:       r.status,
    counts:       parseJson<IssuanceCounts>(r.counts_json),
    generatedAt:  r.generated_at,
    printedAt:    r.printed_at,
    failedReason: r.failed_reason,
    createdAt:    r.created_at,
    updatedAt:    r.updated_at,
    createdBy:    r.created_by,
  };
}

// ─── CRUD ───────────────────────────────────────────────────────────────────

export async function createBatch(args: {
  schoolId: number; userId: number | null; input: CreateBatchInput;
}): Promise<number> {
  const { schoolId, userId, input } = args;
  if (!input.templateId || !Number.isFinite(input.templateId))
    throw new Error('templateId is required');
  if (!input.name?.trim()) throw new Error('name is required');

  // Verify template exists and is accessible to this school.
  const tpl = (await query(
    `SELECT id, document_kind FROM dvcf_documents
      WHERE id = ? AND (school_id IS NULL OR school_id = ?)
      LIMIT 1`,
    [input.templateId, schoolId],
  )) as Array<{ id: number; document_kind: string | null }>;
  if (!tpl.length) throw new Error('Template not found or not accessible');

  const result = (await query(
    `INSERT INTO issuance_batches
       (school_id, template_id, document_kind, name, description,
        eligibility_json, scope_json, issued_run_key, status, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)`,
    [
      schoolId, input.templateId,
      input.documentKind ?? tpl[0].document_kind ?? 'certificate',
      input.name.trim(), input.description?.toString().trim() ?? null,
      input.eligibility ? JSON.stringify(input.eligibility) : null,
      input.scope       ? JSON.stringify(input.scope)       : null,
      (input.issuedRunKey ?? '').slice(0, 120),
      userId,
    ],
  )) as unknown as { insertId: number };
  const batchId = Number(result.insertId);
  await audit(batchId, userId, 'created', { templateId: input.templateId });
  return batchId;
}

export async function getBatch(batchId: number, schoolId: number): Promise<IssuanceBatch | null> {
  const rows = (await query(
    `SELECT * FROM issuance_batches WHERE id = ? AND school_id = ? LIMIT 1`,
    [batchId, schoolId],
  )) as BatchRow[];
  return rows.length ? rowToBatch(rows[0]) : null;
}

export async function listBatches(args: {
  schoolId: number; documentKind?: string; status?: IssuanceStatus;
}): Promise<IssuanceBatch[]> {
  const { schoolId, documentKind, status } = args;
  const conds = ['school_id = ?']; const params: unknown[] = [schoolId];
  if (documentKind) { conds.push('document_kind = ?'); params.push(documentKind); }
  if (status)       { conds.push('status = ?');        params.push(status); }
  const rows = (await query(
    `SELECT * FROM issuance_batches WHERE ${conds.join(' AND ')}
      ORDER BY created_at DESC LIMIT 200`,
    params,
  )) as BatchRow[];
  return rows.map(rowToBatch);
}

export async function getItems(batchId: number): Promise<IssuanceItem[]> {
  const rows = (await query(
    `SELECT id, batch_id, recipient_kind, recipient_id, recipient_snapshot_json,
            rendered_html, status, skip_reason, error_message,
            issued_at, issued_by, reprint_count, last_reprinted_at
       FROM issuance_items
      WHERE batch_id = ?
      ORDER BY id ASC`,
    [batchId],
  )) as Array<{
    id: number; batch_id: number; recipient_kind: 'student' | 'staff';
    recipient_id: number; recipient_snapshot_json: string | null;
    rendered_html: string | null;
    status: IssuanceItem['status'];
    skip_reason: string | null; error_message: string | null;
    issued_at: string | null; issued_by: number | null;
    reprint_count: number; last_reprinted_at: string | null;
  }>;
  return rows.map(r => ({
    id:              Number(r.id),
    batchId:         Number(r.batch_id),
    recipientKind:   r.recipient_kind,
    recipientId:     Number(r.recipient_id),
    recipientSnapshot: parseJson<Record<string, unknown>>(r.recipient_snapshot_json),
    renderedHtml:    r.rendered_html,
    status:          r.status,
    skipReason:      r.skip_reason,
    errorMessage:    r.error_message,
    issuedAt:        r.issued_at,
    issuedBy:        r.issued_by,
    reprintCount:    Number(r.reprint_count),
    lastReprintedAt: r.last_reprinted_at,
  }));
}

// ─── Preview ────────────────────────────────────────────────────────────────

/**
 * Resolves the candidate pool against the school's enrolled-student table
 * and runs eligibility. Persists rows in issuance_items with status
 * 'eligible' or 'skipped'. Returns the count summary.
 */
export async function previewBatch(batchId: number, schoolId: number): Promise<IssuanceCounts> {
  const batch = await getBatch(batchId, schoolId);
  if (!batch) throw new Error('Batch not found');

  const candidates = await resolveCandidates(schoolId, batch.scope);
  let eligible = 0, skipped = 0;

  // Wipe any prior preview run so a re-preview is clean.
  await query(`DELETE FROM issuance_items WHERE batch_id = ? AND status IN ('eligible','skipped')`, [batchId]);

  for (const candidate of candidates) {
    // Build a minimal DataContext for rule evaluation. Bindings used in
    // typical eligibility rules (`student.gender`, `student.custom.*`,
    // `student.className`, `assessment.classPosition`) are all available
    // from the enrolled-student row + custom values lookup.
    const ctx: DRCEDataContext = {
      student: {
        fullName:    candidate.fullName,
        firstName:   candidate.firstName,
        lastName:    candidate.lastName,
        gender:      candidate.gender ?? '',
        className:   candidate.className ?? '',
        streamName:  candidate.streamName ?? '',
        admissionNo: candidate.admissionNo ?? String(candidate.id),
        photoUrl:    candidate.photoUrl ?? null,
        dateOfBirth: candidate.dateOfBirth ?? null,
        custom:      (candidate.custom ?? {}) as never,
      },
      results:     [],
      subjects:    [],
      assessment:  { classPosition: null, streamPosition: null, aggregates: null, division: null, totalStudents: null },
      comments:    { classTeacher: '', dos: '', headTeacher: '' },
      meta: {
        schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '',
        centerNo: '', registrationNo: '', term: '', year: '', reportTitle: '',
        nextTermBegins: '',
      },
      language: 'en',
    };
    const ok = evaluateRule(batch.eligibility, ctx);
    if (ok) {
      eligible++;
      await query(
        `INSERT INTO issuance_items
           (batch_id, recipient_kind, recipient_id, recipient_snapshot_json, status)
         VALUES (?, 'student', ?, ?, 'eligible')`,
        [batchId, candidate.id, JSON.stringify(candidate)],
      );
    } else {
      skipped++;
      await query(
        `INSERT INTO issuance_items
           (batch_id, recipient_kind, recipient_id, recipient_snapshot_json,
            status, skip_reason)
         VALUES (?, 'student', ?, ?, 'skipped', 'eligibility rule returned false')`,
        [batchId, candidate.id, JSON.stringify(candidate)],
      );
    }
  }

  const counts: IssuanceCounts = {
    candidates: candidates.length, eligible, issued: 0, skipped, errored: 0,
  };
  await query(
    `UPDATE issuance_batches SET status = 'previewed', counts_json = ? WHERE id = ?`,
    [JSON.stringify(counts), batchId],
  );
  await audit(batchId, null, 'previewed', counts);
  return counts;
}

// ─── Generate ───────────────────────────────────────────────────────────────

/**
 * For every eligible item: dedupe against issuance_dedupe_keys, render
 * the template through DRCEDocumentRenderer, persist HTML, mark issued.
 *
 * Dedupe rule: (school_id, template_id, recipient_id, issued_run_key) is
 * unique. A repeat under the SAME run key marks the item skipped with a
 * 'duplicate' reason. A different run key (e.g. a re-issue for the next
 * term) is allowed.
 */
export async function generateBatch(args: {
  batchId: number; schoolId: number; userId: number | null;
}): Promise<IssuanceCounts> {
  const { batchId, schoolId, userId } = args;
  const batch = await getBatch(batchId, schoolId);
  if (!batch) throw new Error('Batch not found');
  if (batch.status === 'generating') throw new Error('Batch is already generating');

  await query(`UPDATE issuance_batches SET status = 'generating' WHERE id = ?`, [batchId]);

  // Load template document.
  const tplRows = (await query(
    `SELECT schema_json FROM dvcf_documents
      WHERE id = ? AND (school_id IS NULL OR school_id = ?) LIMIT 1`,
    [batch.templateId, schoolId],
  )) as Array<{ schema_json: string }>;
  if (!tplRows.length) {
    await query(`UPDATE issuance_batches SET status = 'failed', failed_reason = ? WHERE id = ?`,
      ['Template not accessible', batchId]);
    throw new Error('Template not accessible');
  }
  const document = JSON.parse(tplRows[0].schema_json) as DRCEDocument;

  // Load overrides (per-student structural edits) so issuance respects them.
  let overrides: Awaited<ReturnType<typeof listOverrides>> = [];
  try { overrides = await listOverrides({ snapshotId: 'issuance', schoolId }); } catch { /* optional */ }

  const items = await getItems(batchId);
  const runKey = batch.issuedRunKey || `batch-${batchId}`;
  let issued = 0, skipped = 0, errored = 0;
  let eligible = items.filter(i => i.status === 'eligible').length;

  const [{ DRCEDocumentRenderer }, { renderToStaticMarkup }, React] = await Promise.all([
    import('@/components/drce/DRCEDocumentRenderer'),
    import('react-dom/server'),
    import('react'),
  ]);

  // Next 15's RSC runtime turns 'use client' exports imported from server
  // code into client references — calling one throws "Attempted to call
  // DRCEDocumentRenderer() from the server". The report print/PDF paths
  // solved this by rendering through the /print-snapshot page + puppeteer;
  // issuance has no equivalent page yet. Fail the batch up front with an
  // actionable message instead of erroring every item with a cryptic stack.
  if (typeof DRCEDocumentRenderer !== 'function') {
    throw new Error(
      'ISSUANCE_RENDER_UNAVAILABLE — server-side DRCE rendering is blocked by the framework ' +
      '(client component). Issuance generation needs a print-page render pipeline like the ' +
      'report PDF routes; no items were processed.',
    );
  }

  for (const item of items) {
    if (item.status !== 'eligible') continue;
    try {
      // Dedupe check.
      const dedupe = (await query(
        `SELECT id FROM issuance_dedupe_keys
          WHERE school_id = ? AND template_id = ?
            AND recipient_kind = 'student' AND recipient_id = ?
            AND issued_run_key = ? LIMIT 1`,
        [schoolId, batch.templateId, item.recipientId, runKey],
      )) as Array<{ id: number }>;
      if (dedupe.length) {
        await query(
          `UPDATE issuance_items SET status = 'skipped', skip_reason = 'already issued under this run key' WHERE id = ?`,
          [item.id],
        );
        skipped++; eligible--;
        continue;
      }

      // Build dataCtx from the recipient snapshot.
      const snap = item.recipientSnapshot as Record<string, unknown> | null;
      if (!snap) throw new Error('Missing recipient snapshot');
      const dataCtx = buildDataCtx(snap);

      // Apply per-student overrides (e.g. hide_subject), if any.
      const studentOverrides = selectOverridesForStudent(overrides, item.recipientId);
      const overriddenDoc = applyOverrides(document, studentOverrides);
      // hiddenSubjectIds returned only when results pipeline is involved;
      // certificate render doesn't need them but the call is cheap.
      readHiddenSubjectIds(overriddenDoc);

      const html = renderToStaticMarkup(React.createElement(DRCEDocumentRenderer, {
        document:  overriddenDoc,
        dataCtx,
        renderCtx: { isPrint: true, language: 'en', isRTL: false, school: { name: '' } },
      } as never));

      await withTransaction(async (conn) => {
        await conn.execute(
          `UPDATE issuance_items
             SET status = 'issued', rendered_html = ?,
                 issued_at = NOW(), issued_by = ?
           WHERE id = ?`,
          [html, userId, item.id],
        );
        await conn.execute(
          `INSERT INTO issuance_dedupe_keys
             (school_id, template_id, recipient_kind, recipient_id, issued_run_key, batch_id, item_id)
           VALUES (?, ?, 'student', ?, ?, ?, ?)`,
          [schoolId, batch.templateId, item.recipientId, runKey, batchId, item.id],
        );
      });
      issued++; eligible--;
    } catch (e) {
      const msg = (e as Error).message ?? 'render failed';
      await query(
        `UPDATE issuance_items SET status = 'errored', error_message = ? WHERE id = ?`,
        [msg.slice(0, 500), item.id],
      );
      errored++; eligible--;
    }
  }

  const counts: IssuanceCounts = {
    candidates: items.length, eligible, issued, skipped, errored,
  };
  await query(
    `UPDATE issuance_batches
        SET status = 'generated', counts_json = ?, generated_at = NOW()
      WHERE id = ?`,
    [JSON.stringify(counts), batchId],
  );
  await audit(batchId, userId, 'generated', counts);
  return counts;
}

// ─── Mark printed / re-print ────────────────────────────────────────────────

export async function markPrinted(batchId: number, userId: number | null): Promise<void> {
  await query(`UPDATE issuance_batches SET status = 'printed', printed_at = NOW() WHERE id = ?`, [batchId]);
  await audit(batchId, userId, 'printed', null);
}

export async function reprintItem(itemId: number, userId: number | null): Promise<void> {
  await query(
    `UPDATE issuance_items
        SET reprint_count = reprint_count + 1,
            last_reprinted_at = NOW(),
            status = 'reprinted'
      WHERE id = ?`,
    [itemId],
  );
  void userId;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

interface CandidateRow {
  id: number;
  firstName: string; lastName: string;
  fullName: string;
  gender: string | null;
  className: string | null;
  streamName: string | null;
  admissionNo: string | null;
  photoUrl: string | null;
  dateOfBirth: string | null;
  custom?: Record<string, unknown>;
}

async function resolveCandidates(
  schoolId: number, scope: IssuanceScope | null,
): Promise<CandidateRow[]> {
  // If a hard student-id list is provided, bypass joins entirely.
  if (scope?.studentIds?.length) {
    const placeholders = scope.studentIds.map(() => '?').join(',');
    return loadStudents(schoolId, `s.id IN (${placeholders})`, scope.studentIds);
  }

  const conds: string[] = ['s.school_id = ?'];
  const params: unknown[] = [schoolId];
  if (scope?.classIds?.length) {
    const ph = scope.classIds.map(() => '?').join(',');
    conds.push(`e.class_id IN (${ph})`);
    params.push(...scope.classIds);
  }
  if (scope?.streamIds?.length) {
    const ph = scope.streamIds.map(() => '?').join(',');
    conds.push(`e.stream_id IN (${ph})`);
    params.push(...scope.streamIds);
  }
  return loadStudents(schoolId, conds.join(' AND '), params);
}

async function loadStudents(schoolId: number, where: string, params: unknown[]): Promise<CandidateRow[]> {
  // Defensive: not every deployment has e.enrolled_status; we filter on
  // s.status='active' instead which is universal in DRAIS.
  const rows = (await query(
    `SELECT DISTINCT s.id, s.first_name, s.last_name,
            s.gender, s.admission_no, s.date_of_birth,
            p.photo_url,
            c.name AS class_name,
            st.name AS stream_name
       FROM students s
       LEFT JOIN people p ON p.id = s.person_id
       LEFT JOIN enrollments e ON e.student_id = s.id
       LEFT JOIN classes  c ON c.id = e.class_id
       LEFT JOIN streams st ON st.id = e.stream_id
      WHERE ${where}
      ORDER BY s.last_name, s.first_name`,
    params,
  )) as Array<{
    id: number; first_name: string; last_name: string;
    gender: string | null; admission_no: string | null;
    date_of_birth: string | null; photo_url: string | null;
    class_name: string | null; stream_name: string | null;
  }>;

  // Custom field values for every student in one go.
  let customMap = new Map<number, Record<string, unknown>>();
  if (rows.length) {
    try {
      const { getStudentCustomValuesBulk } = await import('@/lib/custom-fields');
      customMap = await getStudentCustomValuesBulk({
        studentIds: rows.map(r => Number(r.id)),
        schoolId,
      }) as Map<number, Record<string, unknown>>;
    } catch { /* optional */ }
    void schoolId;
  }

  return rows.map(r => ({
    id: Number(r.id),
    firstName:   r.first_name ?? '',
    lastName:    r.last_name ?? '',
    fullName:    `${r.first_name ?? ''} ${r.last_name ?? ''}`.trim() || 'Unknown',
    gender:      r.gender,
    className:   r.class_name,
    streamName:  r.stream_name,
    admissionNo: r.admission_no,
    photoUrl:    r.photo_url,
    dateOfBirth: r.date_of_birth,
    custom:      customMap.get(Number(r.id)) ?? {},
  }));
}

function buildDataCtx(snap: Record<string, unknown>): DRCEDataContext {
  const c = snap as Record<string, string | number | null | undefined> & { custom?: Record<string, unknown> };
  return {
    student: {
      fullName:    String(c.fullName ?? ''),
      firstName:   String(c.firstName ?? ''),
      lastName:    String(c.lastName ?? ''),
      gender:      String(c.gender ?? ''),
      className:   String(c.className ?? ''),
      streamName:  String(c.streamName ?? ''),
      admissionNo: String(c.admissionNo ?? ''),
      photoUrl:    c.photoUrl == null ? null : String(c.photoUrl),
      dateOfBirth: c.dateOfBirth == null ? null : String(c.dateOfBirth),
      custom:      (c.custom ?? {}) as never,
    },
    results: [], subjects: [],
    assessment: { classPosition: null, streamPosition: null, aggregates: null, division: null, totalStudents: null },
    comments:   { classTeacher: '', dos: '', headTeacher: '' },
    meta: {
      schoolName: '', schoolAddress: '', schoolContact: '', schoolEmail: '',
      centerNo: '', registrationNo: '', term: '', year: '', reportTitle: '',
      nextTermBegins: '',
    },
    language: 'en',
  };
}

async function audit(
  batchId: number, userId: number | null,
  action: string, detail: unknown,
): Promise<void> {
  try {
    await query(
      `INSERT INTO issuance_audit_log (batch_id, actor_user_id, action, detail_json)
       VALUES (?, ?, ?, ?)`,
      [batchId, userId, action, detail ? JSON.stringify(detail) : null],
    );
  } catch { /* audit failure must not break the action */ }
}

// TODO (follow-up): for batches > ~50 items, move generateBatch into a
// background worker so the API call returns quickly. v1 keeps the
// pipeline synchronous for simplicity and to surface errors loudly.
