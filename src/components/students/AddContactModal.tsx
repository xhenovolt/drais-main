"use client";
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { X, User, Phone, Search, ChevronRight, Plus } from 'lucide-react';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

interface AddContactModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddContactModal: React.FC<AddContactModalProps> = ({ open, onClose, onSuccess }) => {
  const [step, setStep] = useState<'search' | 'form'>('search'); // Two-step workflow
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  
  const [formData, setFormData] = useState({
    student_id: '',
    first_name: '',
    last_name: '',
    phone: '',
    email: '',
    address: '',
    contact_type: 'guardian',
    occupation: '',
    relationship: '',
    is_primary: false
  });
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Fetch students for selection
  const { data: studentsData } = useSWR('/api/students/full', fetcher);
  const students = studentsData?.data || [];

  // Search/filter students
  const filteredStudents = useMemo(() => {
    if (!searchQuery.trim()) return [];
    const query = searchQuery.toLowerCase();
    return students.filter((student: any) => 
      student.first_name?.toLowerCase().includes(query) ||
      student.last_name?.toLowerCase().includes(query) ||
      student.admission_no?.toLowerCase().includes(query)
    ).slice(0, 10); // Limit to 10 results
  }, [searchQuery, students]);

  const handleSelectStudent = (student: any) => {
    setSelectedStudent(student);
    setFormData(prev => ({
      ...prev,
      student_id: student.id,
      first_name: student.first_name || '',
      last_name: student.last_name || ''
    }));
    setSearchQuery('');
    setStep('form');
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.student_id) newErrors.student_id = 'Student is required';
    if (!formData.phone.trim()) newErrors.phone = 'Phone number is required';
    // All other fields are OPTIONAL to speed up data entry

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) {
      toast.error('Student and phone number are required');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/students/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        toast.success('✓ Saved for ' + selectedStudent?.first_name);
        
        // Reset but keep modal open for rapid entries
        setFormData({
          student_id: '',
          first_name: '',
          last_name: '',
          phone: '',
          email: '',
          address: '',
          contact_type: 'guardian',
          occupation: '',
          relationship: '',
          is_primary: false
        });
        setSelectedStudent(null);
        setStep('search');
        onSuccess();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Failed to add contact');
      }
    } catch (err) {
      toast.error('An error occurred');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setFormData({
      student_id: '',
      first_name: '',
      last_name: '',
      phone: '',
      email: '',
      address: '',
      contact_type: 'guardian',
      occupation: '',
      relationship: '',
      is_primary: false
    });
    setSelectedStudent(null);
    setStep('search');
    setSearchQuery('');
    setErrors({});
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-lg shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {step === 'search' ? 'Find Student' : `Phone for ${selectedStudent?.first_name}`}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* STEP 1: SEARCH STUDENT */}
        {step === 'search' && (
          <div className="p-6 space-y-4">
            {/* Search Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4" />
                  <span>Search by name or admission #</span>
                </div>
              </label>
              <input
                type="text"
                placeholder="Type name or admission number..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-700 dark:text-white"
              />
            </div>

            {/* Search Results */}
            {searchQuery.trim() && filteredStudents.length > 0 && (
              <div className="bg-gray-50 dark:bg-slate-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-600">
                {filteredStudents.map((student: any) => (
                  <motion.button
                    key={student.id}
                    onClick={() => handleSelectStudent(student)}
                    whileHover={{ backgroundColor: '#f0f9ff' }}
                    className="w-full px-4 py-3 text-left border-b border-gray-200 dark:border-gray-600 hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors flex items-center justify-between group"
                  >
                    <div className="flex items-center gap-3 flex-1">
                      <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                        <User className="w-5 h-5 text-blue-600 dark:text-blue-300" />
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">
                          {student.first_name} {student.last_name}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {student.admission_no}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400 group-hover:text-blue-600 transition-colors" />
                  </motion.button>
                ))}
              </div>
            )}

            {searchQuery.trim() && filteredStudents.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No students found matching "{searchQuery}"</p>
              </div>
            )}

            {!searchQuery.trim() && (
              <div className="text-center py-12 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Start typing a name or admission number</p>
              </div>
            )}

            {/* Cancel Button */}
            <button
              onClick={onClose}
              className="w-full py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors text-sm"
            >
              Cancel
            </button>
          </div>
        )}

        {/* STEP 2: ADD PHONE */}
        {step === 'form' && selectedStudent && (
          <form onSubmit={handleSubmit} className="p-6 space-y-5">
            {/* Selected Student Info */}
            <div className="bg-blue-50 dark:bg-slate-700 p-4 rounded-lg flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-blue-200 dark:bg-blue-900 flex items-center justify-center">
                <User className="w-5 h-5 text-blue-600 dark:text-blue-300" />
              </div>
              <div>
                <p className="text-sm text-gray-600 dark:text-gray-400">Selected Learner</p>
                <p className="font-semibold text-gray-900 dark:text-white">
                  {selectedStudent.first_name} {selectedStudent.last_name}
                </p>
              </div>
            </div>

            {/* Phone Number - REQUIRED */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>Phone Number *</span>
                </div>
              </label>
              <input
                type="tel"
                placeholder="+966 50 xxx xxxx"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                autoFocus
                className={`w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white ${
                  errors.phone ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
              />
              {errors.phone && <p className="text-red-500 text-xs mt-1">{errors.phone}</p>}
              <p className="text-xs text-gray-500 mt-1">This is what we need for notifications</p>
            </div>

            {/* Advanced Section - Collapsible optional fields */}
            <details className="border-t pt-4">
              <summary className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer hover:text-gray-900 dark:hover:text-white flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Optional Details (to add later)
              </summary>
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    First Name
                  </label>
                  <input
                    type="text"
                    value={formData.first_name}
                    onChange={(e) => handleInputChange('first_name', e.target.value)}
                    placeholder="Contact's first name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={formData.last_name}
                    onChange={(e) => handleInputChange('last_name', e.target.value)}
                    placeholder="Contact's last name"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Relationship
                  </label>
                  <input
                    type="text"
                    value={formData.relationship}
                    onChange={(e) => handleInputChange('relationship', e.target.value)}
                    placeholder="e.g., Father, Mother, Uncle"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Occupation
                  </label>
                  <input
                    type="text"
                    value={formData.occupation}
                    onChange={(e) => handleInputChange('occupation', e.target.value)}
                    placeholder="e.g., Engineer, Teacher"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => handleInputChange('email', e.target.value)}
                    placeholder="Contact email"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 dark:bg-slate-700 dark:text-white"
                  />
                </div>
              </div>
            </details>

            {/* Buttons */}
            <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
              <button
                type="button"
                onClick={() => setStep('search')}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors text-sm font-medium"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 font-medium text-sm"
              >
                {loading ? 'Saving...' : 'Save Phone Number'}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
};

export default AddContactModal;
