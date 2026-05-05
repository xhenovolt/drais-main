'use client';

import Link from 'next/link';
import { GraduationCap, ArrowLeft } from 'lucide-react';
import { GenerateSnapshotButton } from '@/components/reports/GenerateSnapshotButton';
import { SnapshotListTable } from '@/components/reports/SnapshotListTable';

export default function SecularReportCardsPage() {
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <Link
        href="/academics/report-cards"
        className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
      >
        <ArrowLeft className="w-4 h-4" /> Report Cards
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <GraduationCap className="w-6 h-6 text-blue-600" /> Secular Report Cards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate a snapshot once per term — preview and print without rerunning live queries.
          </p>
        </div>
        <GenerateSnapshotButton defaultType="secular" />
      </header>

      <SnapshotListTable type="secular" />
    </div>
  );
}
