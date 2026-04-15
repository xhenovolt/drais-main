import React from 'react';
import type { NorthgateReportData, SubjectRow } from './types';

// ============================================================================
// NorthgateClassicTemplate
//
// DIRECT JSX CLONE of backup/rpt.html — zero layout loss.
//
// Every table, SVG ribbon, barcode <img>, inline style, and CSS class
// is preserved exactly as written in the source HTML.
//
// Dynamic data is injected via NorthgateReportData props.
// template_key: 'northgate_rpt_clone'
// ============================================================================

interface Props {
  data?: NorthgateReportData;
}

function SubjectRow({ row }: { row: SubjectRow }) {
  return (
    <tr>
      <td>{row.name}</td>
      <td>{row.eot ?? '-'}</td>
      <td>{row.total ?? ''}</td>
      <td style={{ color: 'red' }}>{row.grade ?? ''}</td>
      <td className="comment-cell">{row.comment ?? ''}</td>
      <td className="initials">{row.initials ?? ''}</td>
    </tr>
  );
}

/** Concave-arrow-down ribbon — exact polygon from rpt.html */
function SectionRibbon({ label }: { label: string }) {
  return (
    <div style={{ textAlign: 'center', margin: '10px 0' }}>
      <svg width="600" height="50" viewBox="0 0 600 50">
        <polygon points="0,5 600,5 600,30 315,30 300,45 285,30 0,30" fill="#999" />
        <text
          x="300" y="22"
          fontFamily="Arial" fontSize="12"
          fill="black" textAnchor="middle" fontWeight="bold"
        >
          {label}
        </text>
      </svg>
    </div>
  );
}

/** Right-pointing arrow label — exact polygon from rpt.html */
function RemarkLabel({ label }: { label: string }) {
  return (
    <svg width="150" height="25">
      <polygon points="0,0 130,0 150,12.5 130,25 0,25" fill="#ddd" />
      <text x="10" y="17" fontSize="11" fontWeight="bold">{label}</text>
    </svg>
  );
}

export default function NorthgateClassicTemplate({ data }: Props) {
  // ── Fallback skeleton while data loads ──────────────────────────────────
  if (!data) {
    return (
      <div style={{ width: 820, margin: '0 auto', fontFamily: 'Arial, sans-serif', fontSize: 12, padding: 20, color: '#999', textAlign: 'center', border: '1px solid #ccc' }}>
        Loading report…
      </div>
    );
  }

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

  const barcodeUrl =
    `https://bwipjs-api.metafloor.com/?bcid=code128` +
    `&text=${encodeURIComponent(studentDetails.studentNo)}` +
    `&includetext&rotate=L&scale=1&height=18`;

  return (
    <>
      {/* ── CSS: exact copy of rpt.html <style> block ──────────────────── */}
      <style>{`
        .ng-classic-container {
          width: 800px;
          margin: auto;
          border: 1px solid #ccc;
          padding: 10px;
          font-family: Arial, sans-serif;
          font-size: 12px;
          color: #333;
          background: white;
        }

        /* Header */
        .ng-classic-container .header-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
        .ng-classic-container .school-name  { font-size: 24px; color: #000080; font-weight: bold; margin: 0; }
        .ng-classic-container .school-info  { font-size: 13px; font-weight: bold; font-style: italic; margin: 2px 0; }

        /* Banner */
        .ng-classic-container .blue-banner {
          background: #0000FF;
          color: white;
          text-align: center;
          padding: 5px;
          font-weight: bold;
          letter-spacing: 2px;
          margin: 5px 0;
        }

        /* Student Info */
        .ng-classic-container .student-info-table { width: 100%; border-collapse: collapse; border: 1px dashed #999; margin-bottom: 10px; }
        .ng-classic-container .student-photo     { width: 90px; height: 100px; border: 1px solid #000; object-fit: cover; display: block; }
        .ng-classic-container .info-label        { color: #555; font-size: 11px; }
        .ng-classic-container .info-value        { color: #B22222; font-weight: bold; font-size: 14px; text-transform: uppercase; }

        /* Results tables */
        .ng-classic-container .results-table                    { width: 100%; border-collapse: collapse; margin-top: -1px; }
        .ng-classic-container .results-table th,
        .ng-classic-container .results-table td                 { border: 1px solid #333; padding: 4px; text-align: center; }
        .ng-classic-container .results-table th                 { background: #f2f2f2; text-transform: uppercase; font-size: 11px; }
        .ng-classic-container .results-table .comment-cell      { text-align: left; font-style: italic; color: #0000FF; font-size: 11px; width: 40%; }
        .ng-classic-container .results-table .initials          { color: #0000FF; font-weight: bold; }

        /* Remarks */
        .ng-classic-container .remark-row  { display: flex; align-items: center; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
        .ng-classic-container .remark-text { margin-left: 10px; font-style: italic; color: #0000FF; font-size: 13px; }

        /* Grade scale */
        .ng-classic-container .grade-scale    { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .ng-classic-container .grade-scale td { border: 1px solid #000; text-align: center; padding: 3px; font-size: 10px; }
        .ng-classic-container .grade-header   { background: #f2f2f2; font-weight: bold; }

        /* Print */
        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body  { background: white !important; margin: 0; padding: 0; }
          .ng-classic-container {
            width: 100%;
            border: none;
            padding: 0;
            page-break-inside: avoid;
            page-break-after: always;
          }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* ── Report container ───────────────────────────────────────────────── */}
      <div className="ng-classic-container" id="report-printable">

        {/* ── HEADER ── */}
        <table className="header-table">
          <tbody>
            <tr>
              <td width="80%">
                <h1 className="school-name">{school.name}</h1>
                <p className="school-info">
                  {school.address}, Tel: {school.phone},<br />
                  {school.location}
                </p>
                <p style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: 12 }}>
                  {school.motto}
                </p>
              </td>
              <td width="20%" align="right">
                <img src="/uploads/logo.png" alt="Logo" style={{ width: 80 }} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── BLUE BANNER ── */}
        <div className="blue-banner">{banner}</div>

        {/* ── STUDENT INFO ── */}
        <table className="student-info-table">
          <tbody>
            <tr>
              {/* Barcode column */}
              <td width={45} align="center" style={{ borderRight: '1px dashed #999', padding: '4px 2px' }}>
                <img
                  src={barcodeUrl}
                  alt={`Barcode ${studentDetails.studentNo}`}
                  style={{ height: 90, width: 32, display: 'block', margin: 'auto' }}
                />
              </td>

              {/* Photo column */}
              <td width={110} align="center">
                {studentDetails.photoUrl ? (
                  <img
                    src={studentDetails.photoUrl}
                    alt="Student"
                    className="student-photo"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div
                    className="student-photo"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f0f0f0', color: '#aaa', fontSize: 10 }}
                  >
                    PHOTO
                  </div>
                )}
              </td>

              {/* Details column */}
              <td>
                <table width="100%" cellPadding={5}>
                  <tbody>
                    <tr>
                      <td>
                        <span className="info-label">Name:</span><br />
                        <span className="info-value">{studentDetails.name}</span>
                      </td>
                      <td>
                        <span className="info-label">Sex:</span><br />
                        <span className="info-value">{studentDetails.sex}</span>
                      </td>
                      <td>
                        <span className="info-label">Class:</span><br />
                        <span className="info-value">{studentDetails.class}</span>
                      </td>
                      <td>
                        <span className="info-label">Stream:</span><br />
                        <span className="info-value">{studentDetails.stream ?? ''}</span>
                      </td>
                    </tr>
                    <tr>
                      <td>
                        <span className="info-label">Student No.</span><br />
                        <span className="info-value" style={{ fontSize: 12 }}>{studentDetails.studentNo}</span>
                      </td>
                      <td colSpan={3}>
                        <span className="info-label">Term:</span><br />
                        <span className="info-value" style={{ fontSize: 12 }}>{studentDetails.term}</span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── PRINCIPAL SUBJECTS RIBBON ── */}
        <SectionRibbon label="Principal Subjects Comprising the General Assessment" />

        {/* ── PRINCIPAL SUBJECTS TABLE ── */}
        <table className="results-table">
          <thead>
            <tr>
              <th>Subject</th>
              <th>EOT</th>
              <th>Total</th>
              <th style={{ color: 'red' }}>Grade</th>
              <th>Comment</th>
              <th>Initials</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Marks contribute:</td>
              <td>100</td>
              <td>100</td>
              <td></td><td></td><td></td>
            </tr>
            {principalSubjects.map((row, i) => (
              <SubjectRow key={i} row={row} />
            ))}
            <tr style={{ fontWeight: 'bold', background: '#f9f9f9' }}>
              <td style={{ textAlign: 'left' }}>TOTAL MARKS:</td>
              <td colSpan={2}>{totalMarks ?? ''}</td>
              <td colSpan={2} style={{ textAlign: 'right' }}>AVERAGE MARKS:</td>
              <td>{averageMarks ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ── OTHER SUBJECTS RIBBON ── */}
        <SectionRibbon label="Other subjects (Not part of Assessment)" />

        {/* ── OTHER SUBJECTS TABLE ── */}
        <table className="results-table">
          <tbody>
            <tr>
              <td width="25%">Marks contribute:</td>
              <td width="10%">100</td>
              <td></td><td></td><td></td><td></td>
            </tr>
            {otherSubjects.map((row, i) => (
              <SubjectRow key={i} row={row} />
            ))}
          </tbody>
        </table>

        {/* ── POSITION / ASSESSMENT TABLE ── */}
        <table className="results-table" style={{ marginTop: 10 }}>
          <tbody>
            <tr style={{ background: '#f2f2f2', fontWeight: 'bold' }}>
              <td colSpan={2}>Position</td>
              <td colSpan={4}>General Assessment</td>
            </tr>
            <tr>
              <td width="16%">Class</td>
              <td width="16%">Stream</td>
              <td width="33%" colSpan={2}>Aggregates</td>
              <td width="33%" colSpan={2}>Division</td>
            </tr>
            <tr style={{ color: 'red', fontWeight: 'bold' }}>
              <td>{assessment.classPosition}</td>
              <td>{assessment.streamPosition}</td>
              <td colSpan={2}>{assessment.aggregates ?? ''}</td>
              <td colSpan={2}>{assessment.division ?? ''}</td>
            </tr>
          </tbody>
        </table>

        {/* ── REMARKS ── */}
        <div style={{ marginTop: 20 }}>
          <div className="remark-row">
            <RemarkLabel label="Class teacher comment:" />
            <span className="remark-text">{comments.classTeacher ?? ''}</span>
          </div>
          <div className="remark-row">
            <RemarkLabel label="DOS Comment:" />
            <span className="remark-text">{comments.dos ?? ''}</span>
          </div>
          <div className="remark-row">
            <RemarkLabel label="Headteacher comment:" />
            <span className="remark-text">{comments.headTeacher ?? ''}</span>
          </div>
        </div>

        {/* ── NEXT TERM DATE ── */}
        {nextTermDate && (
          <>
            <p style={{ margin: '10px 0' }}>{nextTermDate}</p>
            <p style={{ fontSize: 11, margin: 0 }}>Next Term Begins</p>
          </>
        )}

        {/* ── GRADE SCALE ── */}
        <table className="grade-scale">
          <tbody>
            <tr className="grade-header">
              <td>GRADE</td>
              {gradingScale.map(g => <td key={g.grade}>{g.grade}</td>)}
            </tr>
            <tr>
              <td>SCORE RANGE</td>
              {gradingScale.map(g => <td key={g.grade}>{g.range}</td>)}
            </tr>
          </tbody>
        </table>

      </div>
    </>
  );
}
