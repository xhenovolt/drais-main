import test from 'node:test';
import assert from 'node:assert/strict';
import {
  contactDuplicateKey,
  findIntraFileDuplicates,
  normalizeEmail,
  normalizePhone,
  rowFromRecord,
  validateContactRow,
} from '../import.ts';

test('normalizes phone and email identities', () => {
  assert.equal(normalizePhone('+256 700-000-001'), '+256700000001');
  assert.equal(normalizeEmail(' Parent@Example.COM '), 'parent@example.com');
});

test('validates required fields and formats', () => {
  const issues = validateContactRow({
    rowNumber: 2, studentId: '', admissionNo: '', contactFirstName: '', contactLastName: '',
    phone: '123', email: 'bad', address: '', relationship: '', contactType: 'guardian', occupation: '', isPrimary: false,
  });
  assert.deepEqual(issues, [
    'student_id or admission_no is required',
    'contact name is required',
    'phone must contain at least 7 digits',
    'email format is invalid',
  ]);
});

test('detects duplicate contacts within one workbook', () => {
  const rows = [
    { rowNumber: 2, studentId: '', admissionNo: 'ADM-1', contactFirstName: 'A', contactLastName: 'B', phone: '+256 700 000 001', email: '', address: '', relationship: '', contactType: 'guardian', occupation: '', isPrimary: false },
    { rowNumber: 3, studentId: '', admissionNo: ' adm-1 ', contactFirstName: 'A', contactLastName: 'B', phone: '+256700000001', email: '', address: '', relationship: '', contactType: 'guardian', occupation: '', isPrimary: false },
  ];
  assert.equal(contactDuplicateKey(rows[0]), 'adm-1|+256700000001');
  assert.deepEqual(findIntraFileDuplicates(rows), [{ rowNumber: 3, reason: 'duplicate of row 2 in this file' }]);
});

test('maps common Excel headers into the import row', () => {
  const row = rowFromRecord({ 'Admission No': 'ADM-3', 'Contact First Name': 'Sara', 'Contact Last Name': 'Ali', Phone: '+256700000003' }, {
    admissionNo: 'Admission No', contactFirstName: 'Contact First Name', contactLastName: 'Contact Last Name', phone: 'Phone',
  }, 2);
  assert.equal(row.admissionNo, 'ADM-3');
  assert.equal(row.contactFirstName, 'Sara');
  assert.equal(row.phone, '+256700000003');
});

test('maps guardian phone from a student-style workbook', () => {
  const row = rowFromRecord({ admission_no: 'ADM-4', first_name: 'Omar', last_name: 'Khan', guardian_phone: '+256 700 000 004' }, {
    admissionNo: 'admission_no', contactFirstName: 'first_name', contactLastName: 'last_name', phone: 'guardian_phone',
  }, 2);
  assert.equal(row.contactFirstName, 'Omar');
  assert.equal(row.contactLastName, 'Khan');
  assert.equal(row.phone, '+256 700 000 004');
  assert.equal(normalizePhone(row.phone), '+256700000004');
});
