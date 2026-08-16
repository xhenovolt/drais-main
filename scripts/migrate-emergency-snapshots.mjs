#!/usr/bin/env node
/**
 * Import a legacy emergency JSON file as a snapshot row.
 *
 * Usage:
 *   node scripts/migrate-emergency-snapshots.mjs \
 *     --file backup/secular-results-term1-2026.json \
 *     --type secular \
 *     --school 8002 \
 *     --term 90006 \
 *     --year 16002 \
 *     [--user 1] [--result-type 1]
 *
 * Idempotent: refuses to insert if a row already exists with
 * (school, term, year, type, is_legacy_fallback=1).
 *
 * Wraps the legacy JSON in the new ReportSnapshot envelope with
 * is_legacy_fallback=1 and status='ready'. Determinism: reuses
 * sha256 over canonical JSON of `classes`, same as the live generator.
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';

// ─── CLI args ────────────────────────────────────────────────────────────────
const args = parseArgs(process.argv.slice(2));
if (!args.file || !args.type || !args.school || !args.term || !args.year) {
  console.error('Required: --file <path> --type <theology|secular|mixed> --school <id> --term <id> --year <id>');
  console.error('Optional: --user <id> --result-type <id>');
  process.exit(1);
}

const cfg = {
  host:     process.env.TIDB_HOST     || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port:     parseInt(process.env.TIDB_PORT || '4000', 10),
  user:     process.env.TIDB_USER     || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB       || 'drais',
  ssl:      { rejectUnauthorized: false },
  connectTimeout: 15000,
};
if (!cfg.user || !cfg.password) {
  console.error('FATAL: TIDB_USER and TIDB_PASSWORD must be set.');
  process.exit(1);
}

// ─── Helpers (mirror src/lib/snapshots/normalizers.ts) ───────────────────────
const ARABIC_TO_WESTERN = { '٠':'0','١':'1','٢':'2','٣':'3','٤':'4','٥':'5','٦':'6','٧':'7','٨':'8','٩':'9','٫':'.' };
const WESTERN_TO_ARABIC = Object.fromEntries(Object.entries(ARABIC_TO_WESTERN).map(([a,b]) => [b,a]));

function arabicToWestern(s) { return String(s ?? '').replace(/[٠-٩٫]/g, c => ARABIC_TO_WESTERN[c] ?? c); }
function toArabic(v) { return String(v ?? '').replace(/[0-9.]/g, c => WESTERN_TO_ARABIC[c] ?? c); }
function parseScore(raw) {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const w = arabicToWestern(raw).trim();
  if (!w || w === '—' || w === '-') return null;
  const n = parseFloat(w);
  return Number.isFinite(n) ? n : null;
}
function slugify(s) {
  return String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64) || 'school';
}
function canonical(value) {
  const seen = new WeakSet();
  const visit = v => {
    if (v === null || typeof v !== 'object') return v;
    if (seen.has(v)) throw new Error('cycle');
    seen.add(v);
    if (Array.isArray(v)) return v.map(visit);
    const out = {};
    for (const k of Object.keys(v).sort()) out[k] = visit(v[k]);
    return out;
  };
  return JSON.stringify(visit(value));
}
function fmtScore(n, numerals) {
  if (n === null) return '—';
  const r = Math.round(n * 100) / 100;
  const isWhole = Number.isInteger(r);
  const s = isWhole ? r.toString() : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return numerals === 'arabic' ? toArabic(s) : s;
}

// Default UCE grade scale (mirrors src/lib/drce/defaults.ts:13)
const GRADE_SCALE = [
  { label:'D1', min:90, max:100, remark:'Distinction 1' },
  { label:'D2', min:80, max:89,  remark:'Distinction 2' },
  { label:'C3', min:70, max:79,  remark:'Credit 3' },
  { label:'C4', min:60, max:69,  remark:'Credit 4' },
  { label:'C5', min:50, max:59,  remark:'Credit 5' },
  { label:'C6', min:45, max:49,  remark:'Credit 6' },
  { label:'P7', min:40, max:44,  remark:'Pass 7' },
  { label:'P8', min:35, max:39,  remark:'Pass 8' },
  { label:'F9', min:0,  max:34,  remark:'Fail 9' },
];
function gradeOf(score) {
  if (score === null) return { label: '', remark: '' };
  return GRADE_SCALE.find(g => score >= g.min && score <= g.max) ?? GRADE_SCALE[GRADE_SCALE.length - 1];
}
// Performance-adaptive overall comments — mirrors src/lib/snapshots/grader.ts
// performanceOverallComments() so legacy-imported snapshots get the same
// score-varying class teacher / DOS / headteacher comments as freshly
// generated ones, instead of one identical phrase for every student.
function performanceOverallComments(avg, lang) {
  const a = Number.isFinite(avg) ? avg : 0;
  if (lang === 'ar') {
    if (a >= 80) return { classTeacher: 'عمل ممتاز، استمر على هذا المستوى الرائع', dos: 'أداء متميز، نفخر بك، واصل الاجتهاد', headTeacher: 'نتائج باهرة، أنت مثال يحتذى به' };
    if (a >= 65) return { classTeacher: 'أداء جيد جداً، استمر في الاجتهاد للوصول إلى التميز', dos: 'جهد ملحوظ، يمكنك تحقيق الأفضل بمزيد من التركيز', headTeacher: 'درجات واعدة، استمر ولا تتهاون' };
    if (a >= 50) return { classTeacher: 'أداء جيد، بحاجة إلى مزيد من الجهد والمراجعة', dos: 'شكراً لهذا الجهد، يمكن تحسينه بالمثابرة', headTeacher: 'نتائج مقبولة، اجتهد أكثر لتحقيق مستوى أفضل' };
    if (a >= 40) return { classTeacher: 'الأداء دون المتوسط، يلزم بذل جهد إضافي والمتابعة عن قرب', dos: 'التحصيل ضعيف نسبياً، يرجى مضاعفة الجهد في المراجعة', headTeacher: 'النتائج تحتاج إلى تحسين، ننصح بمتابعة أقرب مع المعلمين' };
    return { classTeacher: 'ضعيف، يحتاج إلى اجتهاد كبير ومتابعة عاجلة', dos: 'أداء ضعيف جداً، يلزم دعم إضافي فوري', headTeacher: 'مستوى غير مُرضٍ، مطلوب تدخل عاجل ومتابعة حثيثة' };
  }
  if (a >= 80) return { classTeacher: 'Brilliant! An outstanding result — keep up this excellent standard.', dos: 'Outstanding performance, well deserved. Stay focused.', headTeacher: 'Excellent achievement — you are a role model to your peers.' };
  if (a >= 65) return { classTeacher: 'Very good work, keep pushing towards excellence.', dos: 'A strong, promising performance — keep it up.', headTeacher: 'Promising results, continue with this commitment.' };
  if (a >= 50) return { classTeacher: 'A fair performance — more consistent effort will lift this further.', dos: 'Good effort, but there is clear room for improvement.', headTeacher: 'Satisfactory results; aim higher next term.' };
  if (a >= 40) return { classTeacher: 'Below expectations — needs closer attention and extra practice.', dos: 'Performance needs significant improvement; more effort is required.', headTeacher: 'Results are a concern; closer follow-up with teachers is advised.' };
  return { classTeacher: 'Well below standard — requires serious effort and immediate support.', dos: 'Very weak performance; urgent remedial support is needed.', headTeacher: 'Unsatisfactory results; requires urgent intervention and follow-up.' };
}
function deriveOverallRemark(avg, lang) {
  if (lang === 'ar') {
    if (avg >= 80) return 'ممتاز';
    if (avg >= 65) return 'جيد جداً';
    if (avg >= 50) return 'جيد';
    if (avg >= 40) return 'مقبول';
    return 'ضعيف ويحتاج متابعة';
  }
  if (avg >= 80) return 'Excellent';
  if (avg >= 65) return 'Very Good';
  if (avg >= 50) return 'Good';
  if (avg >= 40) return 'Fair';
  return 'Needs Improvement';
}

// ─── Convert legacy JSON → snapshot envelope ─────────────────────────────────
function buildSnapshot(legacy, opts) {
  const numerals = opts.type === 'theology' ? 'arabic' : 'western';
  const language = opts.type === 'theology' ? 'ar' : 'en';

  const classes = (legacy.classes || []).map((c, ci) => {
    const subjectMap = new Map();
    const students = (c.students || []).map((s, si) => {
      const results = (s.results || []).map((r, ri) => {
        const score = parseScore(r.score);
        const subjectKey = r.subjectName || r.subject || `S${ri}`;
        if (!subjectMap.has(subjectKey)) {
          subjectMap.set(subjectKey, {
            id: subjectMap.size + 1,
            name: r.subjectName || r.subject || subjectKey,
            displayName: r.subjectName || r.subject || subjectKey,
            totalMarks: 100,
            subjectType: 'primary',
          });
        }
        const subj = subjectMap.get(subjectKey);
        const grade = (r.grade && String(r.grade).trim()) || gradeOf(score).label;
        const remarks = (r.remarks && String(r.remarks).trim()) || gradeOf(score).remark;
        return {
          subjectId: subj.id,
          subjectName: subj.name,
          displaySubject: subj.displayName,
          score,
          displayScore: fmtScore(score, numerals),
          grade,
          remarks,
          initials: (r.initials || r.teacherInitials || '').trim(),
          teacherName: (r.teacherName || '').trim() || undefined,
          enteredAt: r.createdAt || undefined,
        };
      });
      // sort results by subjectId for determinism
      results.sort((a, b) => a.subjectId - b.subjectId);

      const validScores = results.map(r => r.score).filter(n => n !== null);
      const total = validScores.reduce((a, b) => a + b, 0);
      const avg = validScores.length ? total / validScores.length : 0;

      const fullName = s.name || '';
      const [firstName = '', ...rest] = fullName.split(' ');
      const lastName = rest.join(' ');
      return {
        id: s.id ? String(s.id) : `${ci}-${si}`,
        studentDbId: typeof s.id === 'number' ? s.id : (parseInt(s.id, 10) || (ci * 10000 + si)),
        name: fullName,
        firstName,
        lastName,
        gender: s.gender || '',
        admissionNumber: s.admissionNumber || (typeof s.id === 'string' ? s.id : ''),
        photoUrl: s.photoUrl || null,
        results,
        total: Math.round(total * 100) / 100,
        average: Math.round(avg * 100) / 100,
        position: 0,        // filled below
        totalInClass: 0,    // filled below
        displayTotal: '',
        displayAverage: '',
        displayPosition: '',
        comments: performanceOverallComments(avg, language),
        remarks: deriveOverallRemark(avg, language),
      };
    });
    // rank deterministically
    students.sort((a, b) => {
      if (b.total !== a.total) return b.total - a.total;
      if (b.average !== a.average) return b.average - a.average;
      const lc = a.lastName.localeCompare(b.lastName);
      if (lc !== 0) return lc;
      const fc = a.firstName.localeCompare(b.firstName);
      if (fc !== 0) return fc;
      return a.studentDbId - b.studentDbId;
    });
    students.forEach((s, i) => {
      s.position = i + 1;
      s.totalInClass = students.length;
      s.displayTotal = fmtScore(s.total, numerals);
      s.displayAverage = fmtScore(s.average, numerals);
      s.displayPosition = numerals === 'arabic'
        ? `${toArabic(s.position)}/${toArabic(s.totalInClass)}`
        : `${s.position}/${s.totalInClass}`;
    });

    const subjects = [...subjectMap.values()].sort((a, b) => a.id - b.id);

    return {
      classId: c.classId || (ci + 1),
      className: c.className || '',
      stream: c.stream || '',
      subjects,
      students,
    };
  }).sort((a, b) => a.classId - b.classId);

  const sourceCounts = {
    classes: classes.length,
    students: classes.reduce((n, c) => n + c.students.length, 0),
    subjects: classes.reduce((n, c) => n + c.subjects.length, 0),
    results: classes.reduce((n, c) => n + c.students.reduce((m, s) => m + s.results.length, 0), 0),
  };

  const dataHash = createHash('sha256').update(canonical(classes)).digest('hex');
  const snapshotId = randomUUID();

  return {
    snapshotId,
    snapshot: {
      meta: {
        snapshotId,
        schemaVersion: 1,
        type: opts.type,
        schoolId: opts.school,
        schoolSlug: slugify(legacy.school || `school-${opts.school}`),
        schoolName: legacy.school || `School ${opts.school}`,
        termId: opts.term,
        termName: legacy.term || `Term ${opts.term}`,
        yearId: opts.year,
        yearName: legacy.term ? legacy.term.replace(/^.*?(\d{4}).*$/, '$1') || '' : '',
        resultTypeId: opts.resultType,
        resultTypeName: legacy.resultType || '',
        numerals,
        language,
        generatedAt: new Date().toISOString(),
        generatedBy: opts.user,
        generationDurationMs: 0,
        sourceCounts,
        dataHash,
      },
      classes,
      config: {
        gradingScale: GRADE_SCALE.map(g => ({ min: g.min, max: g.max, grade: g.label, remark: g.remark })),
        nextTermBegins: '',
      },
    },
    sourceCounts,
    dataHash,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────
const filePath = path.resolve(args.file);
const raw = await readFile(filePath, 'utf8');
const legacy = JSON.parse(raw);
const built = buildSnapshot(legacy, {
  type: args.type,
  school: Number(args.school),
  term: Number(args.term),
  year: Number(args.year),
  user: Number(args.user || 0),
  resultType: args['result-type'] ? Number(args['result-type']) : null,
});

const conn = await createConnection(cfg);
console.log(`[migrate] file=${path.basename(filePath)}  type=${args.type}  classes=${built.sourceCounts.classes}  students=${built.sourceCounts.students}  results=${built.sourceCounts.results}`);

// Idempotency: skip if a legacy fallback row already exists for this key
const [existing] = await conn.query(
  `SELECT snapshot_id FROM report_snapshots
    WHERE school_id = ? AND term_id = ? AND year_id = ? AND type = ? AND is_legacy_fallback = 1
    LIMIT 1`,
  [args.school, args.term, args.year, args.type],
);
if (existing.length) {
  console.log(`[migrate] SKIP — legacy fallback row already exists: ${existing[0].snapshot_id}`);
  await conn.end();
  process.exit(0);
}

await conn.query(
  `INSERT INTO report_snapshots
    (snapshot_id, school_id, type, term_id, year_id, result_type_id,
     status, snapshot_json, data_hash,
     class_count, student_count, result_count,
     generated_by, generated_at, completed_at, generation_ms,
     is_legacy_fallback)
   VALUES (?, ?, ?, ?, ?, ?, 'ready', ?, ?, ?, ?, ?, ?, NOW(), NOW(), 0, 1)`,
  [
    built.snapshotId,
    Number(args.school),
    args.type,
    Number(args.term),
    Number(args.year),
    args['result-type'] ? Number(args['result-type']) : null,
    JSON.stringify(built.snapshot),
    built.dataHash,
    built.sourceCounts.classes,
    built.sourceCounts.students,
    built.sourceCounts.results,
    Number(args.user || 0),
  ],
);
console.log(`[migrate] INSERT OK — snapshot_id=${built.snapshotId}  hash=${built.dataHash.slice(0, 12)}…`);
await conn.end();

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
