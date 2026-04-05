'use client';
import { FileBarChart } from 'lucide-react';

export default function IncomeStatementPage() {
  return (
    <div className="flex flex-col items-center justify-center h-64 gap-3 text-slate-400">
      <FileBarChart className="w-10 h-10" />
      <p className="text-sm font-medium">Income Statement — coming soon</p>
    </div>
  );
}
