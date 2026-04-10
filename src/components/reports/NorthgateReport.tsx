'use client';

import React from 'react';
import { Skeleton } from '@/components/ui/loading/Skeleton';
import type { NorthgateReportData, SubjectRow } from './types';

/* ═══════════════════════════════════════════════════════
   SVG Sub-Components
   ═══════════════════════════════════════════════════════ */

function SchoolCrest() {
  return (
    <svg width="80" height="100" viewBox="0 0 100 120" aria-label="School crest">
      <path
        d="M10,20 Q50,0 90,20 L90,80 Q50,110 10,80 Z"
        fill="#660033" stroke="#FFD700" strokeWidth="2"
      />
      <text x="50" y="55" fontFamily="Arial" fontSize="10" fill="white" textAnchor="middle">
        NorthGate
      </text>
      <text x="50" y="68" fontFamily="Arial" fontSize="10" fill="white" textAnchor="middle">
        School
      </text>
      <circle cx="50" cy="85" r="10" fill="#FFD700" opacity="0.5" />
    </svg>
  );
}

function Barcode({ value }: { value: string }) {
  // Simple deterministic barcode: each digit maps to a bar pattern
  const widths = [2, 1, 3, 1, 2, 1, 3, 2, 1, 2];
  const bars: React.ReactNode[] = [];
  let x = 2;
  for (let i = 0; i < value.length && i < 20; i++) {
    const d = parseInt(value[i], 10) || 0;
    const w = widths[d % widths.length];
    bars.push(<rect key={`b${i}`} x={x} y="5" width={w} height="30" fill="black" />);
    x += w + 1.5;
  }

  return (
    <svg width="40" height="120" viewBox="0 0 40 120" aria-label={`Barcode ${value}`}>
      <rect width="40" height="120" fill="white" />
      <g transform="rotate(-90 20 60)">
        {bars}
        <text
          x={-40} y={45}
          fontFamily="monospace" fontSize="10"
          transform="rotate(90 -40 45)"
        >
          {value}
        </text>
      </g>
    </svg>
  );
}

function ArrowLabel({
  children,
  direction = 'down',
}: {
  children: React.ReactNode;
  direction?: 'down' | 'right';
}) {
  if (direction === 'right') {
    return (
      <div className="report-comment-label">
        {children}
      </div>
    );
  }
  return (
    <div className="report-table-title">
      {children}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Skeleton Fallback
   ═══════════════════════════════════════════════════════ */

function ReportSkeleton() {
  return (
    <div className="w-[800px] mx-auto bg-white p-10 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div className="space-y-2">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-[100px] w-[80px] rounded" />
      </div>
      {/* Banner */}
      <Skeleton className="h-8 w-full" />
      {/* Student details */}
      <div className="flex gap-5">
        <Skeleton className="h-[120px] w-[40px]" />
        <Skeleton className="h-[120px] w-[110px]" />
        <div className="flex-1 grid grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </div>
      </div>
      {/* Subject table */}
      <Skeleton className="h-6 w-full" />
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
      {/* Comments */}
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Subject Table Row
   ═══════════════════════════════════════════════════════ */

function SubjectTableRow({ row }: { row: SubjectRow }) {
  return (
    <tr>
      <td>{row.name}</td>
      <td className="report-center">{row.eot ?? '-'}</td>
      <td className="report-center">{row.total ?? ''}</td>
      <td className="report-center report-blue">{row.grade ?? ''}</td>
      <td className="report-blue">{row.comment ?? ''}</td>
      <td className="report-center report-blue">{row.initials ?? ''}</td>
    </tr>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Report Component
   ═══════════════════════════════════════════════════════ */

export default function NorthgateReport({
  data,
}: {
  data?: NorthgateReportData;
}) {
  if (!data) return <ReportSkeleton />;

  const {
    school,
    banner,
    studentDetails,
    principalSubjects,
    otherSubjects,
    assessment,
    comments,
    nextTermDate,
    gradingScale,
    totalMarks,
    averageMarks,
  } = data;

  return (
    <>
      {/* Print-precise layout styles — kept in jsx style block for A4 fidelity */}
      <style jsx>{`
        /* ── CSS Custom Properties ── */
        .report-page {
          --header-blue: #002060;
          --table-header-blue: #0000FF;
          --light-grey: #D9D9D9;
          --border-color: #000;

          width: 800px;
          background: white;
          padding: 40px;
          position: relative;
          font-family: Arial, sans-serif;
          font-size: 14px;
          color: #000;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        }

        /* ── Header ── */
        .report-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
        }
        .report-school-name {
          color: var(--header-blue);
          font-size: 32px;
          margin: 0;
          text-transform: uppercase;
          font-weight: bold;
        }
        .report-school-info p {
          margin: 2px 0;
          font-weight: bold;
          font-size: 14px;
        }
        .report-motto {
          font-style: italic;
          font-weight: normal !important;
          border-bottom: 2px solid #000;
          display: inline-block;
          width: 100%;
        }

        /* ── Banner ── */
        .report-banner {
          background-color: var(--table-header-blue);
          color: white;
          text-align: center;
          padding: 5px;
          font-weight: bold;
          margin-bottom: 15px;
        }

        /* ── Student details ── */
        .report-student-details {
          display: flex;
          gap: 20px;
          margin-bottom: 20px;
        }
        .report-barcode-col {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .report-photo-box {
          width: 110px;
          height: 120px;
          border: 1px solid #000;
          background-color: #f0f0f0;
          overflow: hidden;
        }
        .report-photo-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .report-details-grid {
          flex-grow: 1;
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          grid-row-gap: 15px;
          font-size: 14px;
        }
        .report-detail-item span {
          display: block;
          border-bottom: 1px dotted #000;
          color: #800000;
          font-weight: bold;
          padding-top: 5px;
        }

        /* ── Table ── */
        .report-page table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 15px;
          font-size: 13px;
        }
        .report-page th,
        .report-page td {
          border: 1px solid var(--border-color);
          padding: 5px;
          text-align: left;
        }
        .report-center { text-align: center; }
        .report-blue { color: #0000FF; }
        .report-red { color: #FF0000; font-weight: bold; }

        /* ── Arrow title (triangle pointing down) ── */
        .report-table-title {
          background-color: var(--light-grey);
          text-align: center;
          font-weight: bold;
          position: relative;
          padding: 5px;
          margin-bottom: 15px;
        }
        .report-table-title::after {
          content: "";
          position: absolute;
          bottom: -10px;
          left: 50%;
          transform: translateX(-50%);
          border-left: 10px solid transparent;
          border-right: 10px solid transparent;
          border-top: 10px solid var(--light-grey);
        }

        /* ── Comments ── */
        .report-comments { margin-top: 30px; font-size: 13px; }
        .report-comment-row { display: flex; margin-bottom: 15px; }
        .report-comment-label {
          background-color: var(--light-grey);
          padding: 5px;
          width: 160px;
          font-weight: bold;
          position: relative;
          flex-shrink: 0;
        }
        .report-comment-label::after {
          content: "";
          position: absolute;
          right: -10px;
          top: 25%;
          border-top: 8px solid transparent;
          border-bottom: 8px solid transparent;
          border-left: 10px solid var(--light-grey);
        }
        .report-comment-value {
          flex-grow: 1;
          border-bottom: 1px dotted #000;
          margin-left: 20px;
          font-style: italic;
          color: #0000FF;
          display: flex;
          align-items: flex-end;
          padding-bottom: 2px;
        }

        /* ── Grading scale ── */
        .report-grading th { background-color: white; font-weight: normal; }

        /* ── Totals row ── */
        .report-totals { font-weight: bold; }

        /* ── Print rules ── */
        @media print {
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          body { background: white !important; margin: 0; padding: 0; }
          .report-page {
            width: 100%;
            padding: 0;
            box-shadow: none;
            page-break-inside: avoid;
            page-break-after: always;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="report-page" id="report-printable">
        {/* ── HEADER ── */}
        <div className="report-header">
          <div className="report-school-info">
            <h1 className="report-school-name">{school.name}</h1>
            <p>{school.address}, Tel: {school.phone},</p>
            <p>{school.location}</p>
            <p className="report-motto">{school.motto}</p>
          </div>
          <SchoolCrest />
        </div>

        {/* ── BANNER ── */}
        <div className="report-banner">{banner}</div>

        {/* ── STUDENT DETAILS ── */}
        <div className="report-student-details">
          <div className="report-barcode-col">
            <Barcode value={studentDetails.studentNo} />
          </div>

          <div className="report-photo-box">
            {studentDetails.photoUrl ? (
              <img
                src={studentDetails.photoUrl}
                alt={`${studentDetails.name} photo`}
                crossOrigin="anonymous"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-gray-300 text-xs">
                PHOTO
              </div>
            )}
          </div>

          <div className="report-details-grid">
            <div className="report-detail-item">
              Name: <span>{studentDetails.name}</span>
            </div>
            <div className="report-detail-item">
              Sex: <span>{studentDetails.sex}</span>
            </div>
            <div className="report-detail-item">
              Class: <span>{studentDetails.class}</span>
            </div>
            <div className="report-detail-item">
              Student No: <span>{studentDetails.studentNo}</span>
            </div>
            <div className="report-detail-item" style={{ gridColumn: 'span 2' }}>
              Term: <span>{studentDetails.term}</span>
            </div>
          </div>
        </div>

        {/* ── PRINCIPAL SUBJECTS ── */}
        <ArrowLabel direction="down">
          Principal Subjects Comprising the General Assessment
        </ArrowLabel>
        <table>
          <thead>
            <tr>
              <th>SUBJECT</th>
              <th className="report-center">EOT</th>
              <th className="report-center">TOTAL</th>
              <th className="report-red report-center">GRADE</th>
              <th>COMMENT</th>
              <th className="report-center">INITIALS</th>
            </tr>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <td style={{ textAlign: 'right' }}>Marks contribute:</td>
              <td className="report-center">100</td>
              <td className="report-center">100</td>
              <td />
              <td />
              <td />
            </tr>
          </thead>
          <tbody>
            {principalSubjects.map((subj) => (
              <SubjectTableRow key={subj.name} row={subj} />
            ))}
          </tbody>
          <tfoot>
            <tr className="report-totals">
              <td colSpan={2}>TOTAL MARKS:</td>
              <td className="report-center">{totalMarks ?? ''}</td>
              <td colSpan={2} style={{ textAlign: 'right' }}>AVERAGE MARKS:</td>
              <td className="report-center">{averageMarks ?? ''}</td>
            </tr>
          </tfoot>
        </table>

        {/* ── OTHER SUBJECTS ── */}
        <ArrowLabel direction="down">
          Other subjects (Not part of Assessment)
        </ArrowLabel>
        <table>
          <thead>
            <tr style={{ backgroundColor: '#f9f9f9' }}>
              <td style={{ width: '30%', textAlign: 'right' }}>Marks contribute:</td>
              <td style={{ width: '10%' }} className="report-center">100</td>
              <td style={{ width: '10%' }} />
              <td style={{ width: '10%' }} />
              <td style={{ width: '30%' }} />
              <td style={{ width: '10%' }} />
            </tr>
          </thead>
          <tbody>
            {otherSubjects.map((subj) => (
              <SubjectTableRow key={subj.name} row={subj} />
            ))}
          </tbody>
        </table>

        {/* ── ASSESSMENT / POSITION ── */}
        <table>
          <thead>
            <tr>
              <th colSpan={2} className="report-center">Position</th>
              <th colSpan={2} className="report-center">General Assessment</th>
            </tr>
            <tr className="report-center">
              <td>Class</td>
              <td>Stream</td>
              <td>Aggregates</td>
              <td>Division</td>
            </tr>
          </thead>
          <tbody className="report-center report-red">
            <tr>
              <td>{assessment.classPosition}</td>
              <td>{assessment.streamPosition}</td>
              <td>{assessment.aggregates ?? ''}</td>
              <td style={{ fontSize: 18 }}>{assessment.division ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ── COMMENTS ── */}
        <div className="report-comments">
          <div className="report-comment-row">
            <ArrowLabel direction="right">Class teacher comment</ArrowLabel>
            <div className="report-comment-value">{comments.classTeacher ?? ''}</div>
          </div>
          <div className="report-comment-row">
            <ArrowLabel direction="right">DOS Comment</ArrowLabel>
            <div className="report-comment-value">{comments.dos ?? ''}</div>
          </div>
          <div className="report-comment-row">
            <ArrowLabel direction="right">Headteacher comment</ArrowLabel>
            <div className="report-comment-value">{comments.headTeacher ?? ''}</div>
          </div>
        </div>

        {/* ── NEXT TERM ── */}
        {nextTermDate && (
          <p style={{ marginTop: 20 }}>
            {nextTermDate}
            <br />
            Next Term Begins
          </p>
        )}

        {/* ── GRADING SCALE ── */}
        <table className="report-grading" style={{ marginTop: 10 }}>
          <tbody>
            <tr className="report-center">
              <th>GRADE</th>
              {gradingScale.map((g) => (
                <td key={g.grade}>{g.grade}</td>
              ))}
            </tr>
            <tr className="report-center">
              <th>SCORE RANGE</th>
              {gradingScale.map((g) => (
                <td key={g.grade}>{g.range}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
