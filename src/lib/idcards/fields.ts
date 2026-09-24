/** Card field catalogue (client-safe: no xlsx import). */
export interface FieldDef { key: string; label: string; synonyms: string[]; }

export const CARD_FIELDS: FieldDef[] = [
  { key: 'full_name', label: 'Full name', synonyms: ['name', 'fullname', 'studentname', 'learnername', 'pupilname', 'namesofstudent', 'names'] },
  { key: 'first_name', label: 'First name', synonyms: ['firstname', 'givenname', 'forename', 'fname'] },
  { key: 'middle_name', label: 'Middle / other name', synonyms: ['middlename', 'othername', 'othernames', 'midname', 'middle'] },
  { key: 'last_name', label: 'Last name', synonyms: ['lastname', 'surname', 'familyname', 'lname'] },
  { key: 'admission_no', label: 'Admission / reg. no', synonyms: ['admissionno', 'admissionnumber', 'admno', 'regno', 'registrationnumber', 'regnumber', 'studentid', 'idno', 'indexno', 'lin', 'payno'] },
  { key: 'class', label: 'Class', synonyms: ['class', 'classname', 'grade', 'form', 'level', 'stream', 'classstream'] },
  { key: 'gender', label: 'Gender', synonyms: ['gender', 'sex'] },
  { key: 'dob', label: 'Date of birth', synonyms: ['dob', 'dateofbirth', 'birthdate', 'born'] },
  { key: 'photo_url', label: 'Photo URL', synonyms: ['photo', 'photourl', 'picture', 'image', 'imageurl', 'passport', 'photolink'] },
  { key: 'guardian_phone', label: 'Guardian phone', synonyms: ['guardianphone', 'parentphone', 'parentcontact', 'phone', 'contact', 'telephone', 'tel', 'mobile'] },
  { key: 'valid_until', label: 'Valid until', synonyms: ['validuntil', 'validity', 'expiry', 'expirydate', 'expires', 'validto'] },
  { key: 'academic_year', label: 'Academic year', synonyms: ['academicyear', 'year', 'session'] },
];
