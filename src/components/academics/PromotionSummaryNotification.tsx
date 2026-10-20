'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronDown,
  ChevronUp,
  TrendingUp,
  AlertTriangle,
  XCircle,
  Award,
  Users,
  CheckCircle2,
  Download,
  Printer
} from 'lucide-react';
import useSWR from 'swr';
import { useI18n } from '@/components/i18n/I18nProvider';
import { showToast } from '@/lib/toast';

const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Student {
  student_id: number;
  student_name: string;
  admission_no: string;
  class_name: string;
  total_marks: number;
  average_marks: number;
  division: number;
  divisionName: string;
  promotionStatus: string;
  recommendation: string;
  distinctions: number;
  credits: number;
  passes: number;
  failures: number;
  nextClassName?: string | null;
}

type TFn = (k: string, v?: any, f?: string) => string;
const divisionText = (t: TFn, s: Student) =>
  s.division >= 1 && s.division <= 4 ? t(`academicsPages.promoSummary.div.${s.division}`, s.divisionName) : (s.divisionName ? t('academicsPages.promoSummary.div.fail', s.divisionName) : '');
const recommendationText = (t: TFn, s: Student) => {
  switch (s.promotionStatus) {
    case 'promoted':            return s.nextClassName ? t('academicsPages.promoSummary.rec.promoted', { next: s.nextClassName }, s.recommendation) : s.recommendation;
    case 'expected_to_improve': return t('academicsPages.promoSummary.rec.improve', { count: s.failures ?? 0 }, s.recommendation);
    case 'repeat':              return t('academicsPages.promoSummary.rec.repeat', { cls: s.class_name }, s.recommendation);
    case 'not_applicable':      return t('academicsPages.promoSummary.rec.na', s.recommendation);
    default:                    return s.recommendation;
  }
};

interface PromotionSummaryProps {
  data: {
    isThirdTerm: boolean;
    termName: string;
    summary: {
      total: number;
      promoted: number;
      expectedToImprove: number;
      advisedToRepeat: number;
      promotionRate: string;
    };
    students: {
      promoted: Student[];
      expectedToImprove: Student[];
      advisedToRepeat: Student[];
      notApplicable: Student[];
    };
  };
  onPromoteStudents?: (studentIds: number[], newClassId: number) => void;
}

const PromotionSummaryNotification: React.FC<PromotionSummaryProps> = ({ data, onPromoteStudents }) => {
  const { t, digits } = useI18n();
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [selectedStudents, setSelectedStudents] = useState<Set<number>>(new Set());
  // The destination is picked from this school's own classes — it used to be a hardcoded id (2).
  const [nextClassId, setNextClassId] = useState<string>('');
  const { data: classesRes } = useSWR(data?.isThirdTerm ? '/api/classes' : null, fetcher);
  const classOptions: Array<{ id: number; name: string }> = Array.isArray(classesRes?.data) ? classesRes.data : [];

  // Defensive defaults: ensure student arrays are never null
  const safeStudents = data ? {
    promoted: data.students?.promoted || [],
    expectedToImprove: data.students?.expectedToImprove || [],
    advisedToRepeat: data.students?.advisedToRepeat || [],
    notApplicable: data.students?.notApplicable || [],
  } : {
    promoted: [],
    expectedToImprove: [],
    advisedToRepeat: [],
    notApplicable: [],
  };

  if (!data.isThirdTerm) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-6 h-6 text-blue-600" />
          <div>
            <h4 className="font-semibold text-blue-900 dark:text-blue-100">
              {t('academicsPages.promoSummary.status', "Promotion Status")}
            </h4>
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {t('academicsPages.promoSummary.notThird', { term: data.termName })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const toggleStudentSelection = (studentId: number) => {
    const newSelection = new Set(selectedStudents);
    if (newSelection.has(studentId)) {
      newSelection.delete(studentId);
    } else {
      newSelection.add(studentId);
    }
    setSelectedStudents(newSelection);
  };

  const handleBulkPromotion = () => {
    if (selectedStudents.size === 0) {
      showToast('error', t('academicsPages.promoSummary.pickStudents', "Please select students to promote"));
      return;
    }
    if (!nextClassId) {
      showToast('error', t('academicsPages.promoSummary.pickClass', "Choose the class to promote them into"));
      return;
    }
    if (onPromoteStudents) {
      onPromoteStudents(Array.from(selectedStudents), Number(nextClassId));
    }
  };

  const exportReport = () => {
    const reportData = {
      term: data.termName,
      summary: data.summary,
      students: data.students,
    };

    const blob = new Blob([JSON.stringify(reportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `promotion-report-${data.termName}.json`;
    a.click();
  };

  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-2xl p-6 shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/20 rounded-full">
              <Award className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-bold">{t('academicsPages.promoSummary.title', { term: data.termName })}</h2>
              <p className="text-emerald-100">{t('academicsPages.promoSummary.subtitle', "End of Year Academic Performance Review")}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={exportReport}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              title={t('academicsPages.promoSummary.export', "Export Report")}
              aria-label={t('academicsPages.promoSummary.export', "Export Report")}
            >
              <Download className="w-5 h-5" />
            </button>
            <button
              onClick={() => window.print()}
              className="p-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
              title={t('academicsPages.promoSummary.print', "Print")}
              aria-label={t('academicsPages.promoSummary.print', "Print")}
            >
              <Printer className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-3xl font-bold">{digits(data.summary.total ?? 0)}</div>
            <div className="text-sm text-emerald-100">{t('academicsPages.promoSummary.total', "Total Students")}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-3xl font-bold text-green-200">{digits(data.summary.promoted ?? 0)}</div>
            <div className="text-sm text-emerald-100">{t('academicsPages.promoSummary.promoted', "Promoted")}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-3xl font-bold text-yellow-200">{digits(data.summary.expectedToImprove ?? 0)}</div>
            <div className="text-sm text-emerald-100">{t('academicsPages.promoSummary.support', "Need Support")}</div>
          </div>
          <div className="bg-white/10 rounded-lg p-4">
            <div className="text-3xl font-bold text-red-200">{digits(data.summary.advisedToRepeat ?? 0)}</div>
            <div className="text-sm text-emerald-100">{t('academicsPages.promoSummary.repeat', "Advised Repeat")}</div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-white/20">
          <div className="text-sm text-emerald-100">{t('academicsPages.promoSummary.rate', "Overall Promotion Rate")}</div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex-1 bg-white/20 rounded-full h-3">
              <div
                className="bg-white rounded-full h-3 transition-all duration-500"
                style={{ width: `${data.summary.promotionRate}%` }}
              />
            </div>
            <span className="text-2xl font-bold">{digits(`${data.summary.promotionRate}%`)}</span>
          </div>
        </div>
      </motion.div>

      {/* Promoted Students */}
        <ExpandableSection
          title={t('academicsPages.promoSummary.sec.promoted', "✅ Promoted Learners")}
          subtitle={t('academicsPages.promoSummary.sec.promotedSub', "Division I, II, or III - Ready for next level")}
          count={safeStudents.promoted.length}
          icon={CheckCircle2}
          color="green"
          isExpanded={expandedSection === 'promoted'}
          onToggle={() => toggleSection('promoted')}
        >
          <StudentList
            students={safeStudents.promoted}
            selectedStudents={selectedStudents}
            onToggleSelection={toggleStudentSelection}
            showSelection={true}
          />
        {selectedStudents.size > 0 && (
          <div className="mt-4 p-4 bg-green-50 dark:bg-green-900/20 rounded-lg flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-green-800 dark:text-green-200">
              {t('academicsPages.promoSummary.selected', { count: selectedStudents.size })}
            </span>
            <select
              value={nextClassId}
              onChange={e => setNextClassId(e.target.value)}
              aria-label={t('academicsPages.promoSummary.destClass', "Destination class")}
              className="px-3 py-2 rounded-lg border border-green-300 bg-white dark:bg-slate-800 text-sm"
            >
              <option value="">{t('academicsPages.promoSummary.destClass', "Destination class")}</option>
              {classOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button
              onClick={handleBulkPromotion}
              disabled={!nextClassId}
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <TrendingUp className="w-4 h-4" />
              {t('academicsPages.promoSummary.execute', "Execute Promotion")}
            </button>
          </div>
        )}
      </ExpandableSection>

      {/* Expected to Improve */}
        <ExpandableSection
          title={t('academicsPages.promoSummary.sec.improve', "⚠️ Expected to Improve")}
          subtitle={t('academicsPages.promoSummary.sec.improveSub', "Division IV - Promoted with conditions")}
          count={safeStudents.expectedToImprove.length}
          icon={AlertTriangle}
          color="yellow"
          isExpanded={expandedSection === 'improve'}
          onToggle={() => toggleSection('improve')}
        >
          <StudentList
            students={safeStudents.expectedToImprove}
            selectedStudents={selectedStudents}
            onToggleSelection={toggleStudentSelection}
          />
      </ExpandableSection>

      {/* Advised to Repeat */}
        <ExpandableSection
          title={t('academicsPages.promoSummary.sec.repeat', "❌ Advised to Repeat")}
          subtitle={t('academicsPages.promoSummary.sec.repeatSub', "Below passing standard - Requires class repetition")}
          count={safeStudents.advisedToRepeat.length}
          icon={XCircle}
          color="red"
          isExpanded={expandedSection === 'repeat'}
          onToggle={() => toggleSection('repeat')}
        >
          <StudentList
            students={safeStudents.advisedToRepeat}
            selectedStudents={selectedStudents}
            onToggleSelection={toggleStudentSelection}
          />
      </ExpandableSection>
    </div>
  );
};

// Expandable Section Component
const ExpandableSection: React.FC<{
  title: string;
  subtitle: string;
  count: number;
  icon: React.ComponentType<any>;
  color: 'green' | 'yellow' | 'red';
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, count, icon: Icon, color, isExpanded, onToggle, children }) => {
  const { t } = useI18n();
  const colorClasses = {
    green: {
      bg: 'bg-green-50 dark:bg-green-900/20',
      border: 'border-green-200 dark:border-green-800',
      text: 'text-green-900 dark:text-green-100',
      icon: 'text-green-600 dark:text-green-400',
    },
    yellow: {
      bg: 'bg-yellow-50 dark:bg-yellow-900/20',
      border: 'border-yellow-200 dark:border-yellow-800',
      text: 'text-yellow-900 dark:text-yellow-100',
      icon: 'text-yellow-600 dark:text-yellow-400',
    },
    red: {
      bg: 'bg-red-50 dark:bg-red-900/20',
      border: 'border-red-200 dark:border-red-800',
      text: 'text-red-900 dark:text-red-100',
      icon: 'text-red-600 dark:text-red-400',
    },
  };

  const colors = colorClasses[color];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className={`${colors.bg} border ${colors.border} rounded-xl overflow-hidden shadow-lg`}
    >
      <button
        onClick={onToggle}
        className="w-full p-6 flex items-center justify-between hover:opacity-80 transition-opacity"
      >
        <div className="flex items-center gap-4">
          <div className={`p-3 rounded-full bg-white dark:bg-slate-800 ${colors.icon}`}>
            <Icon className="w-6 h-6" />
          </div>
          <div className="text-start">
            <h3 className={`text-lg font-bold ${colors.text}`}>{title}</h3>
            <p className={`text-sm ${colors.text} opacity-75`}>{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className={`px-4 py-2 rounded-full bg-white dark:bg-slate-800 ${colors.text} font-bold`}>
            {t('academicsPages.promoSummary.students', { count })}
          </div>
          {isExpanded ? (
            <ChevronUp className={`w-6 h-6 ${colors.icon}`} />
          ) : (
            <ChevronDown className={`w-6 h-6 ${colors.icon}`} />
          )}
        </div>
      </button>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-6 pt-0">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

// Student List Component
const StudentList: React.FC<{
  students: Student[];
  selectedStudents: Set<number>;
  onToggleSelection: (id: number) => void;
  showSelection?: boolean;
}> = ({ students, selectedStudents, onToggleSelection, showSelection = false }) => {
  const { t, digits } = useI18n();
  if (students.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        {t('academicsPages.promoSummary.none', "No students in this category")}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {students.map((student) => (
        <div
          key={student.student_id}
          className="bg-white dark:bg-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 flex-1">
              {showSelection && (
                <input
                  type="checkbox"
                  checked={selectedStudents.has(student.student_id)}
                  onChange={() => onToggleSelection(student.student_id)}
                  aria-label={t('academicsPages.promoSummary.select', "Select")}
                  className="w-5 h-5 rounded border-gray-300 text-green-600 focus:ring-green-500"
                />
              )}
              <div className="flex-1">
                <div className="font-semibold text-gray-900 dark:text-white">
                  {student.student_name}
                  <span className="ms-2 text-sm text-gray-500">({student.admission_no})</span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  {student.class_name} • {divisionText(t, student)}
                </div>
              </div>
            </div>
            <div className="text-end">
              <div className="text-lg font-bold text-gray-900 dark:text-white">
                {digits(`${Number(student.average_marks ?? 0).toFixed(1)}%`)}
              </div>
              <div className="text-xs text-gray-500">
                {t('academicsPages.promoSummary.dcf', { d: student.distinctions ?? 0, c: student.credits ?? 0, f: student.failures ?? 0 })}
              </div>
            </div>
          </div>
          <div className="mt-2 text-sm text-gray-600 dark:text-gray-400 italic">
            {recommendationText(t, student)}
          </div>
        </div>
      ))}
    </div>
  );
};

export default PromotionSummaryNotification;
