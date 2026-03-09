"use client";
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { X, CheckSquare, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

interface AddRequirementModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddRequirementModal: React.FC<AddRequirementModalProps> = ({ open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    student_id: '',
    term_id: '',
    requirement_id: '',
    brought: false,
    notes: ''
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [createNewRequirement, setCreateNewRequirement] = useState(false);
  const [newRequirement, setNewRequirement] = useState({
    name: '',
    description: ''
  });

  // Fetch students, terms, and requirements
  const { data: studentsData } = useSWR('/api/students/full', fetcher);
  const { data: termsData } = useSWR('/api/terms', fetcher);
  const { data: requirementsData } = useSWR('/api/requirements/master', fetcher);

  const students = studentsData?.data || [];
  const terms = termsData?.data || [];
  const requirements = requirementsData?.data || [];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleNewRequirementChange = (field: string, value: any) => {
    setNewRequirement(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.student_id) newErrors.student_id = 'Student is required';
    if (!formData.term_id) newErrors.term_id = 'Term is required';
    
    if (createNewRequirement) {
      if (!newRequirement.name.trim()) newErrors.name = 'Requirement name is required';
    } else {
      if (!formData.requirement_id) newErrors.requirement_id = 'Requirement is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      let requirementId = formData.requirement_id;

      // Create new requirement if needed
      if (createNewRequirement) {
        const requirementResponse = await fetch('/api/requirements/master', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            school_id: 1,
            name: newRequirement.name,
            description: newRequirement.description
          })
        });

        const requirementResult = await requirementResponse.json();
        if (!requirementResult.success) {
          throw new Error(requirementResult.error || 'Failed to create requirement');
        }
        requirementId = requirementResult.data.id;
      }

      // Create student requirement record
      const response = await fetch('/api/students/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: formData.student_id,
          term_id: formData.term_id,
          requirement_id: requirementId,
          brought: formData.brought,
          notes: formData.notes
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Requirement added successfully!');
        onSuccess();
        resetForm();
      } else {
        toast.error(result.error || 'Failed to add requirement');
      }
    } catch (error: any) {
      console.error('Submit error:', error);
      toast.error(error.message || 'An error occurred while adding requirement');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '', term_id: '', requirement_id: '', brought: false, notes: ''
    });
    setNewRequirement({ name: '', description: '' });
    setCreateNewRequirement(false);
    setErrors({});
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Add Student Requirement
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Track what students need to bring for a specific term
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Student and Term Selection */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Student *
              </label>
              <select
                value={formData.student_id}
                onChange={(e) => handleInputChange('student_id', e.target.value)}
                className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.student_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              >
                <option value="">Select a student</option>
                {students.map((student: any) => (
                  <option key={student.id} value={student.id}>
                    {student.first_name} {student.last_name} - {student.admission_no}
                  </option>
                ))}
              </select>
              {errors.student_id && (
                <p className="text-red-500 text-xs mt-1">{errors.student_id}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Term *
              </label>
              <select
                value={formData.term_id}
                onChange={(e) => handleInputChange('term_id', e.target.value)}
                className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.term_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              >
                <option value="">Select a term</option>
                {terms.map((term: any) => (
                  <option key={term.id} value={term.id}>
                    {term.name} {term.academic_year && `(${term.academic_year})`}
                  </option>
                ))}
              </select>
              {errors.term_id && (
                <p className="text-red-500 text-xs mt-1">{errors.term_id}</p>
              )}
            </div>
          </div>

          {/* Requirement Selection */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Requirement *
              </label>
              <button
                type="button"
                onClick={() => setCreateNewRequirement(!createNewRequirement)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                {createNewRequirement ? 'Select existing' : 'Create new'}
              </button>
            </div>

            {createNewRequirement ? (
              <div className="space-y-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Requirement Name *
                  </label>
                  <input
                    type="text"
                    value={newRequirement.name}
                    onChange={(e) => handleNewRequirementChange('name', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                      errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                    } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                    placeholder="e.g., Exercise books, Pencils, School fees"
                  />
                  {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name}</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Description
                  </label>
                  <textarea
                    value={newRequirement.description}
                    onChange={(e) => handleNewRequirementChange('description', e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    placeholder="Additional details about this requirement"
                  />
                </div>
              </div>
            ) : (
              <select
                value={formData.requirement_id}
                onChange={(e) => handleInputChange('requirement_id', e.target.value)}
                className={`w-full px-3 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 transition-colors ${
                  errors.requirement_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              >
                <option value="">Select a requirement</option>
                {requirements.map((req: any) => (
                  <option key={req.id} value={req.id}>
                    {req.name} {req.description && `- ${req.description}`}
                  </option>
                ))}
              </select>
            )}
            {!createNewRequirement && errors.requirement_id && (
              <p className="text-red-500 text-xs mt-1">{errors.requirement_id}</p>
            )}
          </div>

          {/* Status and Notes */}
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg">
              <input
                type="checkbox"
                id="brought"
                checked={formData.brought}
                onChange={(e) => handleInputChange('brought', e.target.checked)}
                className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              />
              <label htmlFor="brought" className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Student has brought this requirement
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Notes
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => handleInputChange('notes', e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="Additional notes about this requirement..."
              />
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-6 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Adding...
                </>
              ) : (
                <>
                  <CheckSquare className="w-4 h-4" />
                  Add Requirement
                </>
              )}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddRequirementModal;
