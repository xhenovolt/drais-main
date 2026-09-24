const fs = require('fs');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const xlsx = require('xlsx');

const SCHOOL_ID = 12020;
const LIST_FILE = 'BACKUP/samples/DRAIS LIST.xlsx';
const CONTACT_FILE = 'BACKUP/samples/DRAIS CONTACTS.xlsx';
const apply = process.argv.includes('--apply');

function clean(value) {
  return String(value ?? '').trim();
}

function normalize(value) {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

function normalizePhone(value) {
  return clean(value).replace(/[\s().-]/g, '');
}

function readSheet(file, sheetName) {
  const workbook = xlsx.readFile(file);
  return xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
}

async function main() {
  const env = dotenv.parse(fs.readFileSync('.env.local', 'utf8'));
  const connection = await mysql.createConnection({
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DB,
    charset: 'utf8mb4',
    ssl: { rejectUnauthorized: false },
  });

  try {
    const sourceStudents = readSheet(LIST_FILE, 'Student_info_report202609161511');
    const sourceContacts = readSheet(CONTACT_FILE, 'Contacts');
    const [students] = await connection.execute(`
      SELECT s.id, s.admission_no, s.class_id, s.person_id,
             p.first_name, p.last_name, p.other_name, p.gender,
             c.name AS class_name
        FROM students s
        JOIN people p ON p.id = s.person_id
        LEFT JOIN classes c ON c.id = s.class_id
       WHERE s.school_id = ? AND s.deleted_at IS NULL
    `, [SCHOOL_ID]);
    const [classes] = await connection.execute(
      'SELECT id, name, code FROM classes WHERE school_id = ? AND deleted_at IS NULL',
      [SCHOOL_ID],
    );
    const [fields] = await connection.execute(
      'SELECT id, code, label, data_type FROM custom_fields WHERE school_id = ? AND entity_type = \'student\' AND is_active = 1',
      [SCHOOL_ID],
    );
    const studentsByAdmission = new Map(students.map(row => [normalize(row.admission_no), row]));
    const classesByName = new Map(classes.map(row => [normalize(row.name), row]));
    const sourceMatches = sourceStudents.map(row => ({
      source: row,
      student: studentsByAdmission.get(normalize(row['REG NO'])),
    }));
    const missing = sourceMatches.filter(row => !row.student);
    const ambiguous = sourceStudents.filter((row, index) => {
      const student = sourceMatches[index].student;
      if (!student) return false;
      const sourceName = normalize([row['First Name'], row['Middle Name'], row['Last Name']].filter(Boolean).join(' '));
      const dbName = normalize([student.first_name, student.other_name, student.last_name].filter(Boolean).join(' '));
      return sourceName !== dbName && normalize(row['First Name']) !== normalize(student.first_name);
    });
    const classNames = [...new Set(sourceStudents.map(row => clean(row.Class)).filter(Boolean))];
    const classPlan = classNames.map(name => ({ name, existing: classesByName.get(normalize(name)) || null }));
    const accommodationField = fields.find(field => [
      'accommodation', 'accommodation_type', 'residence_type', 'boarding',
      'boarding_status', 'day_or_boarding', 'is_boarding', 'boarder',
    ].includes(normalize(field.code)));
    const sectionCounts = sourceStudents.reduce((counts, row) => {
      const section = normalize(row.Section);
      if (section) counts[section] = (counts[section] || 0) + 1;
      return counts;
    }, {});
    const suspiciousContacts = sourceContacts.filter(row => {
      const student = studentsByAdmission.get(normalize(row.admission_no));
      if (!student) return false;
      const contactName = normalize([row.contact_first_name, row.contact_last_name].filter(Boolean).join(' '));
      const studentName = normalize([student.first_name, student.other_name, student.last_name].filter(Boolean).join(' '));
      return contactName === studentName || normalizePhone(row.phone) === normalizePhone(student.phone);
    });

    const report = {
      mode: apply ? 'apply' : 'dry-run',
      schoolId: SCHOOL_ID,
      sourceStudents: sourceStudents.length,
      liveStudents: students.length,
      matchedStudents: sourceMatches.length - missing.length,
      missingAdmissionMatches: missing.map(row => row.source['REG NO']),
      nameMismatches: ambiguous.map(row => ({ admissionNo: row['REG NO'], name: [row['First Name'], row['Middle Name'], row['Last Name']].filter(Boolean).join(' ') })),
      classPlan,
      sectionCounts,
      accommodationField,
      sourceContacts: sourceContacts.length,
      existingContacts: 'not queried; contact import intentionally blocked pending review',
      suspiciousContactRows: suspiciousContacts.map(row => ({ admissionNo: row.admission_no, name: `${row.contact_first_name} ${row.contact_last_name}`, phone: row.phone })),
      action: apply ? 'Class and accommodation updates only; contacts intentionally skipped.' : 'Dry run only; no writes performed.',
    };
    if (!apply) console.log(JSON.stringify(report, null, 2));

    if (missing.length || ambiguous.length) throw new Error('Aborting: source rows are not all confidently matched.');
    if (!apply) return;

    await connection.beginTransaction();
    const classIds = new Map();
    for (const plan of classPlan) {
      const className = /^S([1-6])$/i.test(plan.name) ? `Senior ${plan.name.slice(1)}` : plan.name;
      const existing = classesByName.get(normalize(className));
      if (!existing) throw new Error(`Missing expected class: ${className}`);
      classIds.set(normalize(plan.name), Number(existing.id));
    }

    let accommodation = accommodationField;
    if (!accommodation) {
      const [result] = await connection.execute(`
        INSERT INTO custom_fields
          (school_id, entity_type, code, label, description, data_type,
           options_json, validation_json, default_value, is_required,
           is_searchable, read_permission, write_permission, display_order,
           is_active, created_by)
        VALUES (?, 'student', 'accommodation', 'Accommodation',
                'Day or Boarding', 'select', ?, NULL, NULL, 0,
                1, NULL, NULL, 100, 1, NULL)
      `, [SCHOOL_ID, JSON.stringify([
        { value: 'Day', label: 'Day' },
        { value: 'Boarding', label: 'Boarding' },
      ])]);
      accommodation = { id: Number(result.insertId), code: 'accommodation', data_type: 'select' };
    }

    let classUpdates = 0;
    let accommodationUpdates = 0;
    for (const { source, student } of sourceMatches) {
      const classId = classIds.get(normalize(source.Class));
      if (!classId) throw new Error(`No class mapping for source class ${source.Class}`);
      if (student.class_id === null) {
        await connection.execute('UPDATE students SET class_id = ?, updated_at = NOW() WHERE id = ? AND school_id = ? AND class_id IS NULL', [classId, student.id, SCHOOL_ID]);
        classUpdates++;
      } else if (Number(student.class_id) !== classId) {
        throw new Error(`Refusing to overwrite existing class for admission ${source['REG NO']}`);
      }

      const rawSection = clean(source.Section).toLowerCase();
      const accommodationValue = rawSection === 'boarding' ? 'Boarding' : rawSection === 'day' ? 'Day' : null;
      if (!accommodationValue) throw new Error(`Invalid accommodation for admission ${source['REG NO']}`);
      await connection.execute(`
        INSERT INTO student_custom_values
          (student_id, field_id, value_text, value_number, value_date, value_bool, value_json, updated_by)
        VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL)
        ON DUPLICATE KEY UPDATE value_text = VALUES(value_text), value_number = NULL,
          value_date = NULL, value_bool = NULL, value_json = NULL, updated_by = NULL
      `, [student.id, accommodation.id, accommodationValue]);
      accommodationUpdates++;
    }
    await connection.commit();
    console.log(JSON.stringify({ applied: true, classUpdates, accommodationUpdates, contactsImported: 0, contactsFlagged: suspiciousContacts.length }, null, 2));
  } catch (error) {
    try { await connection.rollback(); } catch {}
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error(error.message || error);
  process.exitCode = 1;
});