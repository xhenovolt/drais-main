"use client";
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, Save, Search, Filter, CheckSquare, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

interface Requirement {
  id?: number;
  requirement_item: string;
  description: string;
  quantity: string;
  is_mandatory: boolean;
}

interface ClassRequirementsManagerProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ClassRequirementsManager: React.FC<ClassRequirementsManagerProps> = ({ 
  open, 
  onClose, 
  onSuccess 
}) => {
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [requirements, setRequirements] = useState<Requirement[]>([
    { requirement_item: '', description: '', quantity: '', is_mandatory: true }
  ]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch classes and terms
  const { data: classesData } = useSWR('/api/classes', fetcher);
  const { data: termsData } = useSWR('/api/terms', fetcher);

  // Fetch existing requirements when class and term are selected
  const { data: existingRequirements, mutate } = useSWR(
    selectedClass && selectedTerm 
      ? `/api/requirements/class?class_id=${selectedClass}&term_id=${selectedTerm}`
      : null,
    fetcher
  );

  const classes = classesData?.data || [];
  const terms = termsData?.data || [];

  // Load existing requirements when they're fetched
  useEffect(() => {
    if (existingRequirements?.data?.length > 0) {
      const formattedReqs = existingRequirements.data.map((req: any) => ({
        id: req.id,
        requirement_item: req.requirement_item,
        description: req.description || '',
        quantity: req.quantity || '',
        is_mandatory: req.is_mandatory
      }));
      setRequirements(formattedReqs);
    } else if (selectedClass && selectedTerm) {
      // Reset to empty form when no existing requirements
      setRequirements([
        { requirement_item: '', description: '', quantity: '', is_mandatory: true }
      ]);
    }
  }, [existingRequirements, selectedClass, selectedTerm]);

  const addRequirement = () => {
    setRequirements(prev => [...prev, {
      requirement_item: '',
      description: '',
      quantity: '',
      is_mandatory: true
    }]);
  };

  const removeRequirement = (index: number) => {
    if (requirements.length > 1) {
      setRequirements(prev => prev.filter((_, i) => i !== index));
    }
  };

  const updateRequirement = (index: number, field: keyof Requirement, value: any) => {
    setRequirements(prev => prev.map((req, i) => 
      i === index ? { ...req, [field]: value } : req
    ));
  };

  const handleSave = async () => {
    if (!selectedClass || !selectedTerm) {
      toast.error('Please select a class and term');
      return;
    }

    const validRequirements = requirements.filter(req => req.requirement_item.trim());
    
    if (validRequirements.length === 0) {
      toast.error('Please add at least one requirement');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/requirements/class', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: 1,
          class_id: selectedClass,
          term_id: selectedTerm,
          requirements: validRequirements
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        mutate();
        onSuccess();
      } else {
        toast.error(result.error || 'Failed to save requirements');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('An error occurred while saving requirements');
    } finally {
      setLoading(false);
    }
  };

  const filteredRequirements = requirements.filter(req =>
    !searchQuery || req.requirement_item.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] shadow-2xl overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <CheckSquare className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">
                Class Requirements Manager
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Define requirements for specific classes and terms
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Class and Term Selection */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Class *
              </label>
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="">Choose a class</option>
                {classes.map((cls: any) => (
                  <option key={cls.id} value={cls.id}>{cls.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Select Term *
              </label>
              <select
                value={selectedTerm}
                onChange={(e) => setSelectedTerm(e.target.value)}
                className="w-full px-3 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              >
                <option value="">Choose a term</option>
                {terms.map((term: any) => (
                  <option key={term.id} value={term.id}>
                    {term.name} {term.academic_year && `(${term.academic_year})`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Search Requirements
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search items..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Requirements Table */}
        <div className="p-6 overflow-y-auto max-h-[50vh]">
          {selectedClass && selectedTerm ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                  Requirements List
                </h3>
                <button
                  onClick={addRequirement}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Add Requirement
                </button>
              </div>

              <div className="space-y-3">
                <AnimatePresence>
                  {filteredRequirements.map((req, index) => (
                    <motion.div
                      key={index}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -20 }}
                      className="grid grid-cols-12 gap-4 p-4 bg-gray-50 dark:bg-slate-700 rounded-lg"
                    >
                      <div className="col-span-3">
                        <input
                          type="text"
                          placeholder="Requirement item *"
                          value={req.requirement_item}
                          onChange={(e) => updateRequirement(index, 'requirement_item', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-4">
                        <input
                          type="text"
                          placeholder="Description"
                          value={req.description}
                          onChange={(e) => updateRequirement(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-2">
                        <input
                          type="text"
                          placeholder="Quantity"
                          value={req.quantity}
                          onChange={(e) => updateRequirement(index, 'quantity', e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-800 text-gray-900 dark:text-white"
                        />
                      </div>

                      <div className="col-span-2 flex items-center">
                        <label className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={req.is_mandatory}
                            onChange={(e) => updateRequirement(index, 'is_mandatory', e.target.checked)}
                            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">Mandatory</span>
                        </label>
                      </div>

                      <div className="col-span-1 flex justify-end">
                        <button
                          onClick={() => removeRequirement(index)}
                          disabled={requirements.length === 1}
                          className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>

              {filteredRequirements.length === 0 && searchQuery && (
                <div className="text-center py-8">
                  <Search className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No requirements match your search
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12">
              <Filter className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                Select Class and Term
              </h3>
              <p className="text-gray-500 dark:text-gray-400">
                Choose a class and term to manage requirements
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        {selectedClass && selectedTerm && (
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700">
            <button
              onClick={onClose}
              className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  Save Requirements
                </>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};

export default ClassRequirementsManager;
