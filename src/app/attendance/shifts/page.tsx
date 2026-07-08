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
  const { data: shiftsRes, mutate } = useSWR<{ rows: ShiftRow[] }>(`${API}/attendance/shifts`, fetcher);
  const { data: deptRes } = useSWR<{ data?: Dept[]; rows?: Dept[] }>(`${API}/departments`, fetcher);
  const shifts = shiftsRes?.rows || [];
  const depts = deptRes?.data || deptRes?.rows || [];
  const [busy, setBusy] = useState(false);

  // ── create form state ──
  const [f, setF] = useState({ name: '', code: '', applies_to: 'staff', start_time: '07:00', end_time: '13:00', arrival_window_minutes: 30, late_threshold_minutes: 15, early_leave_threshold_minutes: 30, overtime_after_minutes: '', weekday_mask: 31 });
  const toggleDay = (i: number) => setF(s => ({ ...s, weekday_mask: s.weekday_mask ^ (1 << i) }));

  async function createShift() {
    if (!f.name.trim()) { toast.error('Shift name required'); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create shift');
      setF(s => ({ ...s, name: '', code: '' }));
      await mutate();
      toast.success('Shift created');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }
  async function removeShift(id: number) {
    if (!confirm('Archive this shift and its assignments?')) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      await mutate(); toast.success('Shift archived');
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  }

  // ── assignment ──
  const [assignShift, setAssignShift] = useState('');
  const [assignTarget, setAssignTarget] = useState('school');
  const [assignDept, setAssignDept] = useState('');
  async function addAssignment() {
    if (!assignShift) { toast.error('Pick a shift'); return; }
    const body: any = { shift_id: Number(assignShift), target_type: assignTarget };
    if (assignTarget === 'department') { if (!assignDept) { toast.error('Pick a department'); return; } body.target_id = Number(assignDept); }
    setBusy(true);
    try {
      const res = await fetch(`${API}/attendance/shifts/assignments`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to assign');
      await mutate(); toast.success('Shift assigned');
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
        <Link href="/attendance/settings" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2"><Clock className="w-5 h-5" /> Shifts</h1>
          <p className="text-sm text-muted-foreground">Create shifts, assign them to staff/departments, and preview how a punch is classified.</p>
        </div>
      </div>

      {/* Create shift */}
      <Card>
        <CardHeader><CardTitle className="text-base">Create a shift</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2"><Label>Name</Label><Input value={f.name} onChange={e => setF(s => ({ ...s, name: e.target.value }))} placeholder="Morning Shift" /></div>
            <div><Label>Code</Label><Input value={f.code} onChange={e => setF(s => ({ ...s, code: e.target.value }))} placeholder="AM" /></div>
            <div><Label>Applies to</Label>
              <Select value={f.applies_to} onValueChange={v => setF(s => ({ ...s, applies_to: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="staff">Staff</SelectItem><SelectItem value="learner">Learner</SelectItem><SelectItem value="both">Both</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
            <div><Label>Start</Label><Input type="time" value={f.start_time} onChange={e => setF(s => ({ ...s, start_time: e.target.value }))} /></div>
            <div><Label>End</Label><Input type="time" value={f.end_time} onChange={e => setF(s => ({ ...s, end_time: e.target.value }))} /></div>
            <div><Label>Arrival win.</Label><Input type="number" value={f.arrival_window_minutes} onChange={e => setF(s => ({ ...s, arrival_window_minutes: +e.target.value }))} /></div>
            <div><Label>Late (min)</Label><Input type="number" value={f.late_threshold_minutes} onChange={e => setF(s => ({ ...s, late_threshold_minutes: +e.target.value }))} /></div>
            <div><Label>Early (min)</Label><Input type="number" value={f.early_leave_threshold_minutes} onChange={e => setF(s => ({ ...s, early_leave_threshold_minutes: +e.target.value }))} /></div>
            <div><Label>OT after</Label><Input type="number" value={f.overtime_after_minutes} onChange={e => setF(s => ({ ...s, overtime_after_minutes: e.target.value as any }))} placeholder="—" /></div>
          </div>
          <div>
            <Label>Working days</Label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {DAYS.map((d, i) => (
                <button key={d} type="button" onClick={() => toggleDay(i)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border ${(f.weekday_mask & (1 << i)) ? 'bg-primary/10 text-primary border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>{d}</button>
              ))}
            </div>
          </div>
          {f.end_time <= f.start_time && <p className="text-xs text-amber-600">This shift crosses midnight (overnight/security shift) — handled automatically.</p>}
          <Button onClick={createShift} disabled={busy} className="gap-1"><Plus className="w-4 h-4" /> Create shift</Button>
        </CardContent>
      </Card>

      {/* Shifts list */}
      <Card>
        <CardHeader><CardTitle className="text-base">Shifts ({shifts.length})</CardTitle></CardHeader>
        <CardContent>
          {shifts.length === 0 ? <p className="text-sm text-muted-foreground">No shifts yet.</p> : (
            <div className="space-y-2">
              {shifts.map(s => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5">
                  <div className="flex-1 min-w-[160px]">
                    <span className="font-medium text-sm text-foreground">{s.name}</span>
                    {s.code && <Badge variant="secondary" className="ml-2">{s.code}</Badge>}
                    {!!s.crosses_midnight && <Badge variant="secondary" className="ml-1">overnight</Badge>}
                    <div className="text-xs text-muted-foreground">{hhmm(s.start_time)}–{hhmm(s.end_time)} · {maskDays(s.weekday_mask) || 'no days'} · late&gt;{s.late_threshold_minutes}m</div>
                  </div>
                  <Badge variant="secondary">{s.assignment_count} assigned</Badge>
                  <Button variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => removeShift(s.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Assign */}
      <Card>
        <CardHeader><CardTitle className="text-base">Assign a shift</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap items-end gap-2">
          <div className="min-w-[160px] flex-1"><Label>Shift</Label>
            <Select value={assignShift} onValueChange={setAssignShift}><SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="w-40"><Label>To</Label>
            <Select value={assignTarget} onValueChange={setAssignTarget}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="school">Whole school</SelectItem><SelectItem value="department">Department</SelectItem></SelectContent></Select>
          </div>
          {assignTarget === 'department' && (
            <div className="w-48"><Label>Department</Label>
              <Select value={assignDept} onValueChange={setAssignDept}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>{depts.map(d => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          <Button onClick={addAssignment} disabled={busy}>Assign</Button>
        </CardContent>
      </Card>

      {/* Simulator */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><FlaskConical className="w-4 h-4" /> Policy simulator</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[160px] flex-1"><Label>Shift</Label>
              <Select value={simShiftId} onValueChange={setSimShiftId}><SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
                <SelectContent>{shifts.map(s => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}</SelectContent></Select>
            </div>
            <div><Label>Arrival</Label><Input type="time" value={simArrival} onChange={e => setSimArrival(e.target.value)} /></div>
            <div><Label>Departure</Label><Input type="time" value={simDeparture} onChange={e => setSimDeparture(e.target.value)} /></div>
          </div>
          {simResult ? (
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary" className={simResult.onTime ? 'text-emerald-600' : ''}>{simResult.onTime ? 'On time' : simResult.late ? `Late ${simResult.lateMinutes}m` : 'No arrival'}</Badge>
              {simResult.earlyLeave && <Badge variant="secondary" className="text-amber-600">Early leave {simResult.earlyLeaveMinutes}m</Badge>}
              {simResult.overtimeMinutes > 0 && <Badge variant="secondary" className="text-indigo-600">Overtime {simResult.overtimeMinutes}m</Badge>}
              {simResult.crossesMidnight && <Badge variant="secondary">overnight shift</Badge>}
            </div>
          ) : <p className="text-sm text-muted-foreground">Pick a shift to preview classification.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
