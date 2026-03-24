'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, Loader2, Download, Filter } from 'lucide-react';

interface AcademicYear {
  id: number;
  name: string;
  status: string;
  terms: Term[];
}

interface Term {
  id: number;
  name: string;
  status: string;
}

interface Result {
  student_id: number;
  admission_no: string;
  first_name: string;
  last_name: string;
  class_name: string;
  results: ResultDetail[];
}

interface ResultDetail {
  id: number;
  subject_name: string;
  score: number;
  grade: string;
  exam_date?: string;
  result_type?: string;
}

export default function ResultsPage() {
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [currentTerm, setCurrentTerm] = useState<any>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedTerm, setSelectedTerm] = useState<number | null>(null);
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);

  // Fetch academic years and current term on load
  useEffect(() => {
    fetchInitialData();
  }, []);

  // Fetch results when year/term changes
  useEffect(() => {
    if (selectedYear && selectedTerm) {
      fetchResults();
    }
  }, [selectedYear, selectedTerm]);

  const fetchInitialData = async () => {
    try {
      const [yearsRes, termRes] = await Promise.all([
        fetch('/api/academic/years'),
        fetch('/api/academic/current-term')
      ]);

      const yearsData = await yearsRes.json();
      const termData = await termRes.json();

      setAcademicYears(yearsData);
      setCurrentTerm(termData);

      // Set default to current term
      if (termData) {
        setSelectedYear(termData.academic_year_id);
        setSelectedTerm(termData.id);
      }
    } catch (err) {
      setError('Failed to load academic years');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchResults = async () => {
    if (!selectedYear || !selectedTerm) return;

    setLoading(true);
    try {
      const params = new URLSearchParams({
        academic_year_id: selectedYear.toString(),
        term_id: selectedTerm.toString()
      });

      const res = await fetch(`/api/results/filtered?${params}`);
      const data = await res.json();

      if (data.results) {
        setResults(data.results);
      } else {
        setError(data.error || 'Failed to fetch results');
      }
    } catch (err) {
      setError('Failed to fetch results');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !academicYears.length) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="animate-spin" size={32} />
      </div>
    );
  }

  const currentYearData = academicYears.find(y => y.id === selectedYear);
  const currentTermData = currentYearData?.terms?.find(t => t.id === selectedTerm);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-3xl font-bold">Exam Results</h1>
            <button className="px-4 py-2 border rounded-lg hover:bg-gray-50 flex items-center gap-2">
              <Download size={18} />
              Export CSV
            </button>
          </div>

          {/* Filter Dropdowns */}
          <div className="flex gap-4">
            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <select
                value={selectedYear || ''}
                onChange={(e) => {
                  const yearId = parseInt(e.target.value);
                  setSelectedYear(yearId);
                  // Reset term when year changes
                  const year = academicYears.find(y => y.id === yearId);
                  if (year?.terms?.length) {
                    setSelectedTerm(year.terms[0].id);
                  }
                }}
                className="px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {academicYears.map(year => (
                  <option key={year.id} value={year.id}>
                    {year.name} {year.status === 'active' ? '🟢' : ''}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">Term</label>
              <select
                value={selectedTerm || ''}
                onChange={(e) => setSelectedTerm(parseInt(e.target.value))}
                className="px-4 py-2 border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {currentYearData?.terms?.map(term => (
                  <option key={term.id} value={term.id}>
                    {term.name} {term.status === 'active' ? '🟢' : ''}
                  </option>
                )) || <option>No terms available</option>}
              </select>
            </div>
          </div>

          {/* Info message */}
          {currentTerm && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              📊 Showing results for <strong>{currentYearData?.name}</strong>, <strong>{currentTermData?.name}</strong>
              {currentTerm.id === selectedTerm && ' (current term)'}
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
              {error}
            </div>
          )}
        </div>
      </div>

      {/* Results Table */}
      <div className="max-w-7xl mx-auto px-4 py-6">
        {loading ? (
          <div className="text-center py-12">
            <Loader2 className="animate-spin mx-auto mb-2" size={32} />
            <p className="text-gray-600">Loading results...</p>
          </div>
        ) : results.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border">
            <p className="text-gray-600">No results found for the selected term</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg border overflow-hidden">
            {results.map((studentResults) => (
              <div key={studentResults.student_id} className="border-b last:border-b-0">
                {/* Student Header */}
                <div className="bg-gray-50 px-6 py-4 border-b">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg">
                        {studentResults.first_name} {studentResults.last_name}
                      </h3>
                      <p className="text-sm text-gray-600">
                        {studentResults.admission_no} • {studentResults.class_name}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-4xl font-bold text-blue-600">
                        {studentResults.results.length}
                      </p>
                      <p className="text-xs text-gray-600">Results</p>
                    </div>
                  </div>
                </div>

                {/* Student Results */}
                <div className="p-6">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-2 font-semibold">Subject</th>
                        <th className="text-center py-2 font-semibold">Score</th>
                        <th className="text-center py-2 font-semibold">Grade</th>
                        <th className="text-left py-2 font-semibold">Type</th>
                        <th className="text-left py-2 font-semibold">Exam Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {studentResults.results.map((result) => (
                        <tr key={result.id} className="border-b hover:bg-gray-50">
                          <td className="py-3">{result.subject_name}</td>
                          <td className="text-center py-3 font-medium">{result.score}</td>
                          <td className="text-center py-3">
                            <span className={`px-2 py-1 rounded text-white font-semibold ${getGradeBgColor(result.grade)}`}>
                              {result.grade}
                            </span>
                          </td>
                          <td className="py-3 text-gray-600">{result.result_type || '—'}</td>
                          <td className="py-3 text-gray-600">
                            {result.exam_date ? new Date(result.exam_date).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Stats Footer */}
        {results.length > 0 && (
          <div className="mt-6 grid grid-cols-4 gap-4">
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-blue-600">{results.length}</p>
              <p className="text-sm text-gray-600">Students with Results</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-green-600">
                {results.reduce((sum, r) => sum + r.results.length, 0)}
              </p>
              <p className="text-sm text-gray-600">Total Results</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-purple-600">
                {(
                  results.reduce((sum, r) => sum + r.results.reduce((s, res) => s + res.score, 0), 0) /
                  results.reduce((sum, r) => sum + r.results.length, 0)
                ).toFixed(1)}
              </p>
              <p className="text-sm text-gray-600">Average Score</p>
            </div>
            <div className="bg-white rounded-lg border p-4 text-center">
              <p className="text-3xl font-bold text-orange-600">
                {currentTermData?.name}
              </p>
              <p className="text-sm text-gray-600">Current Filter</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function getGradeBgColor(grade: string) {
  const colors: Record<string, string> = {
    'A': 'bg-green-600',
    'B': 'bg-blue-600',
    'C': 'bg-yellow-600',
    'D': 'bg-orange-600',
    'E': 'bg-red-600',
    'F': 'bg-red-900'
  };
  return colors[grade] || 'bg-gray-600';
}
