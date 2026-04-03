"use client";
import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  FileText, Download, Printer, Eye, Settings, Palette, 
  BarChart3, PieChart, TrendingUp, Users, Calendar,
  Grid, List, Columns, Layers, Save, Undo, Redo,
  ChevronDown, Search, Filter, RefreshCw
} from 'lucide-react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { LexicalErrorBoundary } from '@lexical/react/LexicalErrorBoundary';
import { $getRoot, $getSelection } from 'lexical';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, PieChart as RechartsPieChart, Cell, LineChart, Line } from 'recharts';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { saveAs } from 'file-saver';
import * as XLSX from 'xlsx';
import ModuleIntroCard from '@/components/onboarding/ModuleIntroCard';
import HelpButton from '@/components/onboarding/HelpButton';

// Report Template Types
interface ReportTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  category: 'formal' | 'analysis' | 'summary' | 'visual' | 'progress';
  layout: 'grid' | 'list' | 'mixed';
  features: string[];
}

interface SchoolBranding {
  logo: string;
  name: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
}

interface ReportData {
  students: any[];
  attendance: any[];
  grades: any[];
  classes: any[];
  analytics: any;
  schoolInfo: SchoolBranding;
}

const REPORT_TEMPLATES: ReportTemplate[] = [
  {
    id: 'default',
    name: 'Classic Report',
    description: 'Traditional tabular format with clean layout',
    icon: List,
    category: 'formal',
    layout: 'list',
    features: ['Student List', 'Basic Info', 'Grades', 'Print Ready']
  },
  {
    id: 'detailed',
    name: 'Detailed Analysis',
    description: 'Comprehensive report with charts and analytics',
    icon: BarChart3,
    category: 'analysis',
    layout: 'mixed',
    features: ['Performance Charts', 'Attendance Graphs', 'Detailed Stats', 'Trend Analysis']
  },
  {
    id: 'summary',
    name: 'Executive Summary',
    description: 'High-level overview for administrators',
    icon: PieChart,
    category: 'summary',
    layout: 'grid',
    features: ['Key Metrics', 'Quick Stats', 'Performance Indicators', 'Highlights']
  },
  {
    id: 'visual',
    name: 'Visual Dashboard',
    description: 'Chart-heavy report with visual insights',
    icon: TrendingUp,
    category: 'visual',
    layout: 'grid',
    features: ['Interactive Charts', 'Visual Analytics', 'Infographics', 'Data Visualization']
  },
  {
    id: 'progress',
    name: 'Progress Report',
    description: 'Student progress tracking over time',
    icon: Calendar,
    category: 'progress',
    layout: 'mixed',
    features: ['Progress Tracking', 'Timeline View', 'Milestones', 'Parent-Friendly']
  }
];

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#F97316'];

const ReportsPage: React.FC = () => {
  const [selectedTemplate, setSelectedTemplate] = useState<string>('default');
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [previewMode, setPreviewMode] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedDateRange, setSelectedDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [customBranding, setCustomBranding] = useState<Partial<SchoolBranding>>({});
  const [isExporting, setIsExporting] = useState(false);

  // Fetch report data
  useEffect(() => {
    const fetchReports = async () => {
      try {
        setLoading(true);
        const [studentsRes, attendanceRes, gradesRes, classesRes, schoolRes] = await Promise.all([
          fetch('/api/reports/students'),
          fetch('/api/reports/attendance'),
          fetch('/api/reports/grades'),
          fetch('/api/classes'),
          fetch('/api/school/branding')
        ]);

        const [students, attendance, grades, classes, schoolInfo] = await Promise.all([
          studentsRes.json(),
          attendanceRes.json(),
          gradesRes.json(),
          classesRes.json(),
          schoolRes.json()
        ]);

        setReportData({
          students: students.data || [],
          attendance: attendance.data || [],
          grades: grades.data || [],
          classes: classes.data || [],
          analytics: generateAnalytics(students.data, attendance.data, grades.data),
          schoolInfo: schoolInfo.data || getDefaultBranding()
        });
      } catch (err: any) {
        setError(err.message);
        // Show demo data on error
        setReportData(getDemoData());
      } finally {
        setLoading(false);
      }
    };

    fetchReports();
  }, [selectedClass, selectedDateRange]);

  const getDefaultBranding = (): SchoolBranding => ({
    logo: '/images/drais-logo.png',
    name: 'DRAIS Demo School',
    address: '123 Education Street, Learning City',
    phone: '+1 (555) 123-4567',
    email: 'info@draisschool.edu',
    website: 'www.draisschool.edu',
    primaryColor: '#1E40AF',
    secondaryColor: '#3B82F6',
    accentColor: '#10B981'
  });

  const getDemoData = (): ReportData => ({
    students: [
      { id: 1, name: 'John Doe', class: 'Grade 10A', attendance: 95, grade: 'A', performance: 88 },
      { id: 2, name: 'Jane Smith', class: 'Grade 10A', attendance: 92, grade: 'B+', performance: 85 },
      { id: 3, name: 'Mike Johnson', class: 'Grade 10B', attendance: 89, grade: 'B', performance: 82 }
    ],
    attendance: [
      { month: 'Jan', rate: 95 },
      { month: 'Feb', rate: 92 },
      { month: 'Mar', rate: 88 },
      { month: 'Apr', rate: 94 }
    ],
    grades: [
      { subject: 'Mathematics', average: 85, students: 120 },
      { subject: 'Science', average: 82, students: 118 },
      { subject: 'English', average: 87, students: 125 }
    ],
    classes: [
      { id: '1', name: 'Grade 10A', students: 30 },
      { id: '2', name: 'Grade 10B', students: 28 }
    ],
    analytics: {
      totalStudents: 150,
      averageAttendance: 92.5,
      overallGrade: 'B+',
      improvementTrend: 5.2
    },
    schoolInfo: getDefaultBranding()
  });

  const generateAnalytics = (students: any[], attendance: any[], grades: any[]) => {
    return {
      totalStudents: students.length,
      averageAttendance: attendance.reduce((acc, curr) => acc + curr.rate, 0) / attendance.length || 0,
      overallGrade: 'B+',
      improvementTrend: Math.random() * 10 - 5 // Demo calculation
    };
  };

  // Template switching with animation
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplate(templateId);
  };

  // Export functions
  const exportToPDF = async () => {
    setIsExporting(true);
    try {
      const element = document.getElementById('report-content');
      if (!element) return;

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true
      });

      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;

      pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
      pdf.save(`${reportData?.schoolInfo.name || 'School'}-Report-${new Date().toISOString().split('T')[0]}.pdf`);
    } catch (error) {
      console.error('Export to PDF failed:', error);
    } finally {
      setIsExporting(false);
    }
  };

  const exportToExcel = () => {
    if (!reportData) return;

    const wb = XLSX.utils.book_new();
    
    // Students sheet
    const studentsWS = XLSX.utils.json_to_sheet(reportData.students);
    XLSX.utils.book_append_sheet(wb, studentsWS, 'Students');
    
    // Attendance sheet
    const attendanceWS = XLSX.utils.json_to_sheet(reportData.attendance);
    XLSX.utils.book_append_sheet(wb, attendanceWS, 'Attendance');
    
    // Grades sheet
    const gradesWS = XLSX.utils.json_to_sheet(reportData.grades);
    XLSX.utils.book_append_sheet(wb, gradesWS, 'Grades');

    XLSX.writeFile(wb, `${reportData.schoolInfo.name}-Report-${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const printReport = () => {
    window.print();
  };

  // Render functions for different templates
  const renderDefaultTemplate = () => (
    <div className="space-y-8">
      {/* Header */}
      <div className="text-center border-b pb-6">
        <div className="flex items-center justify-center mb-4">
          <img 
            src={reportData?.schoolInfo.logo} 
            alt="School Logo" 
            className="mr-4"
            style={{ maxHeight: 80, width: 'auto' }}
            onError={(e) => {
              e.currentTarget.src = '/images/default-school-logo.png';
            }}
          />
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {reportData?.schoolInfo.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {reportData?.schoolInfo.address}
            </p>
          </div>
        </div>
        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
          Academic Report - {new Date().toLocaleDateString()}
        </h2>
      </div>

      {/* Students Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-gray-300 dark:border-gray-600">
          <thead>
            <tr className="bg-gray-50 dark:bg-slate-700">
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Name</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Class</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Attendance</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Grade</th>
              <th className="border border-gray-300 dark:border-gray-600 px-4 py-3 text-left">Performance</th>
            </tr>
          </thead>
          <tbody>
            {reportData?.students.map((student, index) => (
              <tr key={student.id || index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">{student.name}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">{student.class}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">{student.attendance}%</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">{student.grade}</td>
                <td className="border border-gray-300 dark:border-gray-600 px-4 py-3">{student.performance}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDetailedTemplate = () => (
    <div className="space-y-8">
      {/* Header with branding */}
      <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <img 
              src={reportData?.schoolInfo.logo} 
              alt="School Logo" 
              className="mr-6 bg-white rounded-lg p-2"
              style={{ maxHeight: 80, width: 'auto' }}
              onError={(e) => {
                e.currentTarget.src = '/images/default-school-logo.png';
              }}
            />
            <div>
              <h1 className="text-4xl font-bold">{reportData?.schoolInfo.name}</h1>
              <p className="text-blue-100 text-lg">{reportData?.schoolInfo.address}</p>
              <p className="text-blue-100">Comprehensive Academic Analysis</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">{new Date().getFullYear()}</p>
            <p className="text-blue-100">Academic Year</p>
          </div>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-blue-50 dark:bg-blue-900/20 p-6 rounded-lg">
          <div className="flex items-center">
            <Users className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Total Students</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData?.analytics.totalStudents}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-green-50 dark:bg-green-900/20 p-6 rounded-lg">
          <div className="flex items-center">
            <Calendar className="h-8 w-8 text-green-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Avg. Attendance</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData?.analytics.averageAttendance.toFixed(1)}%</p>
            </div>
          </div>
        </div>
        
        <div className="bg-purple-50 dark:bg-purple-900/20 p-6 rounded-lg">
          <div className="flex items-center">
            <BarChart3 className="h-8 w-8 text-purple-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Overall Grade</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">{reportData?.analytics.overallGrade}</p>
            </div>
          </div>
        </div>
        
        <div className="bg-orange-50 dark:bg-orange-900/20 p-6 rounded-lg">
          <div className="flex items-center">
            <TrendingUp className="h-8 w-8 text-orange-600 mr-3" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400">Improvement</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">+{reportData?.analytics.improvementTrend.toFixed(1)}%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Attendance Trends</h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={reportData?.attendance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={3} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-lg">
          <h3 className="text-lg font-semibold mb-4">Subject Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={reportData?.grades}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="subject" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="average" fill="#10B981" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Detailed Student Table */}
      <div className="bg-white dark:bg-slate-800 rounded-lg shadow-lg overflow-hidden">
        <div className="bg-gray-50 dark:bg-slate-700 px-6 py-4">
          <h3 className="text-lg font-semibold">Detailed Student Performance</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-slate-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Student</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Class</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Attendance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Grade</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Performance</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {reportData?.students.map((student, index) => (
                <tr key={student.id || index} className="hover:bg-gray-50 dark:hover:bg-slate-700/50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                        <span className="text-white font-medium text-sm">
                          {student.name?.charAt(0)}
                        </span>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900 dark:text-white">{student.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{student.class}</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="text-sm font-medium text-gray-900 dark:text-white">{student.attendance}%</div>
                      <div className="ml-2 w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-500 h-2 rounded-full" 
                          style={{ width: `${student.attendance}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                      {student.grade}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{student.performance}%</td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      student.performance >= 80 ? 'bg-green-100 text-green-800' :
                      student.performance >= 70 ? 'bg-yellow-100 text-yellow-800' :
                      'bg-red-100 text-red-800'
                    }`}>
                      {student.performance >= 80 ? 'Excellent' :
                       student.performance >= 70 ? 'Good' : 'Needs Improvement'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderCurrentTemplate = () => {
    switch (selectedTemplate) {
      case 'detailed':
        return renderDetailedTemplate();
      case 'summary':
        return renderSummaryTemplate();
      case 'visual':
        return renderVisualTemplate();
      case 'progress':
        return renderProgressTemplate();
      default:
        return renderDefaultTemplate();
    }
  };

  // ...existing template rendering functions...

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading report data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      {/* Phase 22: Module intro card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        <ModuleIntroCard
          moduleId="reports"
          icon="📊"
          title="Reports Module"
          description="Generate attendance reports, academic summaries, and financial snapshots. Export to PDF or Excel. This is where you prove that DRAIS is working for your school."
          actions={[
            { label: 'Generate Attendance Report', href: '#', primary: true },
          ]}
          learnMoreHref="/documentation/reports"
        />
      </div>
      {/* Header Controls */}
      <div className="bg-white dark:bg-slate-800 shadow-sm border-b border-gray-200 dark:border-gray-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <FileText className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Reports</h1>
            </div>

            <div className="flex items-center space-x-4">
              {/* Template Selector */}
              <div className="relative">
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="input-field min-w-[200px]"
                >
                  {REPORT_TEMPLATES.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center space-x-2">
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className={`btn-secondary gap-2 ${previewMode ? 'bg-blue-100 text-blue-700' : ''}`}
                >
                  <Eye className="w-4 h-4" />
                  Preview
                </button>

                <button
                  onClick={() => setCustomizing(!customizing)}
                  className={`btn-secondary gap-2 ${customizing ? 'bg-purple-100 text-purple-700' : ''}`}
                >
                  <Settings className="w-4 h-4" />
                  Customize
                </button>

                <div className="relative">
                  <button className="btn-secondary gap-2">
                    <Download className="w-4 h-4" />
                    Export
                    <ChevronDown className="w-4 h-4" />
                  </button>
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hidden group-hover:block">
                    <button
                      onClick={exportToPDF}
                      disabled={isExporting}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4" />
                      Export as PDF
                    </button>
                    <button
                      onClick={exportToExcel}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Grid className="w-4 h-4" />
                      Export as Excel
                    </button>
                    <button
                      onClick={printReport}
                      className="w-full text-left px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-700 flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      Print Report
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex gap-8">
          {/* Sidebar - Template Gallery & Customization */}
          <AnimatePresence>
            {customizing && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: '300px', opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="bg-white dark:bg-slate-800 rounded-lg shadow-lg p-6 overflow-hidden"
              >
                <h3 className="text-lg font-semibold mb-4">Template Gallery</h3>
                <div className="space-y-3">
                  {REPORT_TEMPLATES.map((template) => {
                    const IconComponent = template.icon;
                    return (
                      <button
                        key={template.id}
                        onClick={() => handleTemplateChange(template.id)}
                        className={`w-full text-left p-3 rounded-lg border transition-all ${
                          selectedTemplate === template.id
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-600 hover:border-blue-300'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <IconComponent className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="font-medium text-sm">{template.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{template.description}</p>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Branding Customization */}
                <div className="mt-8">
                  <h4 className="font-semibold mb-4">Brand Customization</h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Primary Color</label>
                      <input
                        type="color"
                        value={customBranding.primaryColor || '#1E40AF'}
                        onChange={(e) => setCustomBranding(prev => ({ ...prev, primaryColor: e.target.value }))
                        }
                        className="w-full h-10 rounded border border-gray-300 dark:border-gray-600"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">School Name</label>
                      <input
                        type="text"
                        value={customBranding.name || reportData?.schoolInfo.name || ''}
                        onChange={(e) => setCustomBranding(prev => ({ ...prev, name: e.target.value }))
                        }
                        className="input-field"
                      />
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Main Report Content */}
          <div className="flex-1">
            <AnimatePresence mode="wait">
              <motion.div
                key={selectedTemplate}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
                id="report-content"
                className={`bg-white dark:bg-slate-800 rounded-lg shadow-lg p-8 ${previewMode ? 'print:shadow-none' : ''}`}
                style={{
                  '--primary-color': customBranding.primaryColor || reportData?.schoolInfo.primaryColor,
                  '--secondary-color': customBranding.secondaryColor || reportData?.schoolInfo.secondaryColor
                } as React.CSSProperties}
              >
                {renderCurrentTemplate()}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Export Loading Overlay */}
      {isExporting && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-lg shadow-xl text-center">
            <RefreshCw className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-gray-900 dark:text-white">Generating PDF...</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsPage;