'use client';

/**
 * Multi-teacher allocation panel (Phase 3).
 *
 * The legacy matrix (SubjectAllocationsManager) assigns ONE teacher per cell.
 * This panel adds the many-to-many side: pick a class + subject and manage the
 * full list of teachers on it — primary, assistants, examiners, etc. — each with
 * its own role, report initials and report-visibility toggle. It talks to
 * /api/academics/allocations/teachers (add without superseding).
 */
import React, { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge,
} from '@/components/ui';
import { Loader2, Plus, Trash2, Star, Eye, EyeOff } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const fetcher = (url: string) => fetch(url).then((r) => r.json());

const ROLES: { value: string; label: string }[] = [
  { value: 'primary_teacher', label: 'Primary' },
  { value: 'assistant_teacher', label: 'Assistant' },
  { value: 'practical_teacher', label: 'Practical' },
  { value: 'theory_teacher', label: 'Theory' },
  { value: 'examiner', label: 'Examiner' },
  { value: 'substitute', label: 'Substitute' },
  { value: 'hod', label: 'HOD' },
];
const roleLabel = (v: string) => ROLES.find((r) => r.value === v)?.label || v;

interface Teacher { id: number; first_name: string; last_name: string; staff_no?: string }
interface Class { id: number; name: string }
interface Subject { id: number; name: string; code?: string }
interface Row {
  id: number;
  teacher_id: number | null;
  allocation_role: string;
  custom_initials: string | null;
  display_on_report: number;
  teacher_name: string;
  auto_initials: string | null;
}

export const MultiTeacherPanel: React.FC = () => {
  const { t, rich } = useI18n();
  const roleName = (v: string) => t(`academicsPages.alloc.role.${v}`, roleLabel(v));
  const [classId, setClassId] = useState<string>('');
  const [subjectId, setSubjectId] = useState<string>('');
  const [addTeacher, setAddTeacher] = useState<string>('');
  const [addRole, setAddRole] = useState<string>('assistant_teacher');
  const [busy, setBusy] = useState(false);

  const { data: classesRes } = useSWR<{ data: Class[] }>(`${API_BASE}/classes?limit=200`, fetcher);
  const { data: subjectsRes } = useSWR<{ data: Subject[] }>(`${API_BASE}/subjects?limit=200`, fetcher);
  const { data: teachersRes } = useSWR<{ data: Teacher[] }>(`${API_BASE}/staff?limit=300`, fetcher);

  const arr = <T,>(x: any): T[] => (Array.isArray(x?.data) ? x.data : []);
  const classes = arr<Class>(classesRes);
  const subjects = arr<Subject>(subjectsRes);
  const teachers = arr<Teacher>(teachersRes);

  const canQuery = classId && subjectId;
  const { data: rowsRes, mutate, isLoading } = useSWR<{ success: boolean; rows: Row[] }>(
    canQuery ? `${API_BASE}/academics/allocations/teachers?class_id=${classId}&subject_id=${subjectId}` : null,
    fetcher,
  );
  const rows = Array.isArray(rowsRes?.rows) ? rowsRes!.rows : [];

  const teacherName = (id: number) => {
    const tch = teachers.find((x) => x.id === id);
    return tch ? `${tch.first_name} ${tch.last_name}`.trim() : `#${id}`;
  };

  // Teachers not already on this subject/class (avoid duplicate rows).
  const availableTeachers = useMemo(() => {
    const used = new Set(rows.map((r) => r.teacher_id));
    return teachers.filter((tch) => !used.has(tch.id));
  }, [teachers, rows]);

  async function add() {
    if (!classId || !subjectId || !addTeacher) { toast.error(t('academicsPages.alloc.t.pick', "Pick a class, subject and teacher")); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/allocations/teachers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ class_id: Number(classId), subject_id: Number(subjectId), teacher_id: Number(addTeacher), allocation_role: addRole }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add teacher');
      setAddTeacher('');
      await mutate();
      toast.success(t('academicsPages.alloc.t.added', "Teacher added"));
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.t.addFailed', "Failed to add teacher")); } finally { setBusy(false); }
  }

  async function patch(id: number, body: Record<string, unknown>) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/allocations/teachers?id=${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      await mutate();
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.t.updateFailed', "Failed to update")); } finally { setBusy(false); }
  }

  async function remove(id: number) {
    if (!confirm(t('academicsPages.alloc.t.confirmRemove', "Remove this teacher from the subject?"))) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/allocations/teachers?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to remove');
      await mutate();
      toast.success(t('academicsPages.alloc.t.removed', "Teacher removed"));
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.t.removeFailed', "Failed to remove")); } finally { setBusy(false); }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span>{t('academicsPages.alloc.t.title', "Multiple teachers per subject")}</span>
          {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Class + subject picker */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>{t('academicsPages.alloc.t.class', "Class")}</Label>
            <Select value={classId} onValueChange={(v) => setClassId(v)}>
              <SelectTrigger><SelectValue placeholder={t('academicsPages.alloc.t.selectClass', "Select class")} /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>{t('academicsPages.alloc.t.subject', "Subject")}</Label>
            <Select value={subjectId} onValueChange={(v) => setSubjectId(v)}>
              <SelectTrigger><SelectValue placeholder={t('academicsPages.alloc.t.selectSubject', "Select subject")} /></SelectTrigger>
              <SelectContent>
                {subjects.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}{s.code ? ` (${s.code})` : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!canQuery && (
          <p className="text-sm text-slate-500">{t('academicsPages.alloc.t.pickHelp', "Pick a class and subject to manage its teachers.")}</p>
        )}

        {canQuery && (
          <>
            {/* Existing teachers */}
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" /> {t('academicsPages.alloc.t.loading', "Loading…")}</div>
            ) : rows.length === 0 ? (
              <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800 p-3 text-sm text-amber-700 dark:text-amber-300">
                {t('academicsPages.alloc.t.none', "No teachers allocated to this subject yet.")}
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const isPrimary = r.allocation_role === 'primary_teacher';
                  const shown = Number(r.display_on_report) === 1;
                  return (
                    <div key={r.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                      <div className="flex items-center gap-2 min-w-[160px] flex-1">
                        {isPrimary && <Star className="w-4 h-4 text-amber-500 fill-amber-400" />}
                        <span className="font-medium text-sm">{r.teacher_name?.trim() || teacherName(r.teacher_id || 0)}</span>
                      </div>

                      <Select value={r.allocation_role} onValueChange={(v) => patch(r.id, { allocation_role: v })}>
                        <SelectTrigger className="w-[130px] h-8"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {ROLES.map((ro) => <SelectItem key={ro.value} value={ro.value}>{roleName(ro.value)}</SelectItem>)}
                        </SelectContent>
                      </Select>

                      <Input
                        className="w-20 h-8"
                        placeholder={r.auto_initials || t('academicsPages.alloc.t.initPh', "Init.")}
                        defaultValue={r.custom_initials || ''}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (r.custom_initials || '')) patch(r.id, { custom_initials: v || null });
                        }}
                        title={t('academicsPages.alloc.t.initTitle', "Report initials (blank = auto from name)")}
                      />

                      <Button
                        type="button" variant="ghost" size="sm"
                        className="h-8 px-2"
                        title={shown ? t('academicsPages.alloc.t.shown', "Shown on report card") : t('academicsPages.alloc.t.hidden', "Hidden from report card")}
                        onClick={() => patch(r.id, { display_on_report: !shown })}
                      >
                        {shown ? <Eye className="w-4 h-4 text-emerald-600" /> : <EyeOff className="w-4 h-4 text-slate-400" />}
                      </Button>

                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-red-600" onClick={() => remove(r.id)} title={t('academicsPages.alloc.t.remove', "Remove")} aria-label={t('academicsPages.alloc.t.remove', "Remove")}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  );
                })}
                {rows.filter((r) => r.allocation_role === 'primary_teacher').length === 0 && (
                  <p className="text-xs text-amber-600">{t('academicsPages.alloc.t.noPrimary', "⚠ No primary teacher — report card initials will list teachers without a lead.")}</p>
                )}
                {rows.filter((r) => r.allocation_role === 'primary_teacher').length > 1 && (
                  <p className="text-xs text-amber-600">{t('academicsPages.alloc.t.manyPrimary', "⚠ More than one primary teacher.")}</p>
                )}
              </div>
            )}

            {/* Add teacher */}
            <div className="flex flex-wrap items-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
              <div className="flex-1 min-w-[160px]">
                <Label>{t('academicsPages.alloc.t.addTeacher', "Add teacher")}</Label>
                <Select value={addTeacher} onValueChange={(v) => setAddTeacher(v)}>
                  <SelectTrigger><SelectValue placeholder={t('academicsPages.alloc.t.selectTeacher', "Select teacher")} /></SelectTrigger>
                  <SelectContent>
                    {availableTeachers.map((tch) => (
                      <SelectItem key={tch.id} value={String(tch.id)}>{tch.first_name} {tch.last_name}{tch.staff_no ? ` · ${tch.staff_no}` : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="w-[140px]">
                <Label>{t('academicsPages.alloc.t.role', "Role")}</Label>
                <Select value={addRole} onValueChange={(v) => setAddRole(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ROLES.map((ro) => <SelectItem key={ro.value} value={ro.value}>{roleName(ro.value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <Button type="button" onClick={add} disabled={busy || !addTeacher} className="gap-1">
                <Plus className="w-4 h-4" /> {t('academicsPages.alloc.t.add', "Add")}
              </Button>
            </div>

            <p className="text-xs text-slate-500">
              {rich('academicsPages.alloc.t.help', { visible: <Badge variant="secondary" className="mx-1">{t('academicsPages.alloc.t.visible', 'visible')}</Badge>, star: <Star className="inline w-3 h-3 mx-1 text-amber-500 fill-amber-400" />, example: <span dir="ltr" className="font-mono">A.N / S.K</span> })}
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
};
