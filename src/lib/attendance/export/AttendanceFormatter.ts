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
};

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

  get emptyValue(): string {
    return this.config.emptyValue;
  }

  formatBoolean(value: boolean | null | undefined): string {
    return value ? this.config.yesLabel : this.config.noLabel;
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
    return VERIFY_LABELS[value] ?? `Type ${value}`;
  }

  formatCategory(value: string | null | undefined): string {
    if (!value) {
      return ROLE_LABELS.unmatched;
    }
    return ROLE_LABELS[value] ?? this.toTitleCase(value);
  }

  formatAttendanceStatus(value: string | null | undefined): string {
    if (!value) {
      return 'Scan';
    }
    return DERIVED_LABELS[value] ?? this.toTitleCase(value.replace(/_/g, ' '));
  }

  formatMatchStatus(matched: boolean | number | null | undefined): string {
    return matched ? 'Matched' : 'Unmatched';
  }

  formatDate(value: AttendanceTimestampInput): string {
    const date = this.parseTimestamp(value);
    if (!date) {
      return this.config.emptyValue;
    }

    if (this.config.dateFormat === 'day-slash-month-slash-year') {
      return [
        pad(this.getDatePart(date, 'day')),
        pad(this.getDatePart(date, 'month')),
        this.getDatePart(date, 'year'),
      ].join('/');
    }

    return new Intl.DateTimeFormat(this.config.dateLocale, {
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

    return new Intl.DateTimeFormat(this.config.timeLocale, {
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
