"use client";
import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { t } from '@/lib/i18n';
import { Search, ChevronLeft, ChevronRight, RefreshCw, Loader2, Plus, Edit2, Trash2 } from 'lucide-react';
import { Dialog, Transition } from '@headlessui/react';
import { X } from 'lucide-react';
import { toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const API_BASE = '/api';
const fetcher = (u: string) => fetch(u).then(r => r.json());

interface Subject {
  id: number;
  name: string;
  code?: string;
  subject_type?: string;
  academic_type?: string;
}

export const SubjectsManager: React.FC = () => {
  const { mutate } = useSWR(`${API_BASE}/subjects`, fetcher);
  
  const [items, setItems] = useState<Subject[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    code: '', 
    subject_type: 'core',
    academic_type: 'secular'
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  
  const perPage = 10;

  // Load subjects from API with enhanced error handling
  const load = async () => {
    setLoading(true);
    setFormErrors({});
    try {
      const response = await fetch(`${API_BASE}/subjects?search=${encodeURIComponent(search)}&page=${page}&limit=${perPage}`);
      const result = await response.json();
      
      if (response.ok) {
        // Handle the actual API response format: { data: [...] }
        const subjects = result.data || [];
        setItems(subjects);
        setTotal(result.total || subjects.length);
        
        console.log('Loaded subjects:', subjects.length, 'items');
      } else {
        toast.error(result.error || 'Failed to load subjects');
        setItems([]);
        setTotal(0);
      }
    } catch (error) {
      console.error('Error loading subjects:', error);
      toast.error('Network error: Failed to load subjects');
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  // Validate form data
  const validateForm = () => {
    const errors: Record<string, string> = {};
    
    if (!formData.name.trim()) {
      errors.name = 'Subject name is required';
    } else if (formData.name.trim().length > 100) {
      errors.name = 'Subject name must not exceed 100 characters';
    }
    
    if (formData.code && formData.code.length > 20) {
      errors.code = 'Subject code must not exceed 20 characters';
    }
    
    const validTypes = ['core', 'elective', 'tahfiz', 'extra'];
    if (formData.subject_type && !validTypes.includes(formData.subject_type)) {
      errors.subject_type = 'Invalid subject type';
    }
    
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Add new subject with optimistic updates
  const addSubject = async () => {
    if (!validateForm()) {
      return;
    }
    
    setSubmitting(true);
    const tempId = Date.now(); // Temporary ID for optimistic update
    const optimisticSubject = { id: tempId, ...formData };
    
    // Optimistic update
    setItems(prev => [optimisticSubject, ...prev]);
    setTotal(prev => prev + 1);
    
    try {
      const response = await fetch(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success === true) {
        toast.success('Subject added successfully');
        resetForm();
        
        // Replace optimistic item with real data using returned ID
        const newSubject = { id: result.id, ...formData };
        setItems(prev => prev.map(item => 
          item.id === tempId ? newSubject : item
        ));
        
        // Refresh data to ensure consistency
        await load();
      } else {
        // Revert optimistic update
        setItems(prev => prev.filter(item => item.id !== tempId));
        setTotal(prev => prev - 1);
        
        if (result.error) {
          toast.error(result.error);
          
          // Handle specific field errors
          if (result.error.includes('name')) {
            setFormErrors(prev => ({ ...prev, name: result.error }));
          } else if (result.error.includes('code')) {
            setFormErrors(prev => ({ ...prev, code: result.error }));
          }
        } else {
          toast.error('Failed to add subject');
        }
      }
    } catch (error) {
      console.error('Error adding subject:', error);
      console.error('Network error details:', error);
      
      // Revert optimistic update
      setItems(prev => prev.filter(item => item.id !== tempId));
      setTotal(prev => prev - 1);
      
      toast.error('Network error: Failed to add subject');
    } finally {
      setSubmitting(false);
    }
  };

  // Edit existing subject with optimistic updates
  const editSubject = async (id: number) => {
    if (!validateForm()) {
      return;
    }
    
    if (!id || id <= 0) {
      toast.error('Invalid subject ID');
      return;
    }
    
    setSubmitting(true);
    const originalItem = items.find(item => item.id === id);
    
    // Optimistic update
    setItems(prev => prev.map(item => 
      item.id === id ? { ...item, ...formData } : item
    ));
    
    try {
      const response = await fetch(`${API_BASE}/subjects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...formData }),
      });
      
      const result = await response.json();
      
      if (response.ok && result.success === true) {
        toast.success('Subject updated successfully');
        resetForm();
        
        // Update with form data since API only returns {success: true, id}
        const updatedSubject = { id, ...formData };
        setItems(prev => prev.map(item => 
          item.id === id ? updatedSubject : item
        ));
        
        // Refresh data to ensure consistency
        await load();
      } else {
        // Revert optimistic update
        if (originalItem) {
          setItems(prev => prev.map(item => 
            item.id === id ? originalItem : item
          ));
        }
        
        if (result.error) {
          toast.error(result.error);
          
          // Handle specific field errors
          if (result.error.includes('name')) {
            setFormErrors(prev => ({ ...prev, name: result.error }));
          } else if (result.error.includes('code')) {
            setFormErrors(prev => ({ ...prev, code: result.error }));
          }
        } else {
          toast.error('Failed to update subject');
        }
      }
    } catch (error) {
      console.error('Error updating subject:', error);
      console.error('Response received:', error);
      
      // Revert optimistic update
      if (originalItem) {
        setItems(prev => prev.map(item => 
          item.id === id ? originalItem : item
        ));
      }
      
      toast.error('Network error: Failed to update subject');
    } finally {
      setSubmitting(false);
    }
  };

  // Delete subject with optimistic updates
  const deleteSubject = async (id: number) => {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: 'You won\'t be able to revert this!',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes, delete it!',
      showLoaderOnConfirm: true,
      preConfirm: async () => {
        try {
          const response = await fetch(`${API_BASE}/subjects?id=${id}`, {
            method: 'DELETE',
          });
          
          const result = await response.json();
          
          if (!response.ok || result.success !== true) {
            throw new Error(result.error || 'Failed to delete subject');
          }
          
          return result;
        } catch (error) {
          Swal.showValidationMessage(`Request failed: ${error}`);
        }
      },
      allowOutsideClick: () => !Swal.isLoading()
    });
    
    if (result.isConfirmed && result.value) {
      // Optimistic update
      const deletedItem = items.find(item => item.id === id);
      setItems(prev => prev.filter(item => item.id !== id));
      setTotal(prev => prev - 1);
      
      toast.success('Subject deleted successfully');
      
      // Refresh data to ensure consistency
      await load();
    }
  };

  // Reset form and close modal
  const resetForm = () => {
    setFormData({ name: '', code: '', subject_type: 'core', academic_type: 'secular' });
    setEditingId(null);
    setIsModalOpen(false);
    setFormErrors({});
  };

  // Open modal for adding
  const openAddModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  // Open modal for editing
  const openEditModal = (subject: Subject) => {
    if (!subject || !subject.id) {
      toast.error('Invalid subject data');
      return;
    }
    
    setFormData({
      name: subject.name || '',
      code: subject.code || '',
      subject_type: subject.subject_type || 'core',
      academic_type: subject.academic_type || 'secular'
    });
    setEditingId(subject.id);
    setFormErrors({});
    setIsModalOpen(true);
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (submitting) return; // Prevent double submission
    
    if (editingId) {
      await editSubject(editingId);
    } else {
      await addSubject();
    }
  };

  // Handle input changes with validation
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    
    // Clear specific field error when user starts typing
    if (formErrors[name]) {
      setFormErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
  };

  // Load data on component mount and when dependencies change
  useEffect(() => {
    console.log('SubjectsManager: Loading data... page:', page, 'search:', search);
    const debounceTimer = setTimeout(() => {
      load();
    }, search ? 300 : 0); // Debounce search

    return () => clearTimeout(debounceTimer);
  }, [page, search]);

  return (
    <div className="space-y-6 p-6">
      {/* Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 bg-clip-text text-transparent">
            Subjects Management
          </h1>
          <div className="relative">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load()}
              placeholder="Search subjects..."
              className="w-80 px-4 py-2 pl-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all"
            />
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={load}
            disabled={loading}
            className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 flex items-center gap-2 transition-all"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          
          <button 
            onClick={openAddModal} 
            className="px-6 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-105 flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Subject
          </button>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden border border-gray-200 dark:border-gray-700">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gradient-to-r from-blue-600 via-purple-600 to-pink-600 text-white">
              <tr>
                <th className="text-left px-6 py-4 font-semibold">Subject Name</th>
                <th className="text-left px-6 py-4 font-semibold">Code</th>
                <th className="text-left px-6 py-4 font-semibold">Type</th>
                <th className="text-center px-6 py-4 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  <td className="px-6 py-4 font-medium text-gray-900 dark:text-gray-100">
                    {item.name}
                  </td>
                  <td className="px-6 py-4 text-gray-600 dark:text-gray-400">
                    {item.code || '-'}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.subject_type === 'core' 
                        ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                        : item.subject_type === 'tahfiz'
                        ? 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200'
                        : 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200'
                    }`}>
                      {item.subject_type ? item.subject_type.charAt(0).toUpperCase() + item.subject_type.slice(1) : 'Core'}
                    </span>
                    {' '}
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      item.academic_type === 'theology'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                    }`}>
                      {item.academic_type === 'theology' ? 'Theology' : 'Secular'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => openEditModal(item)}
                        className="p-2 text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-900 rounded-lg transition-colors"
                        title="Edit Subject"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteSubject(item.id)}
                        className="p-2 text-red-600 hover:bg-red-100 dark:hover:bg-red-900 rounded-lg transition-colors"
                        title="Delete Subject"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              
              {!loading && items.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-12 text-center text-gray-500 dark:text-gray-400">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-8 h-8 text-gray-300" />
                      <p>No subjects found</p>
                      <button 
                        onClick={openAddModal}
                        className="mt-2 text-blue-600 hover:text-blue-800 transition-colors"
                      >
                        Add your first subject
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          
          {loading && (
            <div className="flex items-center justify-center py-8 text-gray-500">
              <Loader2 className="w-6 h-6 animate-spin mr-2" />
              Loading subjects...
            </div>
          )}
        </div>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 px-6 py-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
        <span className="text-sm text-gray-600 dark:text-gray-400">
          Showing {items.length} of {total} subjects
        </span>
        <div className="flex items-center gap-2">
          <button
            disabled={page === 1}
            onClick={() => setPage((p) => p - 1)}
            className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-300">
            Page {page} of {Math.ceil(total / perPage)}
          </span>
          <button
            disabled={page >= Math.ceil(total / perPage)}
            onClick={() => setPage((p) => p + 1)}
            className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Modal */}
      <Transition appear show={isModalOpen} as={React.Fragment}>
        <Dialog as="div" className="relative z-[9999]" onClose={resetForm}>
          <Transition.Child
            as={React.Fragment}
            enter="ease-out duration-500"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-300"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-gradient-to-br from-black/20 via-slate-900/30 to-black/40 backdrop-blur-md backdrop-saturate-150" />
          </Transition.Child>

          <div className="fixed inset-0 overflow-y-auto">
            <div className="flex items-center justify-center min-h-full p-4">
              <Transition.Child
                as={React.Fragment}
                enter="ease-out duration-500"
                enterFrom="opacity-0 scale-90 translate-y-8"
                enterTo="opacity-100 scale-100 translate-y-0"
                leave="ease-in duration-300"
                leaveFrom="opacity-100 scale-100 translate-y-0"
                leaveTo="opacity-0 scale-90 translate-y-8"
              >
                <Dialog.Panel className="w-full max-w-md p-8 bg-white/95 dark:bg-gray-800/95 backdrop-blur-xl backdrop-saturate-150 rounded-3xl shadow-2xl border border-white/20 dark:border-gray-700/30">
                  <div className="flex items-center justify-between mb-8">
                    <Dialog.Title className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {editingId ? 'Edit Subject' : 'Add New Subject'}
                    </Dialog.Title>
                    <button 
                      onClick={resetForm} 
                      disabled={submitting}
                      className="p-3 rounded-full hover:bg-gray-100/80 dark:hover:bg-gray-700/80 transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                    >
                      <X className="w-5 h-5 text-gray-500" />
                    </button>
                  </div>

                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Subject Name *
                      </label>
                      <input
                        id="name"
                        name="name"
                        type="text"
                        required
                        value={formData.name}
                        onChange={handleInputChange}
                        disabled={submitting}
                        className={`w-full px-4 py-3 rounded-xl border ${
                          formErrors.name 
                            ? 'border-red-500/60 focus:ring-red-500/60 focus:border-red-500/60' 
                            : 'border-gray-300/60 dark:border-gray-600/60 focus:ring-blue-500/60 focus:border-blue-500/60'
                        } bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-50`}
                        placeholder="Enter subject name"
                      />
                      {formErrors.name && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formErrors.name}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="code" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Subject Code
                      </label>
                      <input
                        id="code"
                        name="code"
                        type="text"
                        value={formData.code}
                        onChange={handleInputChange}
                        disabled={submitting}
                        className={`w-full px-4 py-3 rounded-xl border ${
                          formErrors.code 
                            ? 'border-red-500/60 focus:ring-red-500/60 focus:border-red-500/60' 
                            : 'border-gray-300/60 dark:border-gray-600/60 focus:ring-blue-500/60 focus:border-blue-500/60'
                        } bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-50`}
                        placeholder="Enter subject code"
                      />
                      {formErrors.code && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formErrors.code}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="subject_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Subject Type
                      </label>
                      <select
                        id="subject_type"
                        name="subject_type"
                        value={formData.subject_type}
                        onChange={handleInputChange}
                        disabled={submitting}
                        className={`w-full px-4 py-3 rounded-xl border ${
                          formErrors.subject_type 
                            ? 'border-red-500/60 focus:ring-red-500/60 focus:border-red-500/60' 
                            : 'border-gray-300/60 dark:border-gray-600/60 focus:ring-blue-500/60 focus:border-blue-500/60'
                        } bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-50`}
                      >
                        <option value="core">Core</option>
                        <option value="elective">Elective</option>
                        <option value="tahfiz">Tahfiz</option>
                        <option value="extra">Extra-curricular</option>
                      </select>
                      {formErrors.subject_type && (
                        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{formErrors.subject_type}</p>
                      )}
                    </div>

                    <div>
                      <label htmlFor="academic_type" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                        Academic Stream
                      </label>
                      <select
                        id="academic_type"
                        name="academic_type"
                        value={formData.academic_type}
                        onChange={handleInputChange}
                        disabled={submitting}
                        className="w-full px-4 py-3 rounded-xl border border-gray-300/60 dark:border-gray-600/60 focus:ring-blue-500/60 focus:border-blue-500/60 bg-white/70 dark:bg-gray-700/70 backdrop-blur-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 transition-all duration-200 disabled:opacity-50"
                      >
                        <option value="secular">Secular</option>
                        <option value="theology">Theology</option>
                      </select>
                    </div>

                    <div className="flex justify-end gap-4 pt-6">
                      <button 
                        type="button"
                        onClick={resetForm}
                        disabled={submitting}
                        className="px-6 py-3 text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-100/50 dark:hover:bg-gray-700/50 rounded-xl transition-all duration-200 backdrop-blur-sm disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button 
                        type="submit" 
                        disabled={submitting}
                        className="px-8 py-3 bg-gradient-to-r from-blue-500/90 to-purple-600/90 hover:from-blue-600 hover:to-purple-700 text-white rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 transform hover:scale-[1.02] backdrop-blur-sm disabled:opacity-50 disabled:transform-none disabled:hover:shadow-lg flex items-center gap-2"
                      >
                        {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                        {submitting 
                          ? (editingId ? 'Updating...' : 'Adding...') 
                          : (editingId ? 'Update Subject' : 'Add Subject')
                        }
                      </button>
                    </div>
                  </form>
                </Dialog.Panel>
              </Transition.Child>
            </div>
          </div>
        </Dialog>
      </Transition>
    </div>
  );
};

export default SubjectsManager;