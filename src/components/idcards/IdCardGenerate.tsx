'use client';
/**
 * Generate + print cards from (a) enrolled learners or (b) an uploaded Excel file.
 * The Excel path is fully isolated: the workbook sits in a private, expiring job;
 * records live only in this page's memory; nothing is written to student tables,
 * and no attendance or SMS behaviour is touched.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { IdCardSheets, PrintPortal } from './IdCardSheets';
import { IdCardFace } from './IdCardFace';
import { CARD_FIELDS } from '@/lib/idcards/fields';
import { SHEET_PRESETS, type PrintMode, type SheetSpec } from '@/lib/idcards/layout';
import type { CardRecord, IdCardSpec } from '@/lib/idcards/spec';

interface SheetInfo { name: string; hidden: boolean; rowCount: number; headerRow: number; headers: string[]; sample: string[][]; }
interface Issue { row: number; field: string; severity: 'error' | 'warning'; message: string; }
interface ExRow { row: number; record: CardRecord; status: 'ok' | 'warning' | 'error'; }

interface Props {
  spec: IdCardSpec;
  schoolName: string;
  logoUrl?: string;
  onExcelHeaders?: (headers: string[]) => void;
}

const fmtDate = (v?: string) => {
  if (!v) return '';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

export function IdCardGenerate({ spec, schoolName, logoUrl, onExcelHeaders }: Props) {
  const [source, setSource] = useState<'learners' | 'excel'>('learners');

  // ── printing options ──
  const [preset, setPreset] = useState('A4 portrait');
  const [margin, setMargin] = useState(10);
  const [gap, setGap] = useState(4);
  const [mode, setMode] = useState<PrintMode>(spec.back ? 'duplex_long' : 'front_only');
  const [cutMarks, setCutMarks] = useState(true);
  const [printTick, setPrintTick] = useState(0);
  useEffect(() => { setMode((m) => (spec.back ? (m === 'front_only' ? 'duplex_long' : m) : 'front_only')); }, [!!spec.back]);
  const sheet: SheetSpec = { ...SHEET_PRESETS[preset], marginMm: margin, gapMm: gap };

  // ── learners source ──
  const [learners, setLearners] = useState<CardRecord[]>([]);
  const [learnerIds, setLearnerIds] = useState<number[]>([]);
  const [learnersLoading, setLearnersLoading] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (source !== 'learners' || learners.length) return;
    setLearnersLoading(true);
    (async () => {
      try {
        const json = await (await fetch('/api/students/enrolled?status=active')).json();
        const rows = ((json.students || json.data || json.enrolled || []) as any[]);
        setLearnerIds(rows.map((s) => s.id));
        setLearners(rows.map((s) => ({
          full_name: [s.first_name, s.other_name, s.last_name].filter(Boolean).join(' '),
          first_name: s.first_name || '', last_name: s.last_name || '',
          admission_no: s.admission_no || '',
          class: [s.class_name, s.stream_name].filter(Boolean).join(' '),
          gender: s.gender || '', dob: fmtDate(s.date_of_birth), photo_url: s.photo_url || '',
          school: schoolName, academic_year: '', valid_until: '', guardian_phone: '',
        })));
      } catch { /* shown as empty */ }
      setLearnersLoading(false);
    })();
  }, [source, learners.length, schoolName]);

  const filtered = useMemo(() => learners.map((r, i) => ({ r, i })).filter(({ r }) =>
    !search.trim() || `${r.full_name} ${r.admission_no}`.toLowerCase().includes(search.toLowerCase())), [learners, search]);

  // ── excel source ──
  const [jobId, setJobId] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetInfo[]>([]);
  const [suggested, setSuggested] = useState<Record<string, Record<string, string>>>({});
  const [sheetName, setSheetName] = useState('');
  const [headerRow, setHeaderRow] = useState(1);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [exRows, setExRows] = useState<ExRow[]>([]);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState<{ total: number; ok: number; warnings: number; errors: number } | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [includeErrors, setIncludeErrors] = useState(false);
  const [expiresAt, setExpiresAt] = useState('');

  const currentSheet = sheets.find((s) => s.name === sheetName);
  useEffect(() => { if (currentSheet) onExcelHeaders?.(currentSheet.headers.map((h) => `col:${h}`)); }, [currentSheet, onExcelHeaders]);

  const chooseSheet = (name: string, sh: SheetInfo[] = sheets, sg = suggested) => {
    setSheetName(name);
    const info = sh.find((s) => s.name === name);
    setHeaderRow(info?.headerRow ?? 1);
    setMapping(sg[name] ?? {});
    setExRows([]); setIssues([]); setSummary(null);
  };

  const upload = async (file: File) => {
    setBusy(true); setErr('');
    try {
      const fd = new FormData(); fd.append('file', file);
      const res = await fetch('/api/id-cards/jobs', { method: 'POST', body: fd });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Upload failed'); return; }
      const sg: Record<string, Record<string, string>> = {};
      (json.suggested as any[]).forEach((s) => { sg[s.sheet] = s.mapping; });
      setJobId(json.jobId); setFileName(json.fileName); setSheets(json.sheets); setSuggested(sg); setExpiresAt(json.expiresAt);
      const best = [...(json.sheets as SheetInfo[])].filter((s) => !s.hidden).sort((a, b) => b.rowCount - a.rowCount)[0] ?? json.sheets[0];
      chooseSheet(best.name, json.sheets, sg);
    } catch { setErr('Upload failed'); }
    finally { setBusy(false); }
  };

  const applyMapping = async () => {
    if (!jobId) return;
    setBusy(true); setErr('');
    try {
      const res = await fetch(`/api/id-cards/jobs/${jobId}/extract`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetName, headerRow, mapping }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || 'Could not read the sheet'); return; }
      setExRows(json.rows); setIssues(json.issues); setSummary(json.summary); setTruncated(!!json.truncated);
    } catch { setErr('Could not read the sheet'); }
    finally { setBusy(false); }
  };

  const discardJob = async () => {
    if (!jobId) return;
    await fetch(`/api/id-cards/jobs/${jobId}`, { method: 'DELETE' }).catch(() => undefined);
    setJobId(null); setSheets([]); setExRows([]); setIssues([]); setSummary(null); setFileName(''); setMapping({});
  };

  // ── records to render ──
  const records: CardRecord[] = useMemo(() => {
    if (source === 'excel') return exRows.filter((r) => includeErrors || r.status !== 'error').map((r) => r.record);
    const ids = selected.size ? [...selected] : filtered.map(({ i }) => i);
    return ids.map((i) => learners[i]).filter(Boolean);
  }, [source, exRows, includeErrors, selected, filtered, learners]);

  const excluded = source === 'excel' && summary ? (includeErrors ? 0 : summary.errors) : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <PrintPortal trigger={printTick} spec={spec} records={records} logoUrl={logoUrl} sheet={sheet} mode={mode} cutMarks={cutMarks} />
      <div style={{ display: 'flex', gap: 8 }}>
        <button style={tab(source === 'learners')} onClick={() => setSource('learners')}>Enrolled learners</button>
        <button style={tab(source === 'excel')} onClick={() => setSource('excel')}>Excel file</button>
      </div>

      {source === 'learners' && (
        <section style={card}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
            <input placeholder="Search name or reg. no" value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...input, width: 240 }} />
            <button style={btn} onClick={() => setSelected(new Set(filtered.map(({ i }) => i)))}>Select all shown</button>
            <button style={btn} onClick={() => setSelected(new Set())}>Clear</button>
            <span style={{ color: '#64748b', fontSize: 12 }}>{selected.size ? `${selected.size} selected` : `nothing selected — all ${filtered.length} shown will print`}</span>
          </div>
          {learnersLoading && <p>Loading learners…</p>}
          <div style={{ maxHeight: 220, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            {filtered.slice(0, 500).map(({ r, i }) => (
              <label key={learnerIds[i] ?? i} style={{ display: 'flex', gap: 8, padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
                <input type="checkbox" checked={selected.has(i)} onChange={() => setSelected((p) => { const n = new Set(p); n.has(i) ? n.delete(i) : n.add(i); return n; })} />
                <span style={{ flex: 1 }}>{r.full_name}</span><span style={{ color: '#64748b' }}>{r.admission_no}</span><span style={{ color: '#64748b' }}>{r.class}</span>
              </label>
            ))}
          </div>
        </section>
      )}

      {source === 'excel' && (
        <section style={card}>
          <div style={{ padding: 8, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: 12, marginBottom: 10, color: '#14532d' }}>
            Cards made from a spreadsheet are for printing only. No learner records are created or changed, and no attendance or SMS activity is triggered. Your file is stored privately, visible only to you, and deleted automatically after 24 hours (or immediately when you discard it).
          </div>

          {!jobId && (
            <>
              <input type="file" accept=".xlsx,.xls" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              <p style={{ fontSize: 12, color: '#64748b' }}>.xlsx or .xls, up to 4 MB, up to 2000 rows. Photos can be supplied as https links in a column; images embedded inside the workbook are not read.</p>
            </>
          )}
          {err && <p style={{ color: '#b91c1c', fontSize: 13 }}>{err}</p>}

          {jobId && (
            <>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
                <strong style={{ fontSize: 13 }}>{fileName}</strong>
                <span style={{ fontSize: 12, color: '#64748b' }}>expires {new Date(expiresAt).toLocaleString()}</span>
                <button style={{ ...btn, color: '#b91c1c' }} onClick={discardJob}>Delete file now</button>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                <label style={{ fontSize: 13 }}>Worksheet{' '}
                  <select style={input} value={sheetName} onChange={(e) => chooseSheet(e.target.value)}>
                    {sheets.map((s) => <option key={s.name} value={s.name}>{s.name} ({s.rowCount} rows){s.hidden ? ' — hidden' : ''}</option>)}
                  </select>
                </label>
                <label style={{ fontSize: 13 }}>Header row{' '}
                  <input type="number" min={1} max={50} style={{ ...input, width: 60 }} value={headerRow} onChange={(e) => setHeaderRow(Math.max(1, Number(e.target.value) || 1))} />
                </label>
              </div>

              {currentSheet && currentSheet.headers.length > 0 && (
                <div style={{ overflowX: 'auto', marginBottom: 10 }}>
                  <table style={{ borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead><tr>{currentSheet.headers.map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>{currentSheet.sample.slice(0, 3).map((r, i) => <tr key={i}>{currentSheet.headers.map((_, c) => <td key={c} style={td}>{r[c]}</td>)}</tr>)}</tbody>
                  </table>
                  <p style={{ fontSize: 11, color: '#64748b' }}>Sample rows use the suggested header row; press "Read rows" after changing it.</p>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(230px,1fr))', gap: 8, marginBottom: 10 }}>
                {CARD_FIELDS.map((f) => (
                  <label key={f.key} style={{ fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    {f.label}{f.key === 'full_name' && <span style={{ color: '#b91c1c' }}> (required, or map first + last)</span>}
                    <select style={input} value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value) n[f.key] = e.target.value; else delete n[f.key]; return n; })}>
                      <option value="">— not mapped —</option>
                      {(currentSheet?.headers ?? []).map((h) => <option key={h} value={h}>{h}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <p style={{ fontSize: 11, color: '#64748b' }}>Any other column can be used in the design as {'{col:Column Name}'}.</p>
              <button style={primary} disabled={busy} onClick={applyMapping}>{busy ? 'Reading…' : 'Read rows & validate'}</button>

              {summary && (
                <div style={{ marginTop: 12 }}>
                  <p style={{ fontSize: 13 }}>
                    <strong>{summary.total}</strong> rows read — <span style={{ color: '#15803d' }}>{summary.ok} ready</span>,{' '}
                    <span style={{ color: '#b45309' }}>{summary.warnings} with warnings</span>,{' '}
                    <span style={{ color: '#b91c1c' }}>{summary.errors} with errors</span>.
                    {truncated && <span style={{ color: '#b91c1c' }}> The sheet has more than 2000 rows; only the first 2000 were read.</span>}
                  </p>
                  {summary.errors > 0 && (
                    <label style={{ fontSize: 12 }}>
                      <input type="checkbox" checked={includeErrors} onChange={(e) => setIncludeErrors(e.target.checked)} /> Print rows with errors too ({excluded ? `${excluded} currently left out` : 'included'})
                    </label>
                  )}
                  {issues.length > 0 && (
                    <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 6 }}>
                      <table style={{ borderCollapse: 'collapse', fontSize: 12, width: '100%' }}>
                        <thead><tr><th style={th}>Row</th><th style={th}>Field</th><th style={th}>Level</th><th style={th}>Problem</th></tr></thead>
                        <tbody>{issues.slice(0, 300).map((i, k) => (
                          <tr key={k}><td style={td}>{i.row}</td><td style={td}>{i.field}</td>
                            <td style={{ ...td, color: i.severity === 'error' ? '#b91c1c' : '#b45309' }}>{i.severity}</td><td style={td}>{i.message}</td></tr>
                        ))}</tbody>
                      </table>
                      {issues.length > 300 && <p style={{ fontSize: 11, padding: 6 }}>Showing the first 300 of {issues.length} issues.</p>}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section style={card}>
        <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Print layout</h3>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
          <label>Sheet <select style={input} value={preset} onChange={(e) => setPreset(e.target.value)}>{Object.keys(SHEET_PRESETS).map((k) => <option key={k}>{k}</option>)}</select></label>
          <label>Margin mm <input type="number" style={{ ...input, width: 60 }} min={0} max={30} value={margin} onChange={(e) => setMargin(Math.max(0, Number(e.target.value) || 0))} /></label>
          <label>Gap mm <input type="number" style={{ ...input, width: 60 }} min={0} max={20} value={gap} onChange={(e) => setGap(Math.max(0, Number(e.target.value) || 0))} /></label>
          <label>Mode{' '}
            <select style={input} value={mode} disabled={!spec.back} onChange={(e) => setMode(e.target.value as PrintMode)}>
              {!spec.back && <option value="front_only">Single-sided</option>}
              {spec.back && <option value="duplex_long">Duplex — flip on long edge</option>}
              {spec.back && <option value="duplex_short">Duplex — flip on short edge</option>}
              {spec.back && <option value="fold_pair">Back + front side by side (fold)</option>}
              {spec.back && <option value="front_only">Fronts only</option>}
            </select>
          </label>
          <label><input type="checkbox" checked={cutMarks} onChange={(e) => setCutMarks(e.target.checked)} /> Cut guides</label>
        </div>
        {spec.back && mode.startsWith('duplex') && (
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 8 }}>
            Print double-sided on your printer with "flip on {mode === 'duplex_long' ? 'long' : 'short'} edge", or print pages one by one — the back pages are already mirrored so each back lines up behind its front. Do a one-sheet test on plain paper first; printer feed offsets vary.
          </p>
        )}
        <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center' }}>
          <button style={primary} disabled={!records.length} onClick={() => setPrintTick((n) => n + 1)}>Print / Save as PDF ({records.length} card{records.length === 1 ? '' : 's'})</button>
          {excluded > 0 && <span style={{ fontSize: 12, color: '#b45309' }}>{excluded} row(s) with errors are not included.</span>}
        </div>
      </section>

      {records.length > 0 ? (
        <section style={card}>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Card preview</h3>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
            {records.slice(0, 3).map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 6 }}>
                <IdCardFace spec={spec} face="front" record={r} logoUrl={logoUrl} unit={3.4} />
                {spec.back && <IdCardFace spec={spec} face="back" record={r} logoUrl={logoUrl} unit={3.4} />}
              </div>
            ))}
          </div>
          <h3 style={{ margin: '0 0 8px', fontSize: 14 }}>Sheet preview</h3>
          <IdCardSheets spec={spec} records={records} logoUrl={logoUrl} sheet={sheet} mode={mode} cutMarks={cutMarks} previewScale={0.45} />
        </section>
      ) : (
        <p style={{ color: '#64748b', fontSize: 13 }}>{source === 'excel' ? 'Upload a file, map the columns and press "Read rows" to preview cards.' : 'No learners to print yet.'}</p>
      )}
    </div>
  );
}

const input: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', background: '#fff', color: '#111', fontSize: 13 };
const btn: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontSize: 12 };
const primary: React.CSSProperties = { ...btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8', padding: '6px 14px', fontSize: 13 };
const tab = (on: boolean): React.CSSProperties => ({ ...btn, background: on ? '#1d4ed8' : '#fff', color: on ? '#fff' : '#0f172a', borderColor: on ? '#1d4ed8' : '#cbd5e1' });
const card: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, background: '#fff', color: '#0f172a' };
const th: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '3px 8px', background: '#f8fafc', textAlign: 'left', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { border: '1px solid #e2e8f0', padding: '3px 8px', whiteSpace: 'nowrap', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis' };
