"use client";
import React, { useState, useEffect } from 'react';
import { Settings2, GraduationCap, BookOpen, ArrowRightLeft, Upload } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import ResultTypesManager from '@/components/academics/ResultTypesManager';
import ClassResultsManager from '@/components/academics/ClassResultsManager';
import TheologyResultsManager from '@/components/academics/TheologyResultsManager';
import { MarksMigrationWizard } from '@/components/academics/MarksMigrationWizard';
import ResultsImportSystem from '@/components/academics/ResultsImportSystem';
import { GenerateSnapshotButton } from '@/components/reports/GenerateSnapshotButton';

const tabs = [
  { id: 'result-types',      label: 'Result Types',      icon: Settings2 },
  { id: 'secular-results',   label: 'Academic Results',   icon: GraduationCap },
  { id: 'theology-results',  label: 'Theology Results',   icon: BookOpen },
  { id: 'import-results',    label: 'Import Results',     icon: Upload },
];

interface WizardData {
  academicYears: Array<{ id: number; name: string }>;
  terms: Array<{ id: number; name: string }>;
  classes: Array<{ id: number; name: string }>;
  subjects: Array<{ id: number; name: string }>;
  resultTypes: Array<{ id: number; name: string }>;
}

export default function ResultsPage() {
  const [activeTab, setActiveTab] = useState(1); // default to Academic Results
  const [migrationOpen, setMigrationOpen] = useState(false);
  const [wizardData, setWizardData] = useState<WizardData>({
    academicYears: [],
    terms: [],
    classes: [],
    subjects: [],
    resultTypes: []
  });
  const [loadingWizardData, setLoadingWizardData] = useState(false);
  const [resultsRefreshKey, setResultsRefreshKey] = useState(0);

  // Load wizard data when component mounts or modal opens
  useEffect(() => {
    loadWizardData(); // Load data on mount
  }, []);

  useEffect(() => {
    if (migrationOpen && wizardData.academicYears.length === 0) {
      console.log('[Migration] Opening modal, loading data...');
      loadWizardData();
    }
  }, [migrationOpen]);

  const loadWizardData = async () => {
    setLoadingWizardData(true);
    try {
      const [yearsRes, termsRes, classesRes, subjectsRes, typesRes] = await Promise.all([
        fetch('/api/academic_years'),
        fetch('/api/terms'),
        fetch('/api/classes'),
        fetch('/api/subjects'),
        fetch('/api/result_types')
      ]);

      const yearsData = yearsRes.ok ? await yearsRes.json() : { data: [] };
      const termsData = termsRes.ok ? await termsRes.json() : { data: [] };
      const classesData = classesRes.ok ? await classesRes.json() : { data: [] };
      const subjectsData = subjectsRes.ok ? await subjectsRes.json() : { data: [] };
      const typesData = typesRes.ok ? await typesRes.json() : { data: [] };

      const years = Array.isArray(yearsData.data) ? yearsData.data : [];
      const terms = Array.isArray(termsData.data) ? termsData.data : [];
      const classes = Array.isArray(classesData.data) ? classesData.data : [];
      const subjects = Array.isArray(subjectsData.data) ? subjectsData.data : [];
      const types = Array.isArray(typesData.data) ? typesData.data : [];

      setWizardData({
        academicYears: Array.isArray(years) ? years : [],
        terms: Array.isArray(terms) ? terms : [],
        classes: Array.isArray(classes) ? classes : [],
        subjects: Array.isArray(subjects) ? subjects : [],
        resultTypes: Array.isArray(types) ? types : []
      });
    } catch (error) {
      console.error('Error loading wizard data:', error);
      // Fallback to empty arrays - UI will still work
    } finally {
      setLoadingWizardData(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 overflow-hidden">

      {/* ── TOOLBAR (48px) ──────────────────────────────────────────── */}
      <div className="flex-shrink-0 sticky top-0 z-40 h-12 flex items-center justify-between gap-2 px-3 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 shadow-sm">
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

        {/* Right-side actions */}
        {activeTab === 1 && (
          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-500">
              Wizard data: {wizardData.academicYears.length} years loaded
              {loadingWizardData && ' (loading...)'}
            </div>
            <Button
              onClick={() => {
                console.log('[Migration] Button clicked, setting migrationOpen to true');
                console.log('[Migration] Current state:', { migrationOpen, loadingWizardData, wizardDataLength: wizardData.academicYears.length });
                setMigrationOpen(true);
              }}
              disabled={loadingWizardData || wizardData.academicYears.length === 0}
              className={`text-xs px-3 py-1.5 rounded-md font-medium transition-colors ${
                loadingWizardData || wizardData.academicYears.length === 0
                  ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                  : 'bg-blue-600 hover:bg-blue-700 text-white'
              }`}
            >
              <ArrowRightLeft className="w-3.5 h-3.5 mr-1.5" />
              Migrate Results
            </Button>
            <GenerateSnapshotButton
              defaultType="secular"
              label="Generate Report Snapshot"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700"
            />
          </div>
        )}
      </div>

      {/* ── CONTENT (fills remaining space) ─────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 0 && <div className="p-4"><ResultTypesManager /></div>}
        {activeTab === 1 && <ClassResultsManager key={resultsRefreshKey} academicType="secular" />}
        {activeTab === 2 && <TheologyResultsManager />}
        {activeTab === 3 && <ResultsImportSystem />}
      </div>

      {/* Migration Wizard */}
      <MarksMigrationWizard
        open={migrationOpen}
        onOpenChange={setMigrationOpen}
        academicYears={wizardData.academicYears}
        terms={wizardData.terms}
        classes={wizardData.classes}
        subjects={wizardData.subjects}
        resultTypes={wizardData.resultTypes}
        onMigrationComplete={(result) => {
          console.log('Migration complete:', result);
          // Trigger refresh of results
          setResultsRefreshKey(prev => prev + 1);
        }}
      />
    </div>
  );
}