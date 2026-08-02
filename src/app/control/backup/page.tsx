'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import { BackupCenter } from '@/components/backup/BackupCenter';

const fetcher = (u: string) => fetch(u, { cache: 'no-store' }).then((r) => r.json());

export default function ControlBackupPage() {
  const [schoolId, setSchoolId] = useState<number | null>(null);
  const { data } = useSWR('/api/control-center/schools', fetcher);
  const schools: any[] = data?.rows || [];

  return (
    <BackupCenter
      apiBase="/api/control-center/backup"
      schoolId={schoolId}
      canGenerate={!!schoolId}
      schoolPicker={
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <label className="text-xs font-medium text-gray-500 mb-1 block">School to back up</label>
          <select
            value={schoolId ?? ''}
            onChange={(e) => setSchoolId(e.target.value ? Number(e.target.value) : null)}
            className="w-full sm:w-96 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm"
          >
            <option value="">Select a school…</option>
            {schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
      }
    />
  );
}
