'use client';

/** CSV download + Print for any control list. Hidden when printing. */
import React from 'react';
import { Download, Printer } from 'lucide-react';
import { downloadCSV, type ExportColumn } from '@/lib/control/export';

export function ExportButtons({ rows, columns, filename }: { rows: any[]; columns?: ExportColumn[]; filename: string }) {
  return (
    <div className="flex items-center gap-1.5 no-print">
      <button onClick={() => downloadCSV(filename, rows || [], columns)} disabled={!rows?.length}
        className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40">
        <Download className="w-3.5 h-3.5" /> CSV
      </button>
      <button onClick={() => window.print()}
        className="flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300">
        <Printer className="w-3.5 h-3.5" /> Print
      </button>
    </div>
  );
}
