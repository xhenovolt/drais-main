import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { AttendanceFormatter } from '../export/AttendanceFormatter.ts';
import { AttendancePresentationModel } from '../export/AttendancePresentationModel.ts';
import { AttendanceCSVExporter } from '../export/AttendanceCSVExporter.ts';

function makeRow(overrides = {}) {
  return {
    id: 101,
    device_sn: 'GATE-01',
    device_user_id: 'BIO-123',
    check_time: '2026-07-14T06:03:32.000Z',
    verify_type: 1,
    matched: 1,
    role_type: 'student',
    derived_event: 'ARRIVED_LATE',
    derived_detail: 'Late by 12 minutes',
    class_name: 'Senior 2',
    person_name: 'Amina Nansubuga',
    ...overrides,
  };
}

describe('Attendance presentation + export', () => {
  it('formats timestamps in the school timezone and strips ISO artifacts from CSV', () => {
    const formatter = new AttendanceFormatter({
      timezone: 'Africa/Kampala',
      offsetMinutes: 180,
      schoolName: 'Iganga Parents Secondary School',
    });

    const presentation = AttendancePresentationModel.fromHistoryRow(makeRow(), formatter);
    const csv = AttendanceCSVExporter.build([presentation]);

    assert.equal(presentation.date, '14 Jul 2026');
    assert.equal(presentation.time, '09:03:32 AM');
    assert.equal(presentation.statusDetail, 'Late by 12 minutes');
    assert.ok(csv.includes('09:03:32 AM'));
    assert.ok(csv.includes('Late by 12 minutes'));
    assert.equal(csv.includes('2026-07-14T06:03:32.000Z'), false);
    assert.equal(csv.includes('T06:03:32.000Z'), false);
  });

  it('humanizes booleans, nulls, and unmatched labels for the presentation model', () => {
    const formatter = new AttendanceFormatter({
      timezone: 'Africa/Kampala',
      offsetMinutes: 180,
    });

    const presentation = AttendancePresentationModel.fromHistoryRow(
      makeRow({
        matched: 0,
        role_type: null,
        verify_type: null,
        derived_event: null,
        derived_detail: null,
        class_name: null,
        person_name: null,
      }),
      formatter,
    );

    assert.equal(presentation.name, 'UID: BIO-123');
    assert.equal(presentation.category, 'Unmatched');
    assert.equal(presentation.className, '—');
    assert.equal(presentation.verificationMethod, '—');
    assert.equal(presentation.attendanceStatus, 'Scan');
    assert.equal(presentation.statusDetail, '—');
    assert.equal(presentation.matchStatus, 'Unmatched');
    assert.equal(presentation.verified, 'No');
  });

  it('supports configurable display formats without changing the export contract', () => {
    const formatter = new AttendanceFormatter({
      timezone: 'Africa/Kampala',
      offsetMinutes: 180,
      dateFormat: 'day-slash-month-slash-year',
      includeSeconds: false,
    });

    const presentation = AttendancePresentationModel.fromHistoryRow(makeRow(), formatter);

    assert.equal(presentation.date, '14/07/2026');
    assert.equal(presentation.time, '09:03 AM');
    assert.equal(presentation.timestamp, '14/07/2026 09:03 AM');
  });

  it('converts local date filters to UTC boundaries using the school offset', () => {
    const formatter = new AttendanceFormatter({
      timezone: 'Africa/Kampala',
      offsetMinutes: 180,
    });

    assert.equal(formatter.toUtcBoundary('2026-07-14', 'start'), '2026-07-13 21:00:00');
    assert.equal(formatter.toUtcBoundary('2026-07-14', 'end'), '2026-07-14 20:59:59');
  });
});
