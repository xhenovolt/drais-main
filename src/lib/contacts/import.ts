export interface ContactImportRow {
  rowNumber: number;
  studentId: string;
  admissionNo: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string;
  email: string;
  address: string;
  relationship: string;
  contactType: string;
  occupation: string;
  isPrimary: boolean;
}

export interface ContactImportIssue {
  rowNumber: number;
  reason: string;
}

const HEADER_ALIASES: Record<keyof Omit<ContactImportRow, 'rowNumber'>, string[]> = {
  studentId: ['student_id', 'student id', 'studentid'],
  admissionNo: ['admission_no', 'admission no', 'admission number', 'adm_no', 'adm no', 'reg_no', 'registration number'],
  contactFirstName: ['contact_first_name', 'contact first name', 'guardian_first_name', 'guardian first name', 'first_name', 'first name'],
  contactLastName: ['contact_last_name', 'contact last name', 'guardian_last_name', 'guardian last name', 'last_name', 'last name', 'surname'],
  phone: ['phone', 'phone_number', 'phone number', 'contact_phone', 'contact phone', 'mobile', 'mobile number'],
  email: ['email', 'email_address', 'email address', 'contact_email', 'contact email'],
  address: ['address', 'contact_address', 'contact address'],
  relationship: ['relationship', 'relation'],
  contactType: ['contact_type', 'contact type', 'type'],
  occupation: ['occupation', 'job'],
  isPrimary: ['is_primary', 'is primary', 'primary'],
};

function clean(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizedHeader(value: unknown): string {
  return clean(value).toLowerCase().replace(/[\s-]+/g, '_');
}

export function normalizePhone(value: unknown): string {
  return clean(value).replace(/[\s().-]/g, '').toLowerCase();
}

export function normalizeEmail(value: unknown): string {
  return clean(value).toLowerCase();
}

export function normalizeIdentity(value: unknown): string {
  return clean(value).toLowerCase().replace(/\s+/g, ' ');
}

export function buildHeaderMap(headers: unknown[]): Record<string, string> {
  const actual = new Map(headers.map((header) => [normalizedHeader(header), clean(header)]));
  const result: Record<string, string> = {};
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const match = aliases.map(normalizedHeader).find((alias) => actual.has(alias));
    if (match) result[field] = actual.get(match)!;
  }
  return result;
}

export function rowFromRecord(record: Record<string, unknown>, headers: Record<string, string>, rowNumber: number): ContactImportRow {
  const value = (field: keyof Omit<ContactImportRow, 'rowNumber'>) => clean(record[headers[field]]);
  const primary = value('isPrimary').toLowerCase();
  return {
    rowNumber,
    studentId: value('studentId'),
    admissionNo: value('admissionNo'),
    contactFirstName: value('contactFirstName'),
    contactLastName: value('contactLastName'),
    phone: value('phone'),
    email: value('email'),
    address: value('address'),
    relationship: value('relationship'),
    contactType: value('contactType') || 'guardian',
    occupation: value('occupation'),
    isPrimary: ['1', 'true', 'yes', 'y'].includes(primary),
  };
}

export function validateContactRow(row: ContactImportRow): string[] {
  const issues: string[] = [];
  if (!row.studentId && !row.admissionNo) issues.push('student_id or admission_no is required');
  if (!row.contactFirstName && !row.contactLastName) issues.push('contact name is required');
  if (!row.phone) issues.push('phone is required');
  if (row.phone && normalizePhone(row.phone).length < 7) issues.push('phone must contain at least 7 digits');
  if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) issues.push('email format is invalid');
  if (row.contactType.length > 30) issues.push('contact_type is too long');
  return issues;
}

export function contactDuplicateKey(row: ContactImportRow): string | null {
  const student = row.studentId || normalizeIdentity(row.admissionNo);
  const contact = normalizePhone(row.phone) || normalizeEmail(row.email);
  return student && contact ? `${student}|${contact}` : null;
}

export function findIntraFileDuplicates(rows: ContactImportRow[]): ContactImportIssue[] {
  const seen = new Map<string, number>();
  const issues: ContactImportIssue[] = [];
  for (const row of rows) {
    const key = contactDuplicateKey(row);
    if (!key) continue;
    const previous = seen.get(key);
    if (previous) issues.push({ rowNumber: row.rowNumber, reason: `duplicate of row ${previous} in this file` });
    else seen.set(key, row.rowNumber);
  }
  return issues;
}

export function templateHeaders(): string[] {
  return ['admission_no', 'student_id', 'contact_first_name', 'contact_last_name', 'phone', 'email', 'relationship', 'contact_type', 'occupation', 'address', 'is_primary'];
}
