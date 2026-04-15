'use client';

// =============================================================================
// /rpt — Standalone pixel-accurate clone of backup/rpt.html
//
// Every CSS rule, table, SVG, polygon point, colour, and layout decision is
// transplanted from the original HTML verbatim. Nothing is abstracted away.
// Accessible at /rpt with no sidebar, no navbar, no app shell.
// =============================================================================

export default function RptPage() {
  return (
    <>
      <style>{`
        body { font-family: Arial, sans-serif; font-size: 12px; margin: 0; padding: 20px; color: #333; }
        .report-container { width: 800px; margin: auto; border: 1px solid #ccc; padding: 10px; }

        /* Header */
        .header-table { width: 100%; border-collapse: collapse; margin-bottom: 5px; }
        .school-name { font-size: 24px; color: #000080; font-weight: bold; margin: 0; }
        .school-info { font-size: 13px; font-weight: bold; font-style: italic; margin: 2px 0; }

        /* Banner */
        .blue-banner { background: #0000FF; color: white; text-align: center; padding: 5px; font-weight: bold; letter-spacing: 2px; margin: 5px 0; }

        /* Student Info Section */
        .student-info-table { width: 100%; border-collapse: collapse; border: 1px dashed #999; margin-bottom: 10px; }
        .student-photo { width: 90px; height: 100px; border: 1px solid #000; object-fit: cover; }
        .info-label { color: #555; font-size: 11px; }
        .info-value { color: #B22222; font-weight: bold; font-size: 14px; text-transform: uppercase; }

        /* Tables */
        .results-table { width: 100%; border-collapse: collapse; margin-top: -1px; }
        .results-table th, .results-table td { border: 1px solid #333; padding: 4px; text-align: center; }
        .results-table th { background: #f2f2f2; text-transform: uppercase; font-size: 11px; }
        .comment-cell { text-align: left !important; font-style: italic; color: #0000FF; font-size: 11px; width: 40%; }
        .initials { color: #0000FF; font-weight: bold; }

        /* Remarks Section Labels */
        .remark-row { display: flex; align-items: center; margin-bottom: 8px; border-bottom: 1px dashed #ccc; padding-bottom: 4px; }
        .remark-text { margin-left: 10px; font-style: italic; color: #0000FF; font-size: 13px; }

        /* Grade Scale Footer */
        .grade-scale { width: 100%; border-collapse: collapse; margin-top: 15px; }
        .grade-scale td { border: 1px solid #000; text-align: center; padding: 3px; font-size: 10px; }
        .grade-header { background: #f2f2f2; font-weight: bold; }

        @media print {
          @page { size: A4 portrait; margin: 8mm; }
          body { background: white !important; margin: 0; padding: 0; }
          .report-container { width: 100%; border: none; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>

      {/* Print button — hidden on print */}
      <div className="no-print" style={{ width: 800, margin: '0 auto 10px', display: 'flex', gap: 8 }}>
        <button
          onClick={() => window.print()}
          style={{ padding: '6px 16px', background: '#0000FF', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
        >
          Print
        </button>
      </div>

      <div className="report-container">

        {/* ── HEADER ── */}
        <table className="header-table">
          <tbody>
            <tr>
              <td width="80%">
                <h1 className="school-name">NORTHGATE SCHOOL</h1>
                <p className="school-info">P.O.Box 47 IGANGA, Tel: 0706416264,<br />Bulubandi Central B</p>
                <p style={{ fontStyle: 'italic', fontWeight: 'bold', fontSize: 12 }}>IMPACT THROUGH EDUCATION</p>
              </td>
              <td width="20%" align="right">
                <img src="/uploads/logo.png" alt="Logo" style={{ width: 80 }} />
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── BLUE BANNER ── */}
        <div className="blue-banner">MID TERM ONE REPORT</div>

        {/* ── STUDENT INFO ── */}
        <table className="student-info-table">
          <tbody>
            <tr>
              {/* Barcode */}
              <td width={45} align="center" style={{ borderRight: '1px dashed #999', padding: '4px 2px' }}>
                <img
                  src="https://bwipjs-api.metafloor.com/?bcid=code128&text=0018000034&includetext&rotate=L&scale=1&height=18"
                  alt="Barcode"
                  style={{ height: 90, width: 32, display: 'block', margin: 'auto' }}
                />
              </td>
              {/* Photo */}
              <td width={110} align="center">
                <img src="/uploads/photo.jpg" className="student-photo" alt="Student" />
              </td>
              {/* Details */}
              <td>
                <table width="100%" cellPadding={5}>
                  <tbody>
                    <tr>
                      <td><span className="info-label">Name:</span><br /><span className="info-value">KWAGALA JEMIMAH</span></td>
                      <td><span className="info-label">Sex:</span><br /><span className="info-value">F</span></td>
                      <td><span className="info-label">Class:</span><br /><span className="info-value">P.1</span></td>
                      <td><span className="info-label">Stream:</span><br /><span className="info-value">A</span></td>
                    </tr>
                    <tr>
                      <td><span className="info-label">Student No.</span><br /><span className="info-value" style={{ fontSize: 12 }}>0018000034</span></td>
                      <td colSpan={3}><span className="info-label">Term:</span><br /><span className="info-value" style={{ fontSize: 12 }}>TermI-2023</span></td>
                    </tr>
                  </tbody>
                </table>
              </td>
            </tr>
          </tbody>
        </table>

        {/* ── PRINCIPAL SUBJECTS RIBBON ── */}
        <div style={{ textAlign: 'center', margin: '10px 0' }}>
          <svg width="600" height="50" viewBox="0 0 600 50">
            <polygon points="0,5 600,5 600,30 315,30 300,45 285,30 0,30" fill="#999" />
            <text x="300" y="22" fontFamily="Arial" fontSize="12" fill="black" textAnchor="middle" fontWeight="bold">
              Principal Subjects Comprising the General Assessment
            </text>
          </svg>
        </div>

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
            <tr><td>Marks contribute:</td><td>100</td><td>100</td><td></td><td></td><td></td></tr>
            <tr><td>Mathematics</td><td>82</td><td>82</td><td style={{ color: 'red' }}>D2</td><td className="comment-cell">Promising results. Keep it up.</td><td className="initials">BJM</td></tr>
            <tr><td>English</td><td>90</td><td>90</td><td style={{ color: 'red' }}>D1</td><td className="comment-cell">I believe you can do more than this.</td><td className="initials">AC</td></tr>
            <tr><td>RE</td><td>94</td><td>94</td><td style={{ color: 'red' }}>D1</td><td className="comment-cell">Thank you, but keep it up.</td><td className="initials">AT</td></tr>
            <tr><td>Literacy-1</td><td>98</td><td>98</td><td style={{ color: 'red' }}>D1</td><td className="comment-cell">I believe you can do more than this.</td><td className="initials">NH</td></tr>
            <tr style={{ fontWeight: 'bold', background: '#f9f9f9' }}>
              <td align="left">TOTAL MARKS:</td><td colSpan={2}>364</td>
              <td colSpan={2} align="right">AVERAGE MARKS:</td><td>91</td>
            </tr>
          </tbody>
        </table>

        {/* ── OTHER SUBJECTS RIBBON ── */}
        <div style={{ textAlign: 'center', margin: '10px 0' }}>
          <svg width="600" height="50" viewBox="0 0 600 50">
            <polygon points="0,5 600,5 600,30 315,30 300,45 285,30 0,30" fill="#999" />
            <text x="300" y="22" fontFamily="Arial" fontSize="12" fill="black" textAnchor="middle" fontWeight="bold">
              Other subjects (Not part of Assessment)
            </text>
          </svg>
        </div>

        {/* ── OTHER SUBJECTS TABLE ── */}
        <table className="results-table">
          <tbody>
            <tr><td width="25%">Marks contribute:</td><td width="10%">100</td><td></td><td></td><td></td><td></td></tr>
            <tr><td>Reading</td><td>-</td><td></td><td></td><td></td><td></td></tr>
            <tr><td>Literacy-2</td><td>84</td><td>84</td><td style={{ color: 'red' }}>D2</td><td className="comment-cell">Please don&apos;t feel so comfortable.</td><td className="initials">NH</td></tr>
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
              <td>4 / 36</td><td>4 / 36</td><td colSpan={2}>5</td><td colSpan={2}>1</td>
            </tr>
          </tbody>
        </table>

        {/* ── REMARKS ── */}
        <div style={{ marginTop: 20 }}>
          <div className="remark-row">
            <svg width="150" height="25">
              <polygon points="0,0 130,0 150,12.5 130,25 0,25" fill="#ddd" />
              <text x="10" y="17" fontSize="11" fontWeight="bold">Class teacher comment:</text>
            </svg>
            <span className="remark-text">Excellent work, keep it up</span>
          </div>
          <div className="remark-row">
            <svg width="150" height="25">
              <polygon points="0,0 130,0 150,12.5 130,25 0,25" fill="#ddd" />
              <text x="10" y="17" fontSize="11" fontWeight="bold">DOS Comment:</text>
            </svg>
            <span className="remark-text">Thank you for this effort, keep it up.</span>
          </div>
          <div className="remark-row">
            <svg width="150" height="25">
              <polygon points="0,0 130,0 150,12.5 130,25 0,25" fill="#ddd" />
              <text x="10" y="17" fontSize="11" fontWeight="bold">Headteacher comment:</text>
            </svg>
            <span className="remark-text">Promising scores keep up.</span>
          </div>
        </div>

        {/* ── NEXT TERM DATE ── */}
        <p style={{ margin: '10px 0' }}>...... 22-May-2023 ......</p>
        <p style={{ fontSize: 11, margin: 0 }}>Next Term Begins</p>

        {/* ── GRADE SCALE ── */}
        <table className="grade-scale">
          <tbody>
            <tr className="grade-header">
              <td>GRADE</td><td>D1</td><td>D2</td><td>C3</td><td>C4</td><td>C5</td><td>C6</td><td>P7</td><td>P8</td><td>F9</td>
            </tr>
            <tr>
              <td>SCORE RANGE</td><td>90-100</td><td>80-89</td><td>70-79</td><td>60-69</td><td>55-59</td><td>50-54</td><td>45-49</td><td>40-44</td><td>0-39</td>
            </tr>
          </tbody>
        </table>

      </div>
    </>
  );
}
