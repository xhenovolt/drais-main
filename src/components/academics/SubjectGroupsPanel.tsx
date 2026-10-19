'use client';

/**
 * Subject groups + subject classification (Phase 3).
 *
 * Two stacked cards:
 *   1. Subject groups — create / rename / archive (Sciences, Humanities, …).
 *   2. Subject classification — assign each subject a department + group via
 *      dropdowns. Departments come from the existing /api/departments endpoint;
 *      groups from /api/academics/subject-groups.
 */
import React, { useState } from 'react';
import useSWR from 'swr';
import {
  Card, CardContent, CardHeader, CardTitle,
  Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  Badge,
} from '@/components/ui';
import { Loader2, Plus, Trash2, Layers } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useI18n } from '@/components/i18n/I18nProvider';
import { uiIsArabic, isEnglishText } from '@/lib/toast';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '/api';
const fetcher = (url: string) => fetch(url).then((r) => r.json());
const NONE = '__none__';

interface Group { id: number; name: string; code: string | null; subject_count: number; department_count: number }
interface Dept { id: number; name: string }
interface SubjectRow { id: number; name: string; code: string | null; department_id: number | null; subject_group_id: number | null }

export const SubjectGroupsPanel: React.FC = () => {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [newGroup, setNewGroup] = useState('');
  const [newCode, setNewCode] = useState('');

  const { data: groupsRes, mutate: mutateGroups } = useSWR<{ rows: Group[] }>(`${API_BASE}/academics/subject-groups`, fetcher);
  const { data: deptsRes } = useSWR<{ data?: Dept[]; rows?: Dept[] }>(`${API_BASE}/departments`, fetcher);
  const { data: subjectsRes, mutate: mutateSubjects } = useSWR<{ rows: SubjectRow[] }>(`${API_BASE}/academics/subjects/classify`, fetcher);

  const groups = Array.isArray(groupsRes?.rows) ? groupsRes!.rows : [];
  const depts = Array.isArray(deptsRes?.data) ? deptsRes!.data! : Array.isArray(deptsRes?.rows) ? deptsRes!.rows! : [];
  const subjects = Array.isArray(subjectsRes?.rows) ? subjectsRes!.rows : [];

  async function addGroup() {
    const name = newGroup.trim();
    if (!name) { toast.error(t('academicsPages.alloc.g.nameRequired', "Group name required")); return; }
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/subject-groups`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, code: newCode.trim() || null }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to create group');
      setNewGroup(''); setNewCode('');
      await mutateGroups();
      toast.success(t('academicsPages.alloc.g.created', "Group created"));
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.g.createFailed', "Failed to create group")); } finally { setBusy(false); }
  }

  async function deleteGroup(id: number) {
    if (!confirm(t('academicsPages.alloc.g.confirmArchive', "Archive this group? Subjects/departments in it will be unlinked."))) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/subject-groups?id=${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to delete');
      await Promise.all([mutateGroups(), mutateSubjects()]);
      toast.success(t('academicsPages.alloc.g.archived', "Group archived"));
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.g.deleteFailed', "Failed to delete")); } finally { setBusy(false); }
  }

  async function classify(subjectId: number, field: 'department_id' | 'subject_group_id', value: string) {
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/academics/subjects/classify?id=${subjectId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value === NONE ? null : Number(value) }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update');
      await Promise.all([mutateSubjects(), mutateGroups()]);
    } catch (e: any) { toast.error(e?.message && !(uiIsArabic() && isEnglishText(e.message)) ? e.message : t('academicsPages.alloc.g.updateFailed', "Failed to update")); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="w-4 h-4" /> {t('academicsPages.alloc.g.title', "Subject groups")}
            {busy && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[160px]">
              <Label>{t('academicsPages.alloc.g.newGroup', "New group")}</Label>
              <Input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder={t('academicsPages.alloc.g.namePh', "e.g. Sciences")} />
            </div>
            <div className="w-28">
              <Label>{t('academicsPages.alloc.g.code', "Code")}</Label>
              <Input value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="SCI" />
            </div>
            <Button type="button" onClick={addGroup} disabled={busy} className="gap-1"><Plus className="w-4 h-4" /> {t('academicsPages.alloc.g.add', "Add")}</Button>
          </div>
          {groups.length === 0 ? (
            <p className="text-sm text-slate-500">{t('academicsPages.alloc.g.none', "No subject groups yet.")}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {groups.map((gr) => (
                <div key={gr.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-sm">
                  <span className="font-medium">{gr.name}</span>
                  {gr.code && <Badge variant="secondary">{gr.code}</Badge>}
                  <span className="text-xs text-slate-500">{t('academicsPages.alloc.g.counts', { s: gr.subject_count, d: gr.department_count })}</span>
                  <Button type="button" variant="ghost" size="sm" className="h-6 px-1 text-red-600" onClick={() => deleteGroup(gr.id)} title={t('academicsPages.alloc.g.archive', "Archive group")} aria-label={t('academicsPages.alloc.g.archive', "Archive group")}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('academicsPages.alloc.g.classTitle', "Subject classification")}</CardTitle></CardHeader>
        <CardContent>
          {subjects.length === 0 ? (
            <p className="text-sm text-slate-500">{t('academicsPages.alloc.g.noSubjects', "No subjects found.")}</p>
          ) : (
            <div className="space-y-2">
              {subjects.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                  <div className="flex-1 min-w-[140px] font-medium text-sm">{s.name}{s.code ? ` (${s.code})` : ''}</div>
                  <div className="w-[180px]">
                    <Select value={s.department_id ? String(s.department_id) : NONE} onValueChange={(v) => classify(s.id, 'department_id', v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder={t('academicsPages.alloc.g.department', "Department")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('academicsPages.alloc.g.noDept', "— No department —")}</SelectItem>
                        {depts.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-[180px]">
                    <Select value={s.subject_group_id ? String(s.subject_group_id) : NONE} onValueChange={(v) => classify(s.id, 'subject_group_id', v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder={t('academicsPages.alloc.g.group', "Group")} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>{t('academicsPages.alloc.g.noGroup', "— No group —")}</SelectItem>
                        {groups.map((gr) => <SelectItem key={gr.id} value={String(gr.id)}>{gr.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
