'use client';

/**
 * Shift management (migration 034 + shift engine). Admins create/assign shifts
 * and preview how a punch would be classified — no SQL, no developer.
 * The simulator runs the SAME pure engine (classifyPunch) the evaluator uses.
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { ArrowLeft, Plus, Trash2, Clock, FlaskConical } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Badge,
} from '@/components/ui';
import { classifyPunch, toMinutes, type Shift } from '@/lib/attendance/shifts';
import { useI18n } from '@/components/i18n/I18nProvider';

const API = process.env.NEXT_PUBLIC_API_BASE || '/api';
const fetcher = (u: string) => fetch(u).then(r => r.json());
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

interface ShiftRow {
  id: number; name: string; code: string | null; applies_to: string;
  start_time: string; end_time: string; arrival_window_minutes: number;
  late_threshold_minutes: number; early_leave_threshold_minutes: number;
  overtime_after_minutes: number | null; weekday_mask: number; crosses_midnight: number;
  status: string; assignment_count: number;
}
interface Dept { id: number; name: string }

const hhmm = (t: string) => (t || '').slice(0, 5);
const maskDays = (m: number) => DAYS.filter((_, i) => (m & (1 << i)) !== 0).join(' ');

export default function ShiftsPage() {
  const { t, lang, digits } = useI18n();
  const tdays = (m: number) => DAYS.filter((_, i) => (m & (1 << i)) !== 0).map((d) => t(`attendancePages.shifts.day.${d}`)).join(lang === 'ar' ? '، ' : ' ');
  const { data: shiftsRes, mutate } = useSWR<{ rows: ShiftRow[] }>(`${API}/attendance/shifts`, fetcher);
  const { data: deptRes } = useSWR<{ data?: Dept[]; rows?: Dept[] }>(`${API}/departments`, fetcher);
  const shifts = shiftsRes?.rows || [];
  const depts = deptRes?.data || deptRes?.rows || [];
  const [busy, setBusy] = useState(false);

  // ── create form state ──
  const [f, setF] = useState({ name: '', code: '', applies_to: 'staff', start_time: '07:00', end_time: '13:00', arrival_window_minutes: 30, late_threshold_minutes: 15, early_leave_threshold_minutes: 30, overtime_after_minutes: '', weekday_mask: 31 });
  const toggleDay = (i: number) => setF(s => ({ ...s, weekday_mask: s.weekday_mask ^ (1 << i) }));

  async function createShift() {
    if (!f.name.trim()) { toast.error(t('attendancePages.shifts.nameRequired')); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      if (!res.ok) throw new Error((await res.json()).error || t('attendancePages.shifts.createFailed'));
      setF(s => ({ ...s, name: '', code: '' }));
      await mutate();
      toast.success(t('attendancePages.shifts.created'));
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function removeShift(id: number) {
    if (!confirm(t('attendancePages.shifts.confirmArchive'))) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || t('attendancePages.shifts.failed'));
      await mutate(); toast.success(t('attendancePages.shifts.archived'));
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  // ── assignment ──
  const [assignShift, setAssignShift] = useState('');
  const [assignTarget, setAssignTarget] = useState('school');
  const [assignDept, setAssignDept] = useState('');
  async function addAssignment() {
    if (!assignShift) { toast.error(t('attendancePages.shifts.pickShift')); return; }
    const body: any = { shift_id: Number(assignShift), target_type: assignTarget };
    if (assignTarget === 'department') { if (!assignDept) { toast.error(t('attendancePages.shifts.pickDept')); return; } body.target_id = Number(assignDept); }
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || t('attendancePages.shifts.assignFailed'));
      await mutate(); toast.success(t('attendancePages.shifts.assigned'));
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  // ── simulator (pure engine, client-side) ──
  const [simShiftId, setSimShiftId] = useState('');
  const [simArrival, setSimArrival] = useState('07:20');
  const [simDeparture, setSimDeparture] = useState('13:00');
  const simResult = useMemo(() => {
    const row = shifts.find(s => String(s.id) === simShiftId);
    if (!row) return null;
    const shift: Shift = {
      id: row.id, name: row.name, startTime: row.start_time, endTime: row.end_time,
      arrivalWindowMinutes: row.arrival_window_minutes, lateThresholdMinutes: row.late_threshold_minutes,
      earlyLeaveThresholdMinutes: row.early_leave_threshold_minutes, overtimeAfterMinutes: row.overtime_after_minutes,
      weekdayMask: row.weekday_mask,
    };
    return classifyPunch(shift, simArrival ? toMinutes(simArrival) : null, simDeparture ? toMinutes(simDeparture) : null);
  }, [shifts, simShiftId, simArrival, simDeparture]);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3">
        <Link href="/attendance/settings" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5 rtl-flip" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="w-5 h-5" /> {t('attendancePages.shifts.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('attendancePages.shifts.subtitle')}</p>
        </div>
      </div>

      {/* Create shift */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('attendancePages.shifts.createTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2"><Label>{t('attendancePages.shifts.name')}</Label><Input value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} placeholder={t('attendancePages.shifts.namePlaceholder')} /></div>
            <div><Label>{t('attendancePages.shifts.code')}</Label><Input value={f.code} onChange={e => setF(s => ({ ...s, code: e.target.value }))} placeholder={t('attendancePages.shifts.codePlaceholder')} /></div>
            <div><Label>{t('attendancePages.shifts.appliesTo')}</Label>
              <Select value={f.applies_to} onValueChange={v => setF(s => ({ ...s, applies_to: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="staff">{t('attendancePages.shifts.staff')}</SelectItem><SelectItem value="learner">{t('attendancePages.shifts.learner')}</SelectItem><SelectItem value="both">{t('attendancePages.shifts.both')}</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div><Label>{t('attendancePages.shifts.start')}</Label><Input type="time" value={f.start_time} onChange={e => setF(s => ({ ...s, start_time: e.target.value }))} /></div>
            <div><Label>{t('attendancePages.shifts.end')}</Label><Input type="time" value={f.end_time} onChange={e => setF(s => ({ ...s, end_time: e.target.value }))} /></div>
            <div><Label>{t('attendancePages.shifts.arrivalWin')}</Label><Input type="number" value={f.arrival_window_minutes} onChange={e => setF(s => ({ ...s, arrival_window_minutes: +e.target.value }))} /></div>
            <div><Label>{t('attendancePages.shifts.lateMin')}</Label><Input type="number" value={f.late_threshold_minutes} onChange={e => setF(s => ({ ...s, late_threshold_minutes: +e.target.value }))} /></div>
            <div><Label>{t('attendancePages.shifts.earlyMin')}</Label><Input type="number" value={f.early_leave_threshold_minutes} onChange={e => setF(s => ({ ...s, early_leave_threshold_minutes: +e.target.value }))} /></div>
            <div><Label>{t('attendancePages.shifts.otAfter')}</Label><Input type="number" value={f.overtime_after_minutes} onChange={e => setF(s => ({ ...s, overtime_after_minutes: e.target.value as any }))} placeholder="—" /></div>
          </div>
          <div>
            <Label>{t('attendancePages.shifts.workingDays')}</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border ${(f.weekday_mask & (1 << i)) ? 'bg-primary/10 text-primary border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{t(`attendancePages.shifts.day.${d}`)}</button>
              ))}
            </div>
          </div>
          {f.end_time <= f.start_time && <p className="text-xs text-amber-600">{t('attendancePages.shifts.crossesMidnight')}</p>}
          <Button onClick={createShift} disabled={busy} className="gap-1"><Plus className="w-4 h-4" /> {t('attendancePages.shifts.createButton')}</Button>
        </CardContent>
      </Card>

      {/* Shifts list */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('attendancePages.shifts.listTitle', { count: shifts.length })}</CardTitle></CardHeader>
        <CardContent>
          {shifts.length === 0 ? <p className="text-sm text-muted-foreground">{t('attendancePages.shifts.none')}</p> : (
            <div className="space-y-2">
              {shifts.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex-1 min-w-[160px]">
                    <span className="font-medium text-sm text-foreground">{s.name}</span>
                    {s.code && <Badge variant="secondary" className="ms-2">{s.code}</Badge>}
                    {!!s.crosses_midnight && <Badge variant="secondary" className="ms-1">{t('attendancePages.shifts.overnight')}</Badge>}
                    <div className="text-xs text-muted-foreground">{digits(hhmm(s.start_time))}–{digits(hhmm(s.end_time))} · {tdays(s.weekday_mask) || t('attendancePages.shifts.noDays')} · {t('attendancePages.shifts.lateGt', { n: s.late_threshold_minutes })}</div>
                  </div>
                  <Badge variant="secondary">{t('attendancePages.shifts.assignedCount', { count: s.assignment_count })}</Badge>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => removeShift(s.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('attendancePages.shifts.assignTitle')}</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1"><Label>{t('attendancePages.shifts.shift')}</Label>
            <Select value={assignShift} onValueChange={setAssignShift}><SelectTrigger><SelectValue placeholder={t('attendancePages.shifts.selectShift')} /></SelectTrigger>
              <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="w-40"><Label>{t('attendancePages.shifts.to')}</Label>
            <Select value={assignTarget} onValueChange={setAssignTarget}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="school">{t('attendancePages.shifts.wholeSchool')}</SelectItem><SelectItem value="department">{t('attendancePages.shifts.department')}</SelectItem></SelectContent></Select>
          </div>
          {assignTarget === 'department' && (
            <div className="w-48"><Label>{t('attendancePages.shifts.department')}</Label>
              <Select value={assignDept} onValueChange={setAssignDept}><SelectTrigger><SelectValue placeholder={t('attendancePages.shifts.select')} /></SelectTrigger>
                <SelectContent>{depts.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          <Button onClick={addAssignment} disabled={busy}>{t('attendancePages.shifts.assignButton')}</Button>
        </CardContent>
      </Card>

      {/* Simulator */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4" /> {t('attendancePages.shifts.simTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1"><Label>{t('attendancePages.shifts.shift')}</Label>
              <Select value={simShiftId} onValueChange={setSimShiftId}><SelectTrigger><SelectValue placeholder={t('attendancePages.shifts.selectShift')} /></SelectTrigger>
                <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>{t('attendancePages.shifts.arrival')}</Label><Input type="time" value={simArrival} onChange={e => setSimArrival(e.target.value)} /></div>
            <div><Label>{t('attendancePages.shifts.departure')}</Label><Input type="time" value={simDeparture} onChange={e => setSimDeparture(e.target.value)} /></div>
          </div>
          {simResult ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary" className={simResult.onTime ? 'text-emerald-600' : ''}>{simResult.onTime ? t('attendancePages.shifts.onTime') : simResult.late ? t('attendancePages.shifts.lateN', { n: simResult.lateMinutes }) : t('attendancePages.shifts.noArrival')}</Badge>
              {simResult.earlyLeave && <Badge variant="secondary" className="text-amber-600">{t('attendancePages.shifts.earlyLeave', { n: simResult.earlyLeaveMinutes })}</Badge>}
              {simResult.overtimeMinutes > 0 && <Badge variant="secondary" className="text-indigo-600">{t('attendancePages.shifts.overtime', { n: simResult.overtimeMinutes })}</Badge>}
              {simResult.crossesMidnight && <Badge variant="secondary">{t('attendancePages.shifts.overnightShift')}</Badge>}
            </div>
          ) : <p className="text-sm text-muted-foreground">{t('attendancePages.shifts.pickToPreview')}</p>}
        </CardContent>
      </Card>
    </div>
  );
}
