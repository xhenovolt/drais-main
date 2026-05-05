'use client';

import Link from 'next/link';
import { BookOpen, ArrowLeft } from 'lucide-react';
import { GenerateSnapshotButton } from '@/components/reports/GenerateSnapshotButton';
import { SnapshotListTable } from '@/components/reports/SnapshotListTable';

export default function TheologyReportCardsPage() {
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
            <BookOpen className="w-6 h-6 text-emerald-600" /> Theology Report Cards
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Snapshot-driven theology reports — Arabic numerals (٠–٩) and RTL layout, mirroring the proven emergency strategy.
          </p>
        </div>
        <GenerateSnapshotButton defaultType="theology" />
      </header>

      <SnapshotListTable type="theology" />
    </div>
  );
}
