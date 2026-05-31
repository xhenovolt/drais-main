'use client';
/**
 * Settings → School Hours
 *
 * Lets an admin define when students are at school (study hours) and
 * when staff are expected on-site (working hours). Both have a default
 * row applied to every day, and optional per-day overrides for Friday
 * early dismissal, weekend closure, exam-week schedules, etc.
 *
 * Editing UX:
 *   • Two tabs: Study Hours (audience='student') / Working Hours
 *     ('staff'). Same UI for both.
 *   • One row per day, plus a "Default — every other day" row at the
 *     top. The default row uses dayOfWeek=null.
 *   • Each row: open-time / close-time / grace-period minutes /
 *     closed-toggle. Closed days suppress SMS + late computation.
 *   • Save sends all edited rows as one PUT — single round-trip.
 *
 * The schedule feeds:
 *   - ADMS SMS routing (parents/headteacher) — checkin vs late decision
 *   - Phase 1 attendance adapters (lateAfterHHMM option)
 *   - any future scheduling / period code
 */
import React, { useEffect, useState } from 'react';
import { Clock, Save, Loader2, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/components/i18n/I18nProvider';
import { showToast } from '@/lib/toast';

type Audience = 'student' | 'staff';
type DayIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;
type DayOfWeekValue = DayIndex | null;

interface Row {
  audience:           Audience;
  dayOfWeek:          DayOfWeekValue;
  startTime:          string;     // HH:MM
  endTime:            string;     // HH:MM
  lateAfterMinutes:   number | null;
  isClosed:           boolean;
  /** local-only flag: row has unsaved edits */
  dirty?:             boolean;
}

const DAY_LABELS_EN: Record<DayIndex, string> = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday',
};
const DAY_LABELS_AR: Record<DayIndex, string> = {
  0: 'الأحد', 1: 'الإثنين', 2: 'الثلاثاء', 3: 'الأربعاء', 4: 'الخميس', 5: 'الجمعة', 6: 'السبت',
};
const ALL_DAYS: DayIndex[] = [0, 1, 2, 3, 4, 5, 6];

function emptyRow(audience: Audience, dayOfWeek: DayOfWeekValue): Row {
  return {
    audience,
    dayOfWeek,
    startTime:        audience === 'staff' ? '07:00' : '07:30',
    endTime:          audience === 'staff' ? '17:00' : '16:00',
    lateAfterMinutes: 15,
    isClosed:         false,
    dirty:            false,
  };
}

export default function SchoolHoursPage() {
  const { lang } = useI18n();
  const isAr = lang === 'ar';
  const DAY = isAr ? DAY_LABELS_AR : DAY_LABELS_EN;

  const [audience, setAudience] = useState<Audience>('student');
  const [rowsByAud, setRowsByAud] = useState<Record<Audience, Map<DayOfWeekValue, Row>>>({
    student: new Map(),
    staff:   new Map(),
  });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // ── load ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/school-hours');
        const data = await res.json();
        if (!res.ok || !data.success) {
          setError(data?.error || 'Failed to load');
          return;
        }
        const next: Record<Audience, Map<DayOfWeekValue, Row>> = {
          student: new Map(), staff: new Map(),
        };
        for (const r of data.rows as Row[]) {
          next[r.audience].set(r.dayOfWeek, { ...r, dirty: false });
        }
        // Always show the default row even if the school hasn't created one yet.
        for (const aud of ['student','staff'] as Audience[]) {
          if (!next[aud].has(null)) next[aud].set(null, emptyRow(aud, null));
        }
        setRowsByAud(next);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const currentMap = rowsByAud[audience];

  function updateRow(dayOfWeek: DayOfWeekValue, patch: Partial<Row>) {
    setRowsByAud((prev) => {
      const next = { ...prev };
      const map = new Map(next[audience]);
      const existing = map.get(dayOfWeek) ?? emptyRow(audience, dayOfWeek);
      map.set(dayOfWeek, { ...existing, ...patch, dirty: true });
      next[audience] = map;
      return next;
    });
  }

  function addOverrideRow(day: DayIndex) {
    if (currentMap.has(day)) return; // already exists
    updateRow(day, {});
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const dirtyRows: Row[] = [];
      for (const aud of ['student','staff'] as Audience[]) {
        for (const r of rowsByAud[aud].values()) {
          if (r.dirty) dirtyRows.push(r);
        }
      }
      if (dirtyRows.length === 0) {
        showToast('info', isAr ? 'لا توجد تغييرات للحفظ' : 'No changes to save');
        return;
      }
      const res = await fetch('/api/admin/school-hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: dirtyRows.map(r => ({
            audience: r.audience,
            dayOfWeek: r.dayOfWeek,
            startTime: r.startTime,
            endTime: r.endTime,
            lateAfterMinutes: r.lateAfterMinutes,
            isClosed: r.isClosed,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data?.error || 'Save failed');
      }
      // Clear dirty flags.
      setRowsByAud(prev => {
        const next: Record<Audience, Map<DayOfWeekValue, Row>> = {
          student: new Map(), staff: new Map(),
        };
        for (const aud of ['student','staff'] as Audience[]) {
          for (const [k, v] of prev[aud]) next[aud].set(k, { ...v, dirty: false });
        }
        return next;
      });
      showToast('success', isAr ? `تم حفظ ${data.written} صف` : `Saved ${data.written} row(s)`);
    } catch (e) {
      setError((e as Error).message);
      showToast('error', isAr ? 'فشل الحفظ' : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex items-center gap-2 text-slate-400 text-sm">
          <Loader2 className="w-4 h-4 animate-spin" />
          {isAr ? 'جارٍ تحميل الجدول…' : 'Loading schedule…'}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-indigo-500" />
            {isAr ? 'ساعات المدرسة' : 'School Hours'}
          </h1>
          <p className="text-sm text-slate-500 mt-1 max-w-2xl">
            {isAr
              ? 'حدّد متى يُتوقع وصول الطلاب والموظفين. تُستخدم هذه الأوقات لرسائل SMS عند الحضور المتأخر ولإغلاق المدرسة في أيام العطل.'
              : 'Set when students and staff are expected on-site. The schedule drives late-arrival SMS, closure days, and the late/on-time decision the ADMS biometric trigger sends to parents and the headteacher.'}
          </p>
        </div>
        <button
          onClick={save}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-500 disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isAr ? 'حفظ' : 'Save'}
        </button>
      </header>

      {error && (
        <div className="flex items-start gap-2 p-3 bg-rose-50 dark:bg-rose-900/20 rounded text-sm text-rose-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      {/* Audience tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {(['student','staff'] as Audience[]).map(aud => (
          <button
            key={aud}
            onClick={() => setAudience(aud)}
            className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
              audience === aud
                ? 'border-indigo-500 text-indigo-700 dark:text-indigo-300'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-200'
            }`}
          >
            {aud === 'student'
              ? (isAr ? 'ساعات الدراسة' : 'Study Hours')
              : (isAr ? 'ساعات العمل'  : 'Working Hours')}
          </button>
        ))}
      </div>

      {/* Default row + override rows */}
      <div className="space-y-3">
        <ScheduleRow
          label={isAr ? 'الافتراضي (لكل يوم بدون تخصيص)' : 'Default (every day without an override)'}
          row={currentMap.get(null) ?? emptyRow(audience, null)}
          onChange={(patch) => updateRow(null, patch)}
          isAr={isAr}
        />

        <div className="border-t border-slate-200 dark:border-slate-700 pt-3" />

        <p className="text-xs text-slate-500">
          {isAr
            ? 'تجاوزات لأيام محددة (اختياري) — مثلاً الجمعة بتوقيت مبكر، أو الأحد كيوم عطلة.'
            : 'Per-day overrides (optional) — e.g. Friday early dismissal, Sunday closed.'}
        </p>

        {ALL_DAYS.map(day => {
          const row = currentMap.get(day);
          if (row) {
            return (
              <ScheduleRow
                key={day}
                label={DAY[day]}
                row={row}
                onChange={(patch) => updateRow(day, patch)}
                onRemove={() => {
                  setRowsByAud(prev => {
                    const next = { ...prev };
                    const map = new Map(next[audience]);
                    map.delete(day);
                    next[audience] = map;
                    return next;
                  });
                  // also tell the server to soft-archive
                  fetch(`/api/admin/school-hours?audience=${audience}&dayOfWeek=${day}`, { method: 'DELETE' })
                    .catch(() => {});
                }}
                isAr={isAr}
              />
            );
          }
          return (
            <button
              key={day}
              onClick={() => addOverrideRow(day)}
              className="w-full text-start px-3 py-2 text-xs text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg border border-dashed border-slate-300 dark:border-slate-600"
            >
              + {isAr ? `إضافة تجاوز لـ${DAY[day]}` : `Add override for ${DAY[day]}`}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Single row editor ───────────────────────────────────────────────────────
function ScheduleRow({
  label, row, onChange, onRemove, isAr,
}: {
  label:    string;
  row:      Row;
  onChange: (patch: Partial<Row>) => void;
  onRemove?: () => void;
  isAr:     boolean;
}) {
  return (
    <div
      className={`grid grid-cols-12 gap-3 items-center px-4 py-3 rounded-lg border ${
        row.dirty
          ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-900/10'
          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900'
      }`}
    >
      <div className="col-span-3 text-sm font-medium text-slate-700 dark:text-slate-200 flex items-center gap-2">
        {label}
        {row.dirty && <span className="text-[10px] text-amber-600">●</span>}
      </div>

      <div className="col-span-2">
        <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
          {isAr ? 'البداية' : 'Start'}
        </label>
        <input
          type="time"
          value={row.startTime}
          disabled={row.isClosed}
          onChange={e => onChange({ startTime: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 disabled:opacity-50"
        />
      </div>

      <div className="col-span-2">
        <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
          {isAr ? 'النهاية' : 'End'}
        </label>
        <input
          type="time"
          value={row.endTime}
          disabled={row.isClosed}
          onChange={e => onChange({ endTime: e.target.value })}
          className="w-full px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 disabled:opacity-50"
        />
      </div>

      <div className="col-span-2">
        <label className="block text-[10px] uppercase tracking-wide text-slate-400 mb-0.5">
          {isAr ? 'مهلة التأخير' : 'Grace (min)'}
        </label>
        <input
          type="number"
          min={0}
          max={240}
          value={row.lateAfterMinutes ?? ''}
          disabled={row.isClosed}
          placeholder={isAr ? 'صارم' : 'strict'}
          onChange={e => onChange({
            lateAfterMinutes: e.target.value === '' ? null : Number.parseInt(e.target.value, 10),
          })}
          className="w-full px-2 py-1 text-sm border border-slate-200 dark:border-slate-600 rounded bg-white dark:bg-slate-800 disabled:opacity-50"
        />
      </div>

      <label className="col-span-2 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        <input
          type="checkbox"
          checked={row.isClosed}
          onChange={e => onChange({ isClosed: e.target.checked })}
        />
        {isAr ? 'مغلق' : 'Closed'}
      </label>

      <div className="col-span-1 flex justify-end">
        {onRemove && (
          <button
            onClick={onRemove}
            title={isAr ? 'حذف التجاوز' : 'Remove override'}
            className="p-1 text-slate-400 hover:text-rose-600"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
