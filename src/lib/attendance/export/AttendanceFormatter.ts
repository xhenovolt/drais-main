import { resolveTimePolicy } from '@/lib/attendance/device-clock';
import { getSchoolFromDB } from '@/lib/schoolDB';

export interface AttendanceFormatterConfig {
  timezone: string;
  offsetMinutes: number;
  schoolName: string;
  dateLocale: string;
  timeLocale: string;
  dateFormat: 'day-month-short-year' | 'day-slash-month-slash-year';
  hour12: boolean;
  includeSeconds: boolean;
  emptyValue: string;
  yesLabel: string;
  noLabel: string;
  /** Interface language. 'ar' gives Arabic labels and Arabic-Indic digits; 'en' is the original output. */
  lang: 'en' | 'ar';
}

export type AttendanceFormatterOverrides = Partial<AttendanceFormatterConfig>;

export type AttendanceDateBoundary = 'start' | 'end';

export type AttendanceTimestampInput = Date | string | null | undefined;

const DEFAULT_CONFIG: AttendanceFormatterConfig = {
  timezone: 'Africa/Kampala',
  offsetMinutes: 180,
  schoolName: 'School',
  dateLocale: 'en-GB',
  timeLocale: 'en-US',
  dateFormat: 'day-month-short-year',
  hour12: true,
  includeSeconds: true,
  emptyValue: '—',
  yesLabel: 'Yes',
  noLabel: 'No',
  lang: 'en',
};

// Arabic forms of every label below. English output is unchanged.
const AR_VERIFY: Record<number, string> = { 0: 'كلمة مرور', 1: 'بصمة إصبع', 2: 'بطاقة', 15: 'الوجه' };
const AR_ROLE: Record<string, string> = { student: 'متعلم', staff: 'موظف', unmatched: 'غير مطابق' };
const AR_DERIVED: Record<string, string> = {
  ARRIVED: 'وصل', ARRIVED_LATE: 'وصول متأخر', ARRIVED_EARLY: 'وصل مبكرًا', TEMP_EXIT: 'خرج مؤقتًا', RETURNED: 'عاد',
  CHECKED_OUT: 'انصرف', EARLY_DEPARTURE: 'انصرف مبكرًا', OVERTIME_EXIT: 'انصراف بعد الدوام', DUPLICATE: 'مكرر',
};
const AR_LOCALE = 'ar-u-nu-arab-ca-gregory';
const toArabicDigits = (s: string) => s.replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)]);

/** "1h 20m" / "12m" (rule-evaluator's fmtDur) → "١ س ٢٠ د" / "١٢ د". */
const arDuration = (s: string) => toArabicDigits(s.replace(/(\d+)h/g, '$1 س').replace(/(\d+)m/g, '$1 د'));

/**
 * The per-punch detail the attendance engine stores (rule-evaluator.deriveEvents) is English text in a
 * fixed set of shapes. Shown in Arabic, each shape is rewritten; anything unrecognised is returned with
 * its digits converted. The stored value is never changed.
 */
export function arabicPunchDetail(detail: string): string {
  const d = detail.trim();
  const fixed: Record<string, string> = {
    'Duplicate scan (ignored)': 'بصمة مكررة (تم تجاهلها)', 'Arrived before opening': 'وصل قبل موعد الفتح',
    'On time': 'في الوقت', 'Returned': 'عاد', 'Stepped out': 'خرج مؤقتًا', 'Left early': 'انصرف مبكرًا',
  };
  if (fixed[d]) return fixed[d];
  let m: RegExpMatchArray | null;
  if ((m = d.match(/^Late by (.+)$/))) return `متأخر بمقدار ${arDuration(m[1])}`;
  if ((m = d.match(/^Overtime — (.+) on site$/))) return `عمل إضافي — ${arDuration(m[1])} في المدرسة`;
  if ((m = d.match(/^Checked out — (.+) on site$/))) return `انصرف — ${arDuration(m[1])} في المدرسة`;
  if ((m = d.match(/^Left early by (.+)$/))) return `انصرف مبكرًا بمقدار ${arDuration(m[1])}`;
  return toArabicDigits(d);
}

const VERIFY_LABELS: Record<number, string> = {
  0: 'Password',
  1: 'Fingerprint',
  2: 'Card',
  15: 'Face',
};

const ROLE_LABELS: Record<string, string> = {
  student: 'Learner',
  staff: 'Staff',
  unmatched: 'Unmatched',
};

const DERIVED_LABELS: Record<string, string> = {
  ARRIVED: 'Arrived',
  ARRIVED_LATE: 'Late arrival',
  ARRIVED_EARLY: 'Arrived early',
  TEMP_EXIT: 'Stepped out',
  RETURNED: 'Returned',
  CHECKED_OUT: 'Checked out',
  EARLY_DEPARTURE: 'Left early',
  OVERTIME_EXIT: 'Overtime exit',
  DUPLICATE: 'Duplicate',
};

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function formatUtcSql(date: Date): string {
  return [
    `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`,
    `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())}`,
  ].join(' ');
}

export class AttendanceFormatter {
  readonly config: AttendanceFormatterConfig;

  constructor(config: AttendanceFormatterOverrides = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static async forSchool(
    schoolId: number,
    overrides: AttendanceFormatterOverrides = {},
  ): Promise<AttendanceFormatter> {
    const [policy, school] = await Promise.all([
      resolveTimePolicy(schoolId),
      getSchoolFromDB(schoolId),
    ]);

    return new AttendanceFormatter({
      ...(overrides.lang === 'ar' ? { yesLabel: 'نعم', noLabel: 'لا' } : {}),
      timezone: policy.timezone || DEFAULT_CONFIG.timezone,
      offsetMinutes: Number.isFinite(policy.offsetMinutes) ? policy.offsetMinutes : DEFAULT_CONFIG.offsetMinutes,
      schoolName: school.name || DEFAULT_CONFIG.schoolName,
      ...overrides,
    });
  }

  get timezone(): string {
    return this.config.timezone;
  }

  get schoolName(): string {
    return this.config.schoolName;
  }

  get isArabic(): boolean {
    return this.config.lang === 'ar';
  }

  /** "Boarding" / "Day" / "Not set" for a learner's residence, in the interface language. */
  formatResidence(value: string | null | undefined): string {
    if (value === 'boarding') return this.isArabic ? 'داخلي' : 'Boarding';
    if (value === 'day') return this.isArabic ? 'نهاري' : 'Day';
    return this.isArabic ? 'غير محدد' : 'Not set';
  }

  get emptyValue(): string {
    return this.config.emptyValue;
  }

  formatBoolean(value: boolean | null | undefined): string {
    return value ? this.config.yesLabel : this.config.noLabel;
  }

  /** The engine's per-punch detail, in the interface language. */
  formatPunchDetail(value: string | null | undefined): string {
    if (value === null || value === undefined || value === '') return this.config.emptyValue;
    return this.isArabic ? arabicPunchDetail(String(value)) : String(value);
  }

  formatNullable(value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return this.config.emptyValue;
    }
    return String(value);
  }

  formatVerificationMethod(value: number | null | undefined): string {
    if (value === null || value === undefined) {
      return this.config.emptyValue;
    }
    if (this.isArabic) return AR_VERIFY[value] ?? `النوع ${toArabicDigits(String(value))}`;
    return VERIFY_LABELS[value] ?? `Type ${value}`;
  }

  formatCategory(value: string | null | undefined): string {
    if (!value) {
      return this.isArabic ? AR_ROLE.unmatched : ROLE_LABELS.unmatched;
    }
    if (this.isArabic) return AR_ROLE[value] ?? value;
    return ROLE_LABELS[value] ?? this.toTitleCase(value);
  }

  formatAttendanceStatus(value: string | null | undefined): string {
    if (!value) {
      return this.isArabic ? 'بصمة' : 'Scan';
    }
    if (this.isArabic) return AR_DERIVED[value] ?? value.replace(/_/g, ' ');
    return DERIVED_LABELS[value] ?? this.toTitleCase(value.replace(/_/g, ' '));
  }

  formatMatchStatus(matched: boolean | number | null | undefined): string {
    if (this.isArabic) return matched ? 'مطابق' : 'غير مطابق';
    return matched ? 'Matched' : 'Unmatched';
  }

  formatProvisionalStatus(isProvisional: boolean | null | undefined): string {
    if (this.isArabic) return isProvisional ? 'مؤقت' : 'مؤكد';
    return isProvisional ? 'Provisional' : 'Verified';
  }

  formatDate(value: AttendanceTimestampInput): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return this.config.emptyValue;
    }

    if (this.config.dateFormat === 'day-slash-month-slash-year') {
      const out = [
        pad(this.getDatePart(date, 'day')),
        pad(this.getDatePart(date, 'month')),
        this.getDatePart(date, 'year'),
      ].join('/');
      return this.isArabic ? toArabicDigits(out) : out;
    }

    return new Intl.DateTimeFormat(this.isArabic ? AR_LOCALE : this.config.dateLocale, {
      timeZone: this.config.timezone,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(date).replace(',', '');
  }

  formatTime(value: AttendanceTimestampInput): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return this.config.emptyValue;
    }

    return new Intl.DateTimeFormat(this.isArabic ? AR_LOCALE : this.config.timeLocale, {
      timeZone: this.config.timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: this.config.includeSeconds ? '2-digit' : undefined,
      hour12: this.config.hour12,
    }).format(date);
  }

  formatDateTime(value: AttendanceTimestampInput): string {
    const datePart = this.formatDate(value);
    const timePart = this.formatTime(value);
    if (datePart === this.config.emptyValue && timePart === this.config.emptyValue) {
      return this.config.emptyValue;
    }
    return `${datePart} ${timePart}`.trim();
  }

  toUtcBoundary(localDate: string, boundary: AttendanceDateBoundary): string {
    const wallTime = boundary === 'start' ? '00:00:00' : '23:59:59';
    const wallMs = Date.parse(`${localDate}T${wallTime}Z`);
    const utcMs = wallMs - this.config.offsetMinutes * 60_000;
    return formatUtcSql(new Date(utcMs));
  }

  private parseTimestamp(value: AttendanceTimestampInput): Date | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return Number.isNaN(value.getTime()) ? null : value;
    }

    const trimmed = String(value).trim();
    if (!trimmed) {
      return null;
    }

    const normalized =
      trimmed.includes('T') || /Z$|[+-]\d{2}:\d{2}$/.test(trimmed)
        ? trimmed
        : `${trimmed.replace(' ', 'T')}Z`;

    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  private getDatePart(date: Date, part: 'day' | 'month' | 'year'): number {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: this.config.timezone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).formatToParts(date);

    const value = parts.find((entry) => entry.type === part)?.value;
    return Number(value || 0);
  }

  private toTitleCase(value: string): string {
    return value
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');
  }
}
