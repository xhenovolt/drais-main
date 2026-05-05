'use client';

import { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { GenerateSnapshotModal } from './GenerateSnapshotModal';
import type { SnapshotType } from '@/lib/snapshots/types';

export interface GenerateSnapshotButtonProps {
  defaultType?: SnapshotType;
  className?:   string;
  label?:       string;
}

export function GenerateSnapshotButton({ defaultType = 'secular', className, label }: GenerateSnapshotButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={
          className ??
          'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700'
        }
      >
        <Wand2 className="w-4 h-4" />
        {label ?? 'Generate Report Snapshot'}
      </button>
      <GenerateSnapshotModal isOpen={open} onClose={() => setOpen(false)} defaultType={defaultType} />
    </>
  );
}
