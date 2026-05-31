// node:test — students pipeline pure helpers.
//
// `pipelines/students.ts` transitively imports @/lib/db which pulls in
// mysql2 → tls and chokes under tsx --test. Same mirror-pattern we use
// in school-hours.test.mjs + adms-direction.test.mjs: copy the pure
// functions here. If they diverge from the real ones the diff IS the
// audit trail — both must be updated together.
//
// Run: npx tsx --test src/lib/ingestion/__tests__/students-pipeline.test.mjs
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// ─── Mirrors of pure helpers in src/lib/ingestion/pipelines/students.ts ────

function coerceString(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function parseMoney(v) {
  if (v == null || v === '') return null;
  const cleaned = String(v).replace(/[\s,]/g, '');
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function parseDateToIso(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmy = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
  if (dmy) {
    const day = dmy[1].padStart(2, '0');
    const mon = dmy[2].padStart(2, '0');
    return `${dmy[3]}-${mon}-${day}`;
  }
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function validateStudentRow(mapped) {
  const admission = coerceString(mapped.admission_no);
  if (!admission) return { ok: false, error: 'admission_no is empty' };
  const first = coerceString(mapped.first_name);
  if (!first) return { ok: false, error: 'first_name is empty' };
  const last = coerceString(mapped.last_name);
  if (!last) return { ok: false, error: 'last_name is empty' };

  let gender = null;
  const g = coerceString(mapped.gender)?.toLowerCase();
  if (g === 'm' || g === 'male')   gender = 'male';
  if (g === 'f' || g === 'female') gender = 'female';

  return {
    ok: true,
    value: {
      admission_no:  admission,
      first_name:    first,
      last_name:     last,
      other_name:    coerceString(mapped.other_name),
      gender,
      date_of_birth: parseDateToIso(mapped.date_of_birth),
      phone:         coerceString(mapped.phone),
      email:         coerceString(mapped.email),
      address:       coerceString(mapped.address),
      class_name:    coerceString(mapped.class_name),
      stream_name:   coerceString(mapped.stream_name),
      fees_balance:  parseMoney(mapped.fees_balance),
    },
  };
}

function studentIdentityFromRow(row) {
  return {
    admissionNo: row.admission_no,
    firstName:   row.first_name,
    lastName:    row.last_name,
    otherName:   row.other_name ?? undefined,
    className:   row.class_name ?? undefined,
    streamName:  row.stream_name ?? undefined,
    personRole:  'student',
  };
}

// Mirror of the catalog — the test asserts on the shape so changes to
// the real catalog must update this constant + the assertions below.
const STUDENT_FIELDS_MIRROR = [
  { name: 'admission_no',  required: true,  type: 'string', synonymsLen: 17 },
  { name: 'first_name',    required: true,  type: 'string', synonymsLen: 5 },
  { name: 'last_name',     required: true,  type: 'string', synonymsLen: 6 },
  { name: 'other_name',    required: false, type: 'string', synonymsLen: 6 },
  { name: 'gender',        required: false, type: 'enum',   synonymsLen: 3 },
  { name: 'date_of_birth', required: false, type: 'date',   synonymsLen: 5 },
  { name: 'phone',         required: false, type: 'string', synonymsLen: 7 },
  { name: 'email',         required: false, type: 'string', synonymsLen: 3 },
  { name: 'address',       required: false, type: 'string', synonymsLen: 4 },
  { name: 'class_name',    required: false, type: 'string', synonymsLen: 6 },
  { name: 'stream_name',   required: false, type: 'string', synonymsLen: 5 },
  { name: 'fees_balance',  required: false, type: 'float',  synonymsLen: 6 },
];

// ─── tests ─────────────────────────────────────────────────────────────────

describe('STUDENT_FIELDS catalog shape', () => {
  it('exactly admission_no, first_name, last_name are required', () => {
    const required = STUDENT_FIELDS_MIRROR.filter(f => f.required).map(f => f.name).sort();
    assert.deepEqual(required, ['admission_no', 'first_name', 'last_name']);
  });
  it('every field has at least one synonym', () => {
    for (const f of STUDENT_FIELDS_MIRROR) {
      assert.ok(f.synonymsLen > 0, `${f.name} has no synonyms`);
    }
  });
  it('gender field is an enum', () => {
    assert.equal(STUDENT_FIELDS_MIRROR.find(f => f.name === 'gender').type, 'enum');
  });
});

describe('coerceString', () => {
  it('null / undefined / empty → null', () => {
    assert.equal(coerceString(null),      null);
    assert.equal(coerceString(undefined), null);
    assert.equal(coerceString(''),        null);
    assert.equal(coerceString('   '),     null);
  });
  it('trims surrounding whitespace', () => {
    assert.equal(coerceString('  Ali  '), 'Ali');
  });
  it('coerces numbers to strings', () => {
    assert.equal(coerceString(42), '42');
  });
});

describe('parseMoney', () => {
  it('plain number passes through', () => {
    assert.equal(parseMoney(1200), 1200);
  });
  it('comma-separated currency', () => {
    assert.equal(parseMoney('1,200,000.50'), 1200000.5);
  });
  it('space-separated values', () => {
    assert.equal(parseMoney('1 200 000.50'), 1200000.5);
  });
  it('empty / null → null', () => {
    assert.equal(parseMoney(''),   null);
    assert.equal(parseMoney(null), null);
  });
  it('non-numeric strings → null', () => {
    assert.equal(parseMoney('paid'), null);
  });
});

describe('parseDateToIso', () => {
  it('ISO already → identity', () => {
    assert.equal(parseDateToIso('2014-05-31'), '2014-05-31');
  });
  it('DD/MM/YYYY → ISO', () => {
    assert.equal(parseDateToIso('31/05/2014'), '2014-05-31');
    assert.equal(parseDateToIso('5/3/2014'),   '2014-03-05');
  });
  it('DD-MM-YYYY → ISO', () => {
    assert.equal(parseDateToIso('31-05-2014'), '2014-05-31');
  });
  it('garbage → null', () => {
    assert.equal(parseDateToIso('nonsense'), null);
    assert.equal(parseDateToIso(''),         null);
    assert.equal(parseDateToIso(null),       null);
  });
});

describe('validateStudentRow', () => {
  it('happy path', () => {
    const r = validateStudentRow({
      admission_no: 'ADM/001', first_name: 'Ali', last_name: 'Hassan',
      gender: 'M', date_of_birth: '31/05/2014', fees_balance: '1,200,000',
    });
    assert.equal(r.ok, true);
    assert.equal(r.value.admission_no, 'ADM/001');
    assert.equal(r.value.gender, 'male');
    assert.equal(r.value.date_of_birth, '2014-05-31');
    assert.equal(r.value.fees_balance, 1200000);
  });
  it('rejects empty admission_no', () => {
    const r = validateStudentRow({ admission_no: '', first_name: 'Ali', last_name: 'Hassan' });
    assert.equal(r.ok, false);
    assert.match(r.error, /admission_no/);
  });
  it('rejects empty first_name + last_name', () => {
    assert.equal(validateStudentRow({ admission_no: 'X', first_name: '', last_name: 'Hassan' }).ok, false);
    assert.equal(validateStudentRow({ admission_no: 'X', first_name: 'Ali', last_name: '' }).ok, false);
  });
  it('normalises gender variants', () => {
    const cases = [
      ['m','male'],['M','male'],['male','male'],['MALE','male'],
      ['f','female'],['F','female'],['female','female'],['Female','female'],
    ];
    for (const [input, expected] of cases) {
      const r = validateStudentRow({ admission_no:'X', first_name:'A', last_name:'B', gender:input });
      assert.equal(r.ok, true);
      assert.equal(r.value.gender, expected, `${input} → ${expected}`);
    }
  });
  it('unknown gender → null (no enum mis-leak)', () => {
    const r = validateStudentRow({ admission_no:'X', first_name:'A', last_name:'B', gender:'unspecified' });
    assert.equal(r.ok, true);
    assert.equal(r.value.gender, null);
  });
  it('optional fields default to null', () => {
    const r = validateStudentRow({ admission_no:'X', first_name:'A', last_name:'B' });
    assert.equal(r.ok, true);
    assert.equal(r.value.phone, null);
    assert.equal(r.value.address, null);
    assert.equal(r.value.fees_balance, null);
    assert.equal(r.value.date_of_birth, null);
    assert.equal(r.value.gender, null);
  });
});

describe('studentIdentityFromRow', () => {
  it('extracts admission + names + class + stream + role', () => {
    const claim = studentIdentityFromRow({
      admission_no: 'ADM/001',
      first_name: 'Ali', last_name: 'Hassan', other_name: 'M',
      gender: 'male', date_of_birth: '2014-05-31',
      phone: null, email: null, address: null,
      class_name: 'S1', stream_name: 'A', fees_balance: null,
    });
    assert.equal(claim.admissionNo, 'ADM/001');
    assert.equal(claim.firstName, 'Ali');
    assert.equal(claim.lastName, 'Hassan');
    assert.equal(claim.className, 'S1');
    assert.equal(claim.streamName, 'A');
    assert.equal(claim.personRole, 'student');
  });
  it('passes null fields as undefined', () => {
    const claim = studentIdentityFromRow({
      admission_no: 'X', first_name: 'A', last_name: 'B',
      other_name: null, gender: null, date_of_birth: null,
      phone: null, email: null, address: null,
      class_name: null, stream_name: null, fees_balance: null,
    });
    assert.equal(claim.className,  undefined);
    assert.equal(claim.streamName, undefined);
    assert.equal(claim.otherName,  undefined);
  });
});
