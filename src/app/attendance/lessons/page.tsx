'use client';
/**
 * /attendance/lessons — today's lessons and their automatic attendance rosters.
 * The roster is built from enrolment + timetable + biometric punches; teachers only
 * follow up on the exceptions and correct with a recorded reason.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { showToast } from '@/lib/toast';
import { useI18n } from '@/components/i18n/I18nProvider';

type Status = 'present' | 'late' | 'absent' | 'excused' | 'pending';
interface Lesson {
  id: number; lessonDate: string; startMs: number; endMs: number; periodName: string | null; room: string | null;
  className: string | null; streamName: string | null; subjectName: string | null; teacherName: string | null;
  counts: Record<Status, number>;
}
interface Row {
  personId: number; name: string; admissionNo: string | null; status: Status; source: string; firstPunchAt: string | null;
  minutesLate: number; punchCount: number; exception: string | null; reason: string | null; canPunch: boolean;
}
interface Summary { expected: number; present: number; late: number; absent: number; excused: number; pending: number; unaccounted: number; exceptions: number }

const COLORS: Record<Status, { bg: string; fg: string; label: string }> = {
  present: { bg: '#dcfce7', fg: '#166534', label: 'Present' },
  late: { bg: '#fef3c7', fg: '#92400e', label: 'Late' },
  absent: { bg: '#fee2e2', fg: '#991b1b', label: 'Absent' },
  excused: { bg: '#e0e7ff', fg: '#3730a3', label: 'Excused' },
  pending: { bg: '#e5e7eb', fg: '#374151', label: 'Not yet accounted for' },
};
const EXC: Record<string, string> = {
  not_biometrically_enrolled: 'Not on the biometric system — needs manual attendance',
  insufficient_presence_evidence: 'Single check-in only — needs review',
};

const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const todayISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

export default function LessonAttendancePage() {
  const { t, lang, digits, formatDate } = useI18n();
  const tm = (ms: number) => (lang === 'ar' ? formatDate(ms, { hour: '2-digit', minute: '2-digit' }) : fmtTime(ms));
  const [date, setDate] = useState(todayISO());
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [enabled, setEnabled] = useState(true);
  const [scope, setScope] = useState<'mine' | 'all'>('mine');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<number | null>(null);
  const [roster, setRoster] = useState<{ roster: Row[]; summary: Summary; occurrence: any } | null>(null);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'follow'>('follow');
  const [editing, setEditing] = useState<Row | null>(null);
  const [newStatus, setNewStatus] = useState<Status | 'auto'>('present');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const loadLessons = useCallback(async () => {
    setLoading(true);
    try {
      const j = await (await fetch(`/api/attendance/lessons?date=${date}`)).json();
      setEnabled(j.enabled !== false); setLessons(j.lessons ?? []); setScope(j.scope ?? 'mine'); setNote(j.note ?? j.error ?? '');
    } catch { setNote(t('attendancePages.lessons.loadFailed')); }
    setLoading(false);
  }, [date]);
  useEffect(() => { loadLessons(); setOpenId(null); setRoster(null); }, [loadLessons]);

  const openLesson = async (id: number) => {
    setOpenId(id); setRoster(null); setRosterLoading(true);
    try {
      const j = await (await fetch(`/api/attendance/lessons/${id}`)).json();
      if (j.success) setRoster(j); else showToast('error', j.error || t('attendancePages.lessons.openFailed'));
    } catch { showToast('error', t('attendancePages.lessons.openFailed')); }
    setRosterLoading(false);
  };

  const submit = async () => {
    if (!editing || !openId) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/attendance/lessons/${openId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ personId: editing.personId, status: newStatus, reason }),
      });
      const j = await r.json();
      if (!r.ok) { showToast('error', j.error || t('attendancePages.lessons.saveFailed')); return; }
      showToast('success', t('attendancePages.lessons.updated')); setEditing(null); setReason('');
      await openLesson(openId); loadLessons();
    } catch { showToast('error', t('attendancePages.lessons.saveFailed')); }
    finally { setBusy(false); }
  };

  const shown = useMemo(() => {
    const rows = roster?.roster ?? [];
    return filter === 'follow' ? rows.filter((r) => r.status === 'pending' || r.status === 'absent' || r.status === 'late' || r.exception) : rows;
  }, [roster, filter]);

  const card: React.CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 10, padding: 12, background: '#fff', color: '#0f172a' };
  const btn: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 10px', background: '#fff', color: '#0f172a', cursor: 'pointer', fontSize: 13 };

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>{t('attendancePages.lessons.title')}</h1>
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ ...btn, padding: '5px 8px' }} />
        <span style={{ fontSize: 12, color: '#64748b' }}>{scope === 'mine' ? t('attendancePages.lessons.mine') : t('attendancePages.lessons.all')}</span>
      </div>

      {loading && <p>{t('attendancePages.lessons.loading')}</p>}
      {!loading && !enabled && (
        <div style={{ ...card, background: '#fffbeb' }}>{t('attendancePages.lessons.disabled')}</div>
      )}
      {!loading && enabled && lessons.length === 0 && (
        <div style={card}>{note || t('attendancePages.lessons.none')}</div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 10, marginBottom: 16 }}>
        {lessons.map((l) => (
          <button key={l.id} onClick={() => openLesson(l.id)}
            style={{ ...card, textAlign: 'start', cursor: 'pointer', outline: openId === l.id ? '2px solid #2563eb' : 'none' }}>
            <div style={{ fontWeight: 600 }}>{l.subjectName ?? t('attendancePages.lessons.subject')} · {l.className}{l.streamName ? ` ${l.streamName}` : ''}</div>
            <div style={{ fontSize: 12, color: '#64748b' }}>{tm(l.startMs)}–{tm(l.endMs)}{l.room ? ` · ${l.room}` : ''}{scope === 'all' && l.teacherName ? ` · ${l.teacherName}` : ''}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap', fontSize: 11 }}>
              {(['present', 'late', 'absent', 'excused', 'pending'] as Status[]).map((s) => (
                <span key={s} style={{ background: COLORS[s].bg, color: COLORS[s].fg, borderRadius: 10, padding: '1px 8px' }}>{digits(l.counts[s])} {t(`attendancePages.lessons.count.${s}`)}</span>
              ))}
            </div>
          </button>
        ))}
      </div>

      {openId && (
        <div style={card}>
          {rosterLoading && <p>{t('attendancePages.lessons.building')}</p>}
          {roster && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
                <strong>{t('attendancePages.lessons.expected', { count: roster.summary.expected })}</strong>
                {(['present', 'late', 'absent', 'excused'] as Status[]).map((s) => (
                  <span key={s} style={{ background: COLORS[s].bg, color: COLORS[s].fg, borderRadius: 10, padding: '1px 10px', fontSize: 12 }}>{digits(roster.summary[s])} {t(`attendancePages.lessons.count.${s}`)}</span>
                ))}
                <span style={{ background: COLORS.pending.bg, color: COLORS.pending.fg, borderRadius: 10, padding: '1px 10px', fontSize: 12 }}>{t('attendancePages.lessons.unaccounted', { count: roster.summary.unaccounted })}</span>
                {roster.summary.exceptions > 0 && <span style={{ color: '#b45309', fontSize: 12 }}>{t('attendancePages.lessons.exceptions', { count: roster.summary.exceptions })}</span>}
                <span style={{ flex: 1 }} />
                <button style={btn} onClick={() => setFilter(filter === 'follow' ? 'all' : 'follow')}>{filter === 'follow' ? t('attendancePages.lessons.showEveryone') : t('attendancePages.lessons.showFollow')}</button>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
                  <thead><tr style={{ textAlign: 'start', color: '#64748b' }}><th style={{ padding: 6 }}>{t('attendancePages.lessons.col.learner')}</th><th>{t('attendancePages.lessons.col.status')}</th><th>{t('attendancePages.lessons.col.firstPunch')}</th><th>{t('attendancePages.lessons.col.notes')}</th><th /></tr></thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr key={r.personId} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 6 }}>{r.name}<div style={{ fontSize: 11, color: '#64748b' }}>{digits(r.admissionNo)}</div></td>
                        <td><span style={{ background: COLORS[r.status].bg, color: COLORS[r.status].fg, borderRadius: 10, padding: '1px 8px', fontSize: 12 }}>{t(`attendancePages.lessons.status.${r.status}`)}{r.status === 'late' ? t('attendancePages.lessons.minutesLate', { n: r.minutesLate }) : ''}</span>
                          {r.source === 'manual' && <span style={{ fontSize: 11, color: '#64748b' }}>{t('attendancePages.lessons.corrected')}</span>}</td>
                        <td>{r.firstPunchAt ? (lang === 'ar' ? formatDate(r.firstPunchAt, { hour: '2-digit', minute: '2-digit' }) : new Date(r.firstPunchAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })) : '—'}</td>
                        <td style={{ fontSize: 12, color: r.exception ? '#b45309' : '#64748b' }}>{r.exception ? (EXC[r.exception] ? t(`attendancePages.lessons.exc.${r.exception}`) : r.exception) : r.reason ?? ''}</td>
                        <td><button style={btn} onClick={() => { setEditing(r); setNewStatus(r.status === 'pending' ? 'present' : r.status); setReason(''); }}>{t('attendancePages.lessons.correct')}</button></td>
                      </tr>
                    ))}
                    {shown.length === 0 && <tr><td colSpan={5} style={{ padding: 12, color: '#64748b' }}>{t('attendancePages.lessons.allAccounted')}</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {editing && (
        <div role="dialog" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div style={{ ...card, width: 380 }}>
            <h3 style={{ margin: '0 0 8px' }}>{t('attendancePages.lessons.editTitle', { name: editing.name })}</h3>
            <label style={{ fontSize: 13 }}>{t('attendancePages.lessons.statusLabel')}{' '}
              <select value={newStatus} onChange={(e) => setNewStatus(e.target.value as Status | 'auto')} style={{ ...btn, marginInlineStart: 6 }}>
                <option value="present">{t('attendancePages.lessons.status.present')}</option><option value="late">{t('attendancePages.lessons.status.late')}</option><option value="absent">{t('attendancePages.lessons.status.absent')}</option><option value="excused">{t('attendancePages.lessons.status.excused')}</option>
                {editing.source === 'manual' && <option value="auto">{t('attendancePages.lessons.undo')}</option>}
              </select>
            </label>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} placeholder={t('attendancePages.lessons.reason')}
              style={{ width: '100%', marginTop: 10, border: '1px solid #cbd5e1', borderRadius: 6, padding: 8, background: '#fff', color: '#0f172a' }} />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
              <button style={btn} onClick={() => setEditing(null)}>{t('attendancePages.lessons.cancel')}</button>
              <button style={{ ...btn, background: '#1d4ed8', color: '#fff', borderColor: '#1d4ed8' }} disabled={busy || reason.trim().length < 3} onClick={submit}>{busy ? t('attendancePages.lessons.saving') : t('attendancePages.lessons.save')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
