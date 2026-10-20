import React, { useMemo, useState } from 'react';
import type { ReportSnapshot } from '@/lib/snapshots/types';
import { useI18n } from '@/components/i18n/I18nProvider';

export interface SnapshotAuditPanelProps {
  snapshot: ReportSnapshot;
  classIdx?: number;
}

export function SnapshotAuditPanel({ snapshot, classIdx = 0 }: SnapshotAuditPanelProps) {
  const { t, digits } = useI18n();
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : digits(String(v)));
  const classes = snapshot.classes || [];
  const audit = snapshot.audit || {};
  const [selectedClass, setSelectedClass] = useState<number>(classIdx);
  const classList = classes.map((c, i) => ({ i, id: c.classId, name: c.className, students: c.students.length }));

  const currentAuditForClass = useMemo(() => {
    const cid = classList[selectedClass]?.id;
    if (!cid) return {} as Record<number, any>;
    return audit[cid] || {};
  }, [audit, classList, selectedClass]);

  return (
    <div className="p-3 border-t border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">{t('academicsPages.snapshotView.aud.title', "Snapshot Audit")}</div>
        <select
          value={selectedClass}
          onChange={e => setSelectedClass(Number(e.target.value))}
          className="rounded border border-slate-300 bg-white dark:bg-slate-800 px-2 py-1 text-sm"
        >
          {classList.map(c => (
            <option key={c.id} value={c.i}>{c.name} ({digits(c.students)})</option>
          ))}
        </select>
      </div>

      <div className="space-y-2 max-h-72 overflow-auto">
        {Object.values(currentAuditForClass).length === 0 && (
          <div className="text-xs text-slate-500">{t('academicsPages.snapshotView.aud.none', "No audit metadata available for this class.")}</div>
        )}
        {Object.values(currentAuditForClass).map((sa: any) => (
          <details key={sa.studentDbId} className="p-2 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800">
            <summary className="font-medium">{sa.studentName} — {num(sa.aggregates)} — {num(sa.division)}</summary>
            <div className="mt-2 text-xs">
              <table className="w-full text-start text-xs">
                <thead>
                  <tr>
                    <th className="pe-2 text-start">{t('academicsPages.snapshotView.aud.subject', "Subject")}</th>
                    <th className="pe-2 text-start">{t('academicsPages.snapshotView.aud.score', "Score")}</th>
                    <th className="pe-2 text-start">{t('academicsPages.snapshotView.aud.grade', "Grade")}</th>
                    <th className="pe-2 text-start">{t('academicsPages.snapshotView.aud.gp', "GP")}</th>
                    <th className="text-start">{t('academicsPages.snapshotView.aud.included', "Included")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(sa.subjects || []).map((sub: any) => (
                    <tr key={sub.subjectId} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="pe-2 py-1">{sub.subjectName}</td>
                      <td className="pe-2 py-1">{num(sub.score)}</td>
                      <td className="pe-2 py-1">{sub.grade}</td>
                      <td className="pe-2 py-1">{num(sub.gradePoint)}</td>
                      <td className="py-1">{sub.included ? t('academicsPages.snapshotView.aud.yes', "Yes") : t('academicsPages.snapshotView.aud.no', "No")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}

export default SnapshotAuditPanel;
