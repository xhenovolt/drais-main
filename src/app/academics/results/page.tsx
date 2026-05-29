"use client";
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Settings2, GraduationCap, BookOpen, ArrowRightLeft, Upload, Sparkles, ArrowRight, X } from 'lucide-react';
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

      {/* ── CAFE bridge banner — visible at the top of the legacy results
              page so schools can discover the new competency entry surface. ─ */}
      <CAFEBridgeBanner />

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
/**
 * CAFE bridge banner — shows above the legacy results UI so schools using
 * the new Configurable Assessment Framework Engine (CAFE) can discover the
 * new component-level result entry surface without leaving this page.
 *
 * Behaviour:
 *   • Probes /api/cafe/frameworks. If the school has at least one active
 *     framework, the banner shows a primary CTA ("Open CAFE Result Entry
 *     →") and a discreet count of frameworks.
 *   • If no frameworks exist, the banner is a softer informational note
 *     ("CAFE supports competency-based entry; configure it at /admin/cafe")
 *     so schools that don't need CBC are not pushed.
 *   • Dismissible per session (localStorage key) so power users who
 *     already know about CAFE don't see it every visit.
 */
function CAFEBridgeBanner() {
  const [frameworkCount, setFrameworkCount] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem('cafe_banner_dismissed_v1');
      if (v === '1') setDismissed(true);
    } catch { /* SSR or no storage */ }
    (async () => {
      try {
        const r = await fetch('/api/cafe/frameworks?active_only=1');
        if (!r.ok) { setFrameworkCount(0); return; }
        const d = await r.json();
        setFrameworkCount(Array.isArray(d?.frameworks) ? d.frameworks.length : 0);
      } catch {
        setFrameworkCount(0);
      }
    })();
  }, []);

  if (dismissed) return null;
  if (frameworkCount === null) return null;  // suppress flicker while probing

  function dismiss() {
    setDismissed(true);
    try { localStorage.setItem('cafe_banner_dismissed_v1', '1'); } catch { /* ignore */ }
  }

  if (frameworkCount > 0) {
    return (
      <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-950/40 dark:to-purple-950/40 border-b border-indigo-200 dark:border-indigo-900/60">
        <Sparkles className="w-4 h-4 text-indigo-600 flex-shrink-0" />
        <div className="flex-1 min-w-0 text-xs">
          <strong className="text-indigo-800 dark:text-indigo-200">
            CAFE is active for your school
          </strong>
          <span className="text-indigo-700 dark:text-indigo-300 ml-1">
            ({frameworkCount} framework{frameworkCount === 1 ? '' : 's'}).
            Enter component-level scores — AoI, rubrics, descriptors — in the new entry grid.
          </span>
        </div>
        <Link
          href="/academics/results-cafe"
          className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-600 text-white rounded hover:bg-indigo-500 whitespace-nowrap"
        >
          Open CAFE Result Entry <ArrowRight className="w-3 h-3" />
        </Link>
        <button onClick={dismiss} title="Dismiss for this session"
          className="p-1 text-indigo-500 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded">
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 flex items-center gap-3 px-4 py-2 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-900/60">
      <Sparkles className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />
      <div className="flex-1 min-w-0 text-xs text-amber-800 dark:text-amber-200">
        <strong>CAFE (Configurable Assessment Framework Engine)</strong> is available for
        competency-based entry — Activities of Integration, rubrics, generic skills, projects.
        <span className="ml-1 opacity-80">Not needed for traditional percentage workflows.</span>
      </div>
      <Link
        href="/admin/cafe"
        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold border border-amber-300 text-amber-800 dark:text-amber-200 rounded hover:bg-amber-100 dark:hover:bg-amber-900/40 whitespace-nowrap"
      >
        Configure CAFE <ArrowRight className="w-3 h-3" />
      </Link>
      <button onClick={dismiss} title="Dismiss for this session"
        className="p-1 text-amber-600 hover:bg-amber-100 dark:hover:bg-amber-900/40 rounded">
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
