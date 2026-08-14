'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, BookOpen, Users, User, ChevronDown, AlertCircle, Check, Search } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/Toast';

interface AssignPortionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  schoolId: number;
  targetStudentId?: number | null;
}

const surahs = [
  'Al-Fatiha', 'Al-Baqarah', 'Aal-E-Imran', 'An-Nisa', 'Al-Maidah', 'Al-An\'am',
  'Al-A\'raf', 'Al-Anfal', 'At-Taubah', 'Yunus', 'Hud', 'Yusuf', 'Ar-Ra\'d',
  'Ibrahim', 'Al-Hijr', 'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Mu\'minun', 'An-Nur', 'Al-Furqan', 'Ash-Shu\'ara',
  'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum', 'Luqman', 'As-Sajdah',
  'Al-Ahzab', 'Saba', 'Fatir', 'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar',
  'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
  'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat',
  'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman', 'Al-Waqi\'ah', 'Al-Hadid',
  'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah', 'As-Saff', 'Al-Jumu\'ah',
  'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk',
  'Al-Qalam', 'Al-Haqqah', 'Al-Ma\'arij', 'Nuh', 'Al-Jinn', 'Al-Muzzammil',
  'Al-Muddaththir', 'Al-Qiyamah', 'Al-Insan', 'Al-Mursalat', 'An-Naba',
  'An-Nazi\'at', 'Abasa', 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin',
  'Al-Inshiqaq', 'Al-Buruj', 'At-Tariq', 'Al-A\'la', 'Al-Ghashiyah',
  'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh',
  'At-Tin', 'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
  'Al-Qari\'ah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil', 'Quraysh',
  'Al-Ma\'un', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr', 'Al-Masad', 'Al-Ikhlas',
  'Al-Falaq', 'An-Nas'
];

const AssignPortionModal: React.FC<AssignPortionModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  schoolId,
  targetStudentId
}) => {
  const [step, setStep] = useState(1);
  const [targetType, setTargetType] = useState<'individual' | 'group'>('individual');
  const [selectedStudents, setSelectedStudents] = useState<number[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<number | null>(null);
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const [portionType, setPortionType] = useState<'ayah' | 'page' | 'custom'>('ayah');
  
  // Portion details
  const [surahName, setSurahName] = useState('');
  const [ayahFrom, setAyahFrom] = useState<number | ''>('');
  const [ayahTo, setAyahTo] = useState<number | ''>('');
  const [pageFrom, setPageFrom] = useState<number | ''>('');
  const [pageTo, setPageTo] = useState<number | ''>('');
  const [juzNumber, setJuzNumber] = useState<number | ''>('');
  const [portionName, setPortionName] = useState('');
  const [difficultyLevel, setDifficultyLevel] = useState<'easy' | 'medium' | 'hard'>('medium');
  const [estimatedDays, setEstimatedDays] = useState<number>(1);
  const [notes, setNotes] = useState('');
  const [portionTypeCategory, setPortionTypeCategory] = useState<'tilawa' | 'hifz' | 'muraja' | 'other'>('hifz');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedStudents(targetStudentId ? [targetStudentId] : []);
      setTargetType(targetStudentId ? 'individual' : 'individual');
      setSelectedGroup(null);
      setSelectedBook(null);
      setPortionType('ayah');
      setSurahName('');
      setAyahFrom('');
      setAyahTo('');
      setPageFrom('');
      setPageTo('');
      setJuzNumber('');
      setPortionName('');
      setDifficultyLevel('medium');
      setEstimatedDays(1);
      setNotes('');
      setPortionTypeCategory('hifz');
      setStudentSearch('');
    }
  }, [isOpen, targetStudentId]);

  // Fetch books
  const { data: books = [] } = useQuery({
    queryKey: ['tahfiz-books', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/tahfiz/books?school_id=${schoolId}`);
      if (!response.ok) throw new Error('Failed to fetch books');
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen
  });

  // Fetch groups
  const { data: groups = [] } = useQuery({
    queryKey: ['tahfiz-groups', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/tahfiz/groups?school_id=${schoolId}`);
      if (!response.ok) throw new Error('Failed to fetch groups');
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen && targetType === 'group'
  });

  // Fetch students for individual selection
  const { data: students = [] } = useQuery({
    queryKey: ['tahfiz-students', schoolId],
    queryFn: async () => {
      const response = await fetch(`/api/tahfiz/students?school_id=${schoolId}`);
      if (!response.ok) throw new Error('Failed to fetch students');
      const data = await response.json();
      return data.data;
    },
    enabled: isOpen && targetType === 'individual'
  });

  // Auto-generate portion name
  useEffect(() => {
    if (portionType === 'ayah' && surahName && ayahFrom && ayahTo) {
      setPortionName(`Surah ${surahName}: ${ayahFrom}-${ayahTo}`);
    } else if (portionType === 'page' && pageFrom && pageTo) {
      setPortionName(`Pages ${pageFrom}-${pageTo}`);
    } else if (portionType === 'custom' && !portionName) {
      setPortionName('');
    }
  }, [portionType, surahName, ayahFrom, ayahTo, pageFrom, pageTo]);

  // Create portion mutation
  const createPortionMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch('/api/tahfiz/portions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      if (!response.ok) throw new Error('Failed to create portion');
      return response.json();
    },
    onSuccess: () => {
      showToast('success', 'Portion(s) assigned successfully');
      onSuccess();
      onClose();
    },
    onError: (error: any) => {
      showToast('error', error.message || 'Failed to assign portion');
    }
  });

  const handleSubmit = () => {
    if (!portionName.trim()) {
      showToast('error', 'Portion name is required');
      return;
    }

    const targetStudentIds = targetType === 'group' && selectedGroup
      ? [] // Will be handled by backend based on group_id
      : selectedStudents;

    if (targetType === 'individual' && targetStudentIds.length === 0) {
      showToast('error', 'Please select at least one student');
      return;
    }

    if (targetType === 'group' && !selectedGroup) {
      showToast('error', 'Please select a group');
      return;
    }

    const data = {
      school_id: schoolId,
      ...(targetType === 'individual' && { student_ids: targetStudentIds }),
      ...(targetType === 'group' && { group_id: selectedGroup }),
      book_id: selectedBook,
      portion_name: portionName,
      surah_name: portionType === 'ayah' ? surahName : null,
      ayah_from: portionType === 'ayah' && ayahFrom ? Number(ayahFrom) : null,
      ayah_to: portionType === 'ayah' && ayahTo ? Number(ayahTo) : null,
      page_from: portionType === 'page' && pageFrom ? Number(pageFrom) : null,
      page_to: portionType === 'page' && pageTo ? Number(pageTo) : null,
      juz_number: juzNumber ? Number(juzNumber) : null,
      difficulty_level: difficultyLevel,
      estimated_days: estimatedDays,
      notes: notes.trim() || null,
      type: portionTypeCategory
    };

    createPortionMutation.mutate(data);
  };

  const filteredStudents = students.filter((student: any) =>
    student.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
    (student.admission_no && student.admission_no.toLowerCase().includes(studentSearch.toLowerCase()))
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div>
            <h2 className="text-xl font-semibold text-foreground">Assign Portion</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Step {step} of 3 - {step === 1 ? 'Select Target' : step === 2 ? 'Choose Book & Portion' : 'Confirm Details'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-muted rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-6">
              {/* Target Type Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Assign to:</label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => setTargetType('individual')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      targetType === 'individual'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-border hover:border-border'
                    }`}
                  >
                    <User className="w-6 h-6 mx-auto mb-2" />
                    <span className="font-medium">Individual Students</span>
                  </button>
                  <button
                    onClick={() => setTargetType('group')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      targetType === 'group'
                        ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                        : 'border-border hover:border-border'
                    }`}
                  >
                    <Users className="w-6 h-6 mx-auto mb-2" />
                    <span className="font-medium">Group</span>
                  </button>
                </div>
              </div>

              {/* Individual Student Selection */}
              {targetType === 'individual' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">
                    Select Students ({selectedStudents.length} selected)
                  </label>
                  
                  {/* Search */}
                  <div className="relative mb-4">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                    <input
                      type="text"
                      placeholder="Search students..."
                      value={studentSearch}
                      onChange={(e) => setStudentSearch(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>

                  <div className="max-h-64 overflow-y-auto border border-border rounded-lg">
                    {filteredStudents.map((student: any) => (
                      <div
                        key={student.id}
                        className="flex items-center p-3 hover:bg-muted border-b border-gray-100 last:border-b-0"
                      >
                        <input
                          type="checkbox"
                          checked={selectedStudents.includes(student.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedStudents([...selectedStudents, student.id]);
                            } else {
                              setSelectedStudents(selectedStudents.filter(id => id !== student.id));
                            }
                          }}
                          className="rounded border-border text-emerald-600 focus:ring-emerald-500"
                        />
                        <div className="ml-3 flex-1">
                          <p className="font-medium text-foreground">{student.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {student.admission_no} • {student.group_name || 'No Group'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Group Selection */}
              {targetType === 'group' && (
                <div>
                  <label className="block text-sm font-medium text-foreground mb-3">Select Group</label>
                  <select
                    value={selectedGroup || ''}
                    onChange={(e) => setSelectedGroup(e.target.value ? Number(e.target.value) : null)}
                    className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                  >
                    <option value="">Choose a group...</option>
                    {groups.map((group: any) => (
                      <option key={group.id} value={group.id}>
                        {group.name} ({group.member_count || 0} students)
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              {/* Book Selection */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Book (Optional)</label>
                <select
                  value={selectedBook || ''}
                  onChange={(e) => setSelectedBook(e.target.value ? Number(e.target.value) : null)}
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                >
                  <option value="">No specific book</option>
                  {books.map((book: any) => (
                    <option key={book.id} value={book.id}>
                      {book.title} ({book.unit_type})
                    </option>
                  ))}
                </select>
              </div>

              {/* Portion Type */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Portion Type</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { value: 'ayah', label: 'By Ayah', icon: BookOpen },
                    { value: 'page', label: 'By Page', icon: BookOpen },
                    { value: 'custom', label: 'Custom', icon: BookOpen }
                  ].map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      onClick={() => setPortionType(value as any)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        portionType === value
                          ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                          : 'border-border hover:border-border'
                      }`}
                    >
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <span className="text-sm font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Ayah-based portion */}
              {portionType === 'ayah' && (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">Surah</label>
                    <select
                      value={surahName}
                      onChange={(e) => setSurahName(e.target.value)}
                      className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    >
                      <option value="">Select Surah...</option>
                      {surahs.map((surah, index) => (
                        <option key={index} value={surah}>
                          {index + 1}. {surah}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">From Ayah</label>
                      <input
                        type="number"
                        min="1"
                        value={ayahFrom}
                        onChange={(e) => setAyahFrom(e.target.value ? Number(e.target.value) : '')}
                        className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">To Ayah</label>
                      <input
                        type="number"
                        min="1"
                        value={ayahTo}
                        onChange={(e) => setAyahTo(e.target.value ? Number(e.target.value) : '')}
                        className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-foreground mb-2">Juz (Optional)</label>
                      <input
                        type="number"
                        min="1"
                        max="30"
                        value={juzNumber}
                        onChange={(e) => setJuzNumber(e.target.value ? Number(e.target.value) : '')}
                        className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Page-based portion */}
              {portionType === 'page' && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">From Page</label>
                    <input
                      type="number"
                      min="1"
                      value={pageFrom}
                      onChange={(e) => setPageFrom(e.target.value ? Number(e.target.value) : '')}
                      className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-foreground mb-2">To Page</label>
                    <input
                      type="number"
                      min="1"
                      value={pageTo}
                      onChange={(e) => setPageTo(e.target.value ? Number(e.target.value) : '')}
                      className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
              )}

              {/* Custom portion name */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Portion Name</label>
                <input
                  type="text"
                  value={portionName}
                  onChange={(e) => setPortionName(e.target.value)}
                  placeholder="Enter portion name..."
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-6">
              {/* Portion Category */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Portion Type</label>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { value: 'hifz', label: 'Hifz', color: 'emerald' },
                    { value: 'tilawa', label: 'Tilawa', color: 'blue' },
                    { value: 'muraja', label: 'Muraja', color: 'purple' },
                    { value: 'other', label: 'Other', color: 'gray' }
                  ].map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => setPortionTypeCategory(value as any)}
                      className={`p-2 rounded-lg text-sm font-medium transition-all ${
                        portionTypeCategory === value
                          ? `bg-${color}-100 text-${color}-700 border-2 border-${color}-500`
                          : 'bg-muted text-foreground border-2 border-border hover:border-border'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Difficulty Level */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-3">Difficulty Level</label>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { value: 'easy', label: 'Easy', color: 'green' },
                    { value: 'medium', label: 'Medium', color: 'yellow' },
                    { value: 'hard', label: 'Hard', color: 'red' }
                  ].map(({ value, label, color }) => (
                    <button
                      key={value}
                      onClick={() => setDifficultyLevel(value as any)}
                      className={`p-3 rounded-lg border-2 transition-all ${
                        difficultyLevel === value
                          ? `border-${color}-500 bg-${color}-50 text-${color}-700`
                          : 'border-border hover:border-border'
                      }`}
                    >
                      <span className="font-medium">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Estimated Days */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  Estimated Days: {estimatedDays}
                </label>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={estimatedDays}
                  onChange={(e) => setEstimatedDays(Number(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                  <span>1 day</span>
                  <span>30 days</span>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">Notes (Optional)</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any additional notes or instructions..."
                  className="w-full p-3 border border-border rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                />
              </div>

              {/* Summary */}
              <div className="bg-muted rounded-lg p-4">
                <h4 className="font-medium text-foreground mb-2">Assignment Summary</h4>
                <div className="space-y-1 text-sm text-muted-foreground">
                  <p><span className="font-medium">Target:</span> {
                    targetType === 'individual' 
                      ? `${selectedStudents.length} student(s)`
                      : groups.find(g => g.id === selectedGroup)?.name || 'Unknown group'
                  }</p>
                  <p><span className="font-medium">Portion:</span> {portionName}</p>
                  <p><span className="font-medium">Type:</span> {portionTypeCategory.charAt(0).toUpperCase() + portionTypeCategory.slice(1)}</p>
                  <p><span className="font-medium">Difficulty:</span> {difficultyLevel.charAt(0).toUpperCase() + difficultyLevel.slice(1)}</p>
                  <p><span className="font-medium">Estimated Duration:</span> {estimatedDays} day(s)</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 bg-muted rounded-b-2xl">
          <div>
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium"
              >
                Back
              </button>
            )}
          </div>
          
          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-muted-foreground hover:text-foreground font-medium"
            >
              Cancel
            </button>
            
            {step < 3 ? (
              <button
                onClick={() => setStep(step + 1)}
                disabled={
                  (step === 1 && targetType === 'individual' && selectedStudents.length === 0) ||
                  (step === 1 && targetType === 'group' && !selectedGroup) ||
                  (step === 2 && !portionName.trim())
                }
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={createPortionMutation.isPending || !portionName.trim()}
                className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center space-x-2"
              >
                {createPortionMutation.isPending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Assigning...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Assign Portion</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AssignPortionModal;
