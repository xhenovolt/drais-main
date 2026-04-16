"use client";
import React, { useState } from 'react';
import { Settings2, GraduationCap, BookOpen } from 'lucide-react';
import ResultTypesManager from '@/components/academics/ResultTypesManager';
import ClassResultsManager from '@/components/academics/ClassResultsManager';
import TheologyResultsManager from '@/components/academics/TheologyResultsManager';

const tabs = [
  { id: 'result-types',      label: 'Result Types',      icon: Settings2 },
  { id: 'secular-results',   label: 'Academic Results',   icon: GraduationCap },
  { id: 'theology-results',  label: 'Theology Results',   icon: BookOpen },
];

export default function ResultsPage() {
  const [activeTab, setActiveTab] = useState(1); // default to Academic Results

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* ── TOOLBAR (48px) ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-40 h-12 flex items-center gap-2 px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Compact tab pills */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
          {tabs.map((tab, idx) => {
            const Icon = tab.icon;
            const active = activeTab === idx;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(idx)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all whitespace-nowrap ${
                  active
                    ? 'bg-white dark:bg-slate-700 text-indigo-700 dark:text-indigo-300 shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT (fills remaining space) ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 0 && <div className="p-4"><ResultTypesManager /></div>}
        {activeTab === 1 && <ClassResultsManager academicType="secular" />}
        {activeTab === 2 && <TheologyResultsManager />}
      </div>
    </div>
  );
}