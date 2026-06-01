/**
 * /verify/[token]
 *
 * Public QR-landing page. Renders a verification result for any
 * HMAC-signed token printed on a DRAIS report card. No session
 * required — the token IS the proof of access.
 *
 * Anatomy:
 *   - Big green ✓ "Authentic report card" on success
 *   - Big red ✗ "Not recognised" on failure
 *   - Sanitised metadata: school, term, year, learner (if scoped to
 *     one), snapshot type, generation timestamp
 *   - No marks, no comments, no fees — just enough to prove authenticity
 */
'use client';

import { use, useEffect, useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Calendar, GraduationCap, User } from 'lucide-react';

interface PageProps {
  params: Promise<{ token: string }>;
}

interface VerifyResult {
  verified:    boolean;
  school?:     string | null;
  term?:       string | null;
  year?:       string | null;
  type?:       string;
  learner?:    { name: string; class: string; stream: string | null; admissionNo: string };
  generatedAt?: string;
  error?:      string;
}

export default function VerifyTokenPage({ params }: PageProps) {
  const { token } = use(params);
  const [result, setResult] = useState<VerifyResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/verify/${encodeURIComponent(token)}`)
      .then(r => r.json())
      .then((j: VerifyResult) => { if (!cancelled) setResult(j); })
      .catch(() => { if (!cancelled) setResult({ verified: false, error: 'Network error' }); });
    return () => { cancelled = true; };
  }, [token]);

  if (!result) {
    return (
      <div style={style.frame}>
        <div style={style.card}>
          <div style={style.spinnerRow}>
            <Loader2 className="animate-spin" />
            <span>Verifying…</span>
          </div>
        </div>
      </div>
    );
  }

  if (!result.verified) {
    return (
      <div style={style.frame}>
        <div style={{ ...style.card, borderColor: '#fecaca' }}>
          <div style={{ ...style.iconWrap, background: '#fef2f2', color: '#b91c1c' }}>
            <XCircle size={48} />
          </div>
          <h1 style={style.titleFail}>Not a recognised report</h1>
          <p style={style.body}>
            This link doesn&apos;t correspond to an authentic DRAIS report card. The
            token may be malformed, the report may have been recalled, or the
            QR may have been transcribed incorrectly.
          </p>
          <p style={style.small}>{result.error}</p>
        </div>
      </div>
    );
  }

  return (
    <div style={style.frame}>
      <div style={{ ...style.card, borderColor: '#bbf7d0' }}>
        <div style={{ ...style.iconWrap, background: '#f0fdf4', color: '#15803d' }}>
          <CheckCircle2 size={48} />
        </div>
        <h1 style={style.titleOk}>Authentic report card</h1>
        <p style={style.body}>
          This QR code was issued by DRAIS for the report below. The link
          contains a cryptographic signature that proves the document is
          genuine and has not been forged.
        </p>

        <div style={style.detailsBox}>
          {result.school && (
            <Row icon={<GraduationCap size={14} />} label="School" value={result.school} />
          )}
          {result.learner && (
            <>
              <Row icon={<User size={14} />} label="Learner" value={result.learner.name} />
              <Row label="Class" value={`${result.learner.class}${result.learner.stream ? ` · ${result.learner.stream}` : ''}`} />
              <Row label="Admission #" value={result.learner.admissionNo} mono />
            </>
          )}
          <Row icon={<Calendar size={14} />} label="Term · Year" value={[result.term, result.year].filter(Boolean).join(' · ') || '—'} />
          {result.type && <Row label="Type" value={result.type} capitalised />}
          {result.generatedAt && (
            <Row label="Generated" value={new Date(result.generatedAt).toLocaleString()} />
          )}
        </div>

        <p style={style.footer}>
          To request the original PDF, contact the school. DRAIS does not
          publish the marks on this public page — only proof of authenticity.
        </p>
      </div>
    </div>
  );
}

function Row({
  icon, label, value, mono, capitalised,
}: { icon?: React.ReactNode; label: string; value: string; mono?: boolean; capitalised?: boolean }) {
  return (
    <div style={style.row}>
      <div style={style.rowLabel}>
        {icon}
        <span>{label}</span>
      </div>
      <div style={{
        ...style.rowValue,
        ...(mono        ? { fontFamily: 'ui-monospace, SFMono-Regular, monospace' } : {}),
        ...(capitalised ? { textTransform: 'capitalize' as const }                  : {}),
      }}>
        {value}
      </div>
    </div>
  );
}

const style = {
  frame: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px',
    background: '#f8fafc',
    fontFamily: 'system-ui, -apple-system, sans-serif',
  } as React.CSSProperties,
  card: {
    width: '100%',
    maxWidth: 480,
    background: '#fff',
    border: '2px solid #e5e7eb',
    borderRadius: 16,
    padding: '24px 20px',
    boxShadow: '0 4px 24px rgba(0,0,0,0.06)',
  } as React.CSSProperties,
  iconWrap: {
    width: 80,
    height: 80,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 12px auto',
  } as React.CSSProperties,
  titleOk: {
    fontSize: 20,
    fontWeight: 700,
    color: '#15803d',
    textAlign: 'center',
    margin: '0 0 12px',
  } as React.CSSProperties,
  titleFail: {
    fontSize: 20,
    fontWeight: 700,
    color: '#b91c1c',
    textAlign: 'center',
    margin: '0 0 12px',
  } as React.CSSProperties,
  body: {
    fontSize: 13,
    color: '#475569',
    textAlign: 'center',
    margin: '0 0 16px',
    lineHeight: 1.5,
  } as React.CSSProperties,
  small: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    margin: 0,
  } as React.CSSProperties,
  detailsBox: {
    background: '#f8fafc',
    border: '1px solid #e5e7eb',
    borderRadius: 10,
    padding: '8px 12px',
    margin: '8px 0',
  } as React.CSSProperties,
  row: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '6px 0',
    borderBottom: '1px dashed #e5e7eb',
    gap: 12,
  } as React.CSSProperties,
  rowLabel: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  } as React.CSSProperties,
  rowValue: {
    fontSize: 13,
    color: '#0f172a',
    fontWeight: 600,
    textAlign: 'right' as const,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  } as React.CSSProperties,
  footer: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginTop: 12,
    lineHeight: 1.5,
  } as React.CSSProperties,
  spinnerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    color: '#94a3b8',
    justifyContent: 'center',
    padding: '24px 0',
  } as React.CSSProperties,
};
