"use client";
import React, { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Upload, FileText } from 'lucide-react';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';
import { useDropzone } from 'react-dropzone';

interface AddDocumentModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddDocumentModal: React.FC<AddDocumentModalProps> = ({ open, onClose, onSuccess }) => {
  const [formData, setFormData] = useState({
    student_id: '',
    document_type_id: '',
    issued_by: '',
    issue_date: '',
    notes: ''
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Fetch students and document types
  const { data: studentsData } = useSWR('/api/students/full', fetcher);
  const { data: documentTypesData } = useSWR('/api/document-types', fetcher);

  const students = (studentsData as any)?.data || [];
  const documentTypes = (documentTypesData as any)?.data || [];

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      setSelectedFile(file);
      if (errors.file) {
        setErrors(prev => ({ ...prev, file: '' }));
      }
    }
  }, [errors.file]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    maxSize: 10 * 1024 * 1024 // 10MB
  });

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};

    if (!formData.student_id) newErrors.student_id = 'Student is required';
    if (!formData.document_type_id) newErrors.document_type_id = 'Document type is required';
    if (!selectedFile) newErrors.file = 'File is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setLoading(true);
    try {
      const submitData = new FormData();
      Object.entries(formData).forEach(([key, value]) => {
        submitData.append(key, value);
      });
      if (selectedFile) {
        submitData.append('file', selectedFile);
      }

      const response = await fetch('/api/students/documents', {
        method: 'POST',
        body: submitData
      });

      const result = await response.json();

      if (result.success) {
        toast.success('Document uploaded successfully!');
        onSuccess();
        resetForm();
      } else {
        toast.error(result.error || 'Failed to upload document');
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast.error('An error occurred while uploading document');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      student_id: '', document_type_id: '', issued_by: '', issue_date: '', notes: ''
    });
    setSelectedFile(null);
    setErrors({});
  };

  if (!open) return null;

  // VIEWPORT-SAFE LAYOUT.
  //
  // The previous layout was `flex items-center justify-center p-4` with a
  // single `bg-white rounded-2xl` that contained the whole form. On
  // anything shorter than ~720px (which is most phones and a lot of
  // laptops with the dev tools open) the bottom buttons fell off the
  // screen and the user could not submit. The header also wasn't
  // sticky, so a long student-select dropdown pushed it out of view.
  //
  // The new shell:
  //   - outer: full-viewport flex, top-aligned with `items-start` so
  //     the modal grows down rather than centering and clipping.
  //   - inner: `max-h-[90vh] flex flex-col` so the modal can never
  //     exceed the viewport.
  //   - header + footer: shrink-0 (and sticky in the column flow).
  //   - body: `flex-1 overflow-y-auto` — only the form fields scroll.
  //
  // Form fields all get explicit dark-mode bg / text so they don't
  // render as white-on-slate-800 in dark mode.
  const fieldBase = "w-full px-3 py-2 rounded-lg border bg-white dark:bg-slate-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const fieldOk   = "border-gray-300 dark:border-slate-600";
  const fieldErr  = "border-red-500 dark:border-red-500";

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 sm:p-6 bg-black/50 backdrop-blur-sm overflow-y-auto">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl my-4 sm:my-8 max-h-[90vh] flex flex-col"
        // Stop click-through to backdrop (which would otherwise close)
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — shrink-0 so it never gets squashed by the form */}
        <div className="flex-shrink-0 flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white">Upload Student Document</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form (scrolling body + sticky footer)
            We split <form> into a scrollable body and a non-scrolling
            footer so the submit button is always visible. */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Student <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.student_id}
                  onChange={(e) => handleInputChange('student_id', e.target.value)}
                  className={`${fieldBase} ${errors.student_id ? fieldErr : fieldOk}`}
                >
                  <option value="">{studentsData ? 'Select a student' : 'Loading students…'}</option>
                  {students.map((student: any) => (
                    <option key={student.id} value={student.id}>
                      {student.first_name} {student.last_name} — {student.admission_no}
                    </option>
                  ))}
                </select>
                {errors.student_id && <p className="text-red-500 text-xs mt-1">{errors.student_id}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Document Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.document_type_id}
                  onChange={(e) => handleInputChange('document_type_id', e.target.value)}
                  className={`${fieldBase} ${errors.document_type_id ? fieldErr : fieldOk}`}
                >
                  <option value="">{documentTypesData ? 'Select document type' : 'Loading…'}</option>
                  {documentTypes.map((type: any) => (
                    <option key={type.id} value={type.id}>{type.label}</option>
                  ))}
                </select>
                {errors.document_type_id && <p className="text-red-500 text-xs mt-1">{errors.document_type_id}</p>}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Issued By
                </label>
                <input
                  type="text"
                  value={formData.issued_by}
                  onChange={(e) => handleInputChange('issued_by', e.target.value)}
                  className={`${fieldBase} ${fieldOk}`}
                  placeholder="Who issued this document?"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Issue Date
                </label>
                <input
                  type="date"
                  value={formData.issue_date}
                  onChange={(e) => handleInputChange('issue_date', e.target.value)}
                  className={`${fieldBase} ${fieldOk}`}
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  File Upload <span className="text-red-500">*</span>
                </label>
                <div
                  {...getRootProps()}
                  className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors ${
                    isDragActive
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : errors.file
                      ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-400'
                  }`}
                >
                  <input {...getInputProps()} />
                  {selectedFile ? (
                    <div className="space-y-2">
                      <FileText className="w-12 h-12 text-blue-600 dark:text-blue-400 mx-auto" />
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 break-all">{selectedFile.name}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                        className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                      >
                        Remove file
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Upload className="w-12 h-12 text-gray-400 dark:text-gray-500 mx-auto" />
                      <p className="text-sm text-gray-600 dark:text-gray-300">
                        {isDragActive ? 'Drop the file here' : 'Drag & drop a file here, or click to select'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Supports: PDF, DOC, DOCX, JPG, PNG (Max 10 MB)
                      </p>
                    </div>
                  )}
                </div>
                {errors.file && <p className="text-red-500 text-xs mt-1">{errors.file}</p>}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  rows={3}
                  className={`${fieldBase} ${fieldOk}`}
                  placeholder="Additional notes about this document"
                />
              </div>
            </div>
          </div>

          {/* Footer — never scrolls, always visible. */}
          <div className="flex-shrink-0 flex items-center justify-end gap-3 p-5 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-slate-800 rounded-b-2xl">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50 inline-flex items-center gap-2"
            >
              {loading && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
              {loading ? 'Uploading…' : 'Upload Document'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default AddDocumentModal;
