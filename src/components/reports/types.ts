export interface StudentDetails {
  name: string;
  sex: 'M' | 'F';
  studentNo: string;
  class: string;
  stream?: string | null;
  term: string;
  photoUrl?: string | null;
}

export interface SubjectRow {
  name: string;
  eot: number | null;
  total: number | null;
  grade: string | null;
  comment: string | null;
  initials: string | null;
}

export interface Assessment {
  aggregates: number | null;
  division: string | null;
  classPosition: string;
  streamPosition: string;
}

export interface ReportComments {
  classTeacher: string | null;
  dos: string | null;
  headTeacher: string | null;
}

export interface SchoolInfo {
  name: string;
  address: string;
  location: string;
  motto: string;
  phone: string;
}

export interface GradingRow {
  grade: string;
  range: string;
}

export interface NorthgateReportData {
  school: SchoolInfo;
  banner: string;
  studentDetails: StudentDetails;
  principalSubjects: SubjectRow[];
  otherSubjects: SubjectRow[];
  assessment: Assessment;
  comments: ReportComments;
  nextTermDate: string | null;
  gradingScale: GradingRow[];
  totalMarks: number | null;
  averageMarks: number | null;
}
