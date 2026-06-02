/**
 * /print-transcript/[studentId]
 *
 * Phase L5 — naked cumulative-transcript layout. Renders the data
 * returned by /api/students/[id]/transcript as a printable HTML
 * page. Companion to /print-snapshot in style and behaviour:
 *
 *   - no app shell, no sidebar (added /print-transcript to the
 *     noChrome list in layout.tsx)
 *   - includes its own @page CSS so puppeteer + browser-Ctrl+P
 *     produce identical paper output
 *   - drops a [data-print-ready] sentinel when the fetch completes
 *     so the /api/students/[id]/transcript/pdf route can wait on it
 *
 * NOT a DRCE template — the DRCE engine binds against snapshot data
 * (term-bounded), and we want a multi-year cumulative view. The
 * layout here is hand-coded so the binding model doesn't need to be
 * extended for transcripts.
 */
'use client';

import { use, useEffect, useState } from 'react';

interface PageProps { params: Promise<{ studentId: string }>; }

interface TranscriptData {
  student: { id: number; fullName: string; admissionNo: string | null;
    gender: string | null; dateOfBirth: string | null;
    photoUrl: string | null; currentClass: string | null;
    currentStream: string | null; };
  school: {
    name: string | null; legalName: string | null;
    address: string | null; phone: string | null;
    email: string | null; logoUrl: string | null;
    centerNo: string | null; registrationNo: string | null;
  } | null;
  years: Array<{
    yearId: number | null; yearName: string;
    terms: Array<{
      termId: number | null; termName: string;
      subjects: Array<{ subjectId: number; subjectName: string; subjectCode: string | null; score: number | null; grade: string }>;
    }>;
  }>;
  cumulative: Array<{
    subjectId: number; subjectName: string; subjectCode: string | null;
    attempts: number; average: number | null; grade: string;
  }>;
  overall: { mean: number | null; totalResults: number; subjectsTouched: number };
  generatedAt: string;
  error?: string;
}

export default function PrintTranscriptPage({ params }: PageProps) {
  const { studentId } = use(params);
  const [data, setData] = useState<TranscriptData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/students/${encodeURIComponent(studentId)}/transcript`)
      .then(r => r.json())
      .then((j: TranscriptData) => { if (!cancelled) {
        if (j.error) setError(j.error);
        else setData(j);
      }})
      .catch(e => { if (!cancelled) setError(e?.message || 'load failed'); });
    return () => { cancelled = true; };
  }, [studentId]);

  // Sentinel for puppeteer.
  useEffect(() => {
    if (data) {
      const flag = document.createElement('div');
      flag.setAttribute('data-print-ready', '1');
      flag.style.display = 'none';
      document.body.appendChild(flag);
    }
  }, [data]);

  if (error) {
    return (
      <div style={{ padding: 40, fontFamily: 'system-ui', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ color: '#b91c1c' }}>Could not build transcript</h1>
        <pre style={{ background: '#f3f4f6', padding: 16, borderRadius: 8, whiteSpace: 'pre-wrap', fontSize: 12 }}>{error}</pre>
      </div>
    );
  }
  if (!data) {
    return <div style={{ padding: 40, color: '#666' }}>Loading…</div>;
  }

  return (
    <>
      <style>{`
        @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
        @media screen { body { background: #e5e7eb; padding: 24px 0; } .transcript-page { box-shadow: 0 4px 32px rgba(0,0,0,0.12); margin: 0 auto; } }
        * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        html, body { margin: 0; padding: 0; background: #fff; font-family: Arial, sans-serif; color: #0f172a; }
        .transcript-page {
          width: 794px; min-height: 1123px; background: #fff;
          padding: 28px 32px;
          border: 2px solid #1d4ed8;
          position: relative;
        }
        .watermark {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 64px; color: #1d4ed8; opacity: 0.05;
          transform: rotate(-28deg); pointer-events: none;
          letter-spacing: 8px; font-weight: 700;
        }
        .body { position: relative; z-index: 1; }
        .school-header { text-align: center; padding-bottom: 12px; border-bottom: 2px solid #1d4ed8; }
        .school-header .logo { width: 70px; height: 70px; object-fit: contain; margin-bottom: 4px; }
        .school-header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: 0.04em; color: #0f172a; }
        .school-header .meta { font-size: 11px; color: #475569; margin-top: 2px; }
        .doc-title {
          background: #1d4ed8; color: #fff; padding: 8px 12px;
          text-align: center; letter-spacing: 0.12em; text-transform: uppercase;
          font-weight: 700; font-size: 14px; border-radius: 4px;
          margin: 14px 0 12px;
        }
        .student-grid {
          display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px 18px;
          background: #f1f5f9; padding: 12px 14px; border-radius: 6px;
          font-size: 12px; margin-bottom: 14px;
        }
        .student-grid .label { color: #64748b; text-transform: uppercase; font-size: 9px; font-weight: 700; letter-spacing: 0.05em; }
        .student-grid .value { color: #0f172a; font-weight: 600; margin-top: 1px; }
        .year-block { margin-bottom: 14px; page-break-inside: avoid; }
        .year-title { font-size: 12px; font-weight: 700; color: #0f172a; background: #e0e7ff;
          padding: 4px 8px; border-left: 4px solid #1d4ed8; }
        .term-block { margin-top: 6px; }
        .term-title { font-size: 11px; font-weight: 700; color: #1d4ed8; margin: 4px 2px 2px; }
        table.results { width: 100%; border-collapse: collapse; font-size: 11px; }
        table.results th, table.results td {
          border: 1px solid #cbd5e1; padding: 4px 6px;
        }
        table.results th { background: #1d4ed8; color: #fff; text-transform: uppercase;
          letter-spacing: 0.04em; font-size: 10px; }
        table.results td.num { text-align: center; font-variant-numeric: tabular-nums; }
        table.results td.grade { text-align: center; font-weight: 700; }
        .cumulative-title {
          margin-top: 16px; font-size: 12px; font-weight: 700;
          background: #1d4ed8; color: #fff; padding: 4px 8px; border-radius: 3px;
          text-transform: uppercase; letter-spacing: 0.04em;
        }
        .overall {
          margin-top: 14px; display: flex; gap: 14px;
          padding: 10px 14px; background: #f1f5f9; border-radius: 6px;
          border-left: 4px solid #1d4ed8;
        }
        .overall .label { font-size: 9px; color: #64748b; text-transform: uppercase; font-weight: 700; letter-spacing: 0.05em; }
        .overall .value { font-size: 18px; font-weight: 800; color: #0f172a; }
        .footer {
          margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-end;
          font-size: 10px; color: #475569;
        }
        .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 16px; }
        .sig { text-align: center; }
        .sig .line { border-top: 1px solid #0f172a; margin-bottom: 4px; height: 30px; }
        .sig .role { font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; font-size: 10px; }
        .no-print { }
        @media print { .no-print { display: none !important; } }
        .print-toolbar {
          position: fixed; top: 12px; right: 12px; z-index: 9999;
          background: #fff; border: 1px solid #ccc; padding: 8px 10px;
          border-radius: 6px; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
          font: 12px Arial;
        }
        .print-toolbar button { padding: 6px 12px; background: #1d4ed8; color: #fff;
          border: 0; border-radius: 4px; cursor: pointer; font-weight: 700; }
      `}</style>

      <div className="no-print print-toolbar">
        <button onClick={() => window.print()}>🖨️ Print transcript</button>
      </div>

      <div className="transcript-page">
        <div className="watermark">OFFICIAL TRANSCRIPT</div>
        <div className="body">
          <div className="school-header">
            {data.school?.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img className="logo" src={data.school.logoUrl} alt="" />
            )}
            <h1>{data.school?.legalName || data.school?.name || 'School'}</h1>
            <div className="meta">
              {[data.school?.address, data.school?.phone, data.school?.email].filter(Boolean).join(' · ')}
              {data.school?.centerNo && <> · Centre {data.school.centerNo}</>}
              {data.school?.registrationNo && <> · Reg {data.school.registrationNo}</>}
            </div>
          </div>

          <div className="doc-title">Official Academic Transcript</div>

          <div className="student-grid">
            <div><div className="label">Name</div><div className="value">{data.student.fullName}</div></div>
            <div><div className="label">Admission #</div><div className="value">{data.student.admissionNo ?? '—'}</div></div>
            <div><div className="label">Gender</div><div className="value">{data.student.gender ?? '—'}</div></div>
            <div><div className="label">Date of Birth</div><div className="value">{data.student.dateOfBirth ? new Date(data.student.dateOfBirth).toLocaleDateString() : '—'}</div></div>
            <div><div className="label">Current Class</div><div className="value">{data.student.currentClass ?? '—'}</div></div>
            <div><div className="label">Stream</div><div className="value">{data.student.currentStream ?? '—'}</div></div>
          </div>

          {data.years.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', padding: 40 }}>
              No graded results on record for this learner yet.
            </p>
          ) : data.years.map(y => (
            <div className="year-block" key={`y-${y.yearId ?? y.yearName}`}>
              <div className="year-title">{y.yearName}</div>
              {y.terms.map(t => (
                <div className="term-block" key={`t-${t.termId ?? t.termName}`}>
                  <div className="term-title">{t.termName}</div>
                  <table className="results">
                    <thead>
                      <tr>
                        <th style={{ textAlign: 'left' }}>Subject</th>
                        <th>Code</th>
                        <th>Score</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {t.subjects.map(s => (
                        <tr key={s.subjectId}>
                          <td>{s.subjectName}</td>
                          <td className="num" style={{ fontFamily: 'monospace', fontSize: 10 }}>{s.subjectCode ?? '—'}</td>
                          <td className="num">{s.score == null ? '—' : s.score}</td>
                          <td className="grade">{s.grade}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          ))}

          {data.cumulative.length > 0 && (
            <>
              <div className="cumulative-title">Cumulative subject performance</div>
              <table className="results">
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left' }}>Subject</th>
                    <th>Attempts</th>
                    <th>Average</th>
                    <th>Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cumulative.map(c => (
                    <tr key={c.subjectId}>
                      <td>{c.subjectName}</td>
                      <td className="num">{c.attempts}</td>
                      <td className="num">{c.average ?? '—'}</td>
                      <td className="grade">{c.grade}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="overall">
                <div>
                  <div className="label">Overall mean</div>
                  <div className="value">{data.overall.mean == null ? '—' : `${data.overall.mean}%`}</div>
                </div>
                <div>
                  <div className="label">Subjects</div>
                  <div className="value">{data.overall.subjectsTouched}</div>
                </div>
                <div>
                  <div className="label">Results recorded</div>
                  <div className="value">{data.overall.totalResults}</div>
                </div>
              </div>
            </>
          )}

          <div className="sigs">
            <div className="sig"><div className="line" /><div className="role">Registrar</div></div>
            <div className="sig"><div className="line" /><div className="role">Head of School</div></div>
          </div>

          <div className="footer">
            <div>Generated on {new Date(data.generatedAt).toLocaleString()}</div>
            <div>This is an authenticated DRAIS document.</div>
          </div>
        </div>
      </div>
    </>
  );
}
