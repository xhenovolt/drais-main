"use client";
import React, { useState, useEffect, Fragment, useRef, useCallback } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { X, Loader2, User, Check, Camera, Upload, Image as ImageIcon } from 'lucide-react';
import useSWRImmutable from 'swr/immutable';
import { useDropzone } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import Swal from 'sweetalert2';

const API_BASE = '/api';

interface EditStudentWizardProps {
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  student: any;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export const EditStudentWizard: React.FC<EditStudentWizardProps> = ({ open, onClose, onUpdated, student }) => {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState<any>({});
  const [message, setMessage] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const { data: classData } = useSWRImmutable(`${API_BASE}/classes`, fetcher);
  const classOptions = classData?.data || [];

  // Initialize form data when modal opens
  useEffect(() => {
    if (open && student) {
      console.log('Student data received:', student); // Debug log
      setFormData({
        id: student.id,
        first_name: student.first_name || '',
        last_name: student.last_name || '',
        other_name: student.other_name || '',
        gender: student.gender || '',
        date_of_birth: student.date_of_birth || '',
        phone: student.phone || '',
        email: student.email || '',
        address: student.address || '',
        class_id: student.class_id || '',
        status: student.status || 'active',
        photo_url: student.photo_url || '',
        person_id: student.person_id || '' // This should come from the student data
      });
      // Reset photo states
      setPhotoFile(null);
      setPhotoPreview('');
    }
  }, [open, student]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev: any) => ({ ...prev, [name]: value }));
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        Swal.fire({
          title: 'Invalid File',
          text: 'Please select an image file.',
          icon: 'error',
          customClass: { popup: 'rounded-2xl' }
        });
        return;
      }

      // Validate file size (5MB limit)
      if (file.size > 5 * 1024 * 1024) {
        Swal.fire({
          title: 'File Too Large',
          text: 'Please select an image smaller than 5MB.',
          icon: 'error',
          customClass: { popup: 'rounded-2xl' }
        });
        return;
      }

      setPhotoFile(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.jpeg', '.jpg', '.png', '.gif', '.webp']
    },
    multiple: false,
    maxSize: 5 * 1024 * 1024,
  });

  const removePhoto = () => {
    if (photoPreview) {
      URL.revokeObjectURL(photoPreview);
    }
    setPhotoFile(null);
    setPhotoPreview('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      let photoUrl = formData.photo_url;

      // Upload photo if a new one was selected
      if (photoFile) {
        setUploadingPhoto(true);
        
        const photoFormData = new FormData();
        photoFormData.append('photo', photoFile);
        // Send student_id instead of person_id - the API will fetch person_id from student record
        photoFormData.append('student_id', formData.id?.toString() || '');
        
        console.log('Uploading photo for student ID:', formData.id); // Debug log

        const photoResponse = await fetch('/api/students/upload-photo', {
          method: 'POST',
          body: photoFormData,
        });

        const photoResult = await photoResponse.json();
        console.log('Photo upload result:', photoResult); // Debug log
        
        if (photoResult.success) {
          photoUrl = photoResult.photo_url;
        } else {
          throw new Error(photoResult.error || 'Failed to upload photo');
        }
        
        setUploadingPhoto(false);
      }

      // Submit the form data
      const finalData = { ...formData, photo_url: photoUrl };
      console.log('Submitting final data:', finalData); // Debug log
      
      const response = await fetch(`${API_BASE}/students/edit`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(finalData),
      });

      const result = await response.json();
      console.log('Update result:', result); // Debug log
      
      if (result.success) {
        await Swal.fire({
          title: 'Success!',
          text: 'Student updated successfully.',
          icon: 'success',
          timer: 3000,
          showConfirmButton: false,
          customClass: { popup: 'rounded-2xl' }
        });
        onUpdated();
        onClose();
      } else {
        throw new Error(result.error || 'Failed to update student');
      }
    } catch (error: any) {
      console.error('Update error:', error);
      Swal.fire({
        title: 'Error',
        text: error.message || 'An unexpected error occurred',
        icon: 'error',
        customClass: { popup: 'rounded-2xl' }
      });
    } finally {
      setLoading(false);
      setUploadingPhoto(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          transition={{ duration: 0.3 }}
          className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[95vh] flex flex-col overflow-visible"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-orange-50 to-red-50 dark:from-slate-700 dark:to-slate-600 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-600 to-red-600 flex items-center justify-center shadow-lg">
                <User className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Edit Student
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Update {student?.first_name} {student?.last_name}&apos;s information
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-xl transition-all duration-200 hover:scale-110"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="p-6">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                  {/* Photo Upload Section */}
                  <div className="lg:col-span-1 space-y-4">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                      <Camera className="w-5 h-5" />
                      Student Photo
                    </h3>
                    
                    {photoPreview || formData.photo_url ? (
                      <div className="relative group">
                        <img
                          src={photoPreview || formData.photo_url}
                          alt="Student"
                          className="w-full aspect-square object-cover rounded-2xl shadow-lg ring-4 ring-white dark:ring-slate-600"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-200 rounded-2xl flex items-center justify-center">
                          <button
                            type="button"
                            onClick={removePhoto}
                            className="p-2 bg-red-600 hover:bg-red-700 text-white rounded-xl transition-all duration-200 hover:scale-110"
                            title="Remove photo"
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div
                        {...getRootProps()}
                        className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-300 aspect-square flex flex-col items-center justify-center ${
                          isDragActive
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-900/20 scale-105'
                            : 'border-gray-300 dark:border-gray-600 hover:border-orange-400 hover:bg-orange-50/50 dark:hover:bg-orange-900/10'
                        }`}
                      >
                        <input {...getInputProps()} />
                        <motion.div
                          animate={isDragActive ? { scale: 1.1 } : { scale: 1 }}
                          className="space-y-3"
                        >
                          <div className="w-12 h-12 mx-auto rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center">
                            <ImageIcon className="w-6 h-6 text-white" />
                          </div>
                          <div>
                            <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                              {isDragActive ? 'Drop photo here' : 'Upload student photo'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                              Drag & drop or click
                            </p>
                            <p className="text-xs text-gray-400 mt-1">
                              JPG, PNG, GIF, WebP (Max 5MB)
                            </p>
                          </div>
                        </motion.div>
                      </div>
                    )}
                  </div>

                  {/* Form Fields */}
                  <div className="lg:col-span-3 space-y-6">
                    {/* Personal Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2">
                        Personal Information
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            First Name *
                          </label>
                          <input
                            type="text"
                            name="first_name"
                            required
                            value={formData.first_name || ''}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter first name"
                          />
                        </div>
                        
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Last Name *
                          </label>
                          <input
                            type="text"
                            name="last_name"
                            required
                            value={formData.last_name || ''}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter last name"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Other Name
                          </label>
                          <input
                            type="text"
                            name="other_name"
                            value={formData.other_name || ''}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter other name"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Gender
                          </label>
                          <select
                            name="gender"
                            value={formData.gender || ''}
                            onChange={handleChange}
                            className="input-field"
                          >
                            <option value="">Select gender</option>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                          </select>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Date of Birth
                          </label>
                          <input
                            type="date"
                            name="date_of_birth"
                            value={formData.date_of_birth || ''}
                            onChange={handleChange}
                            className="input-field"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Phone Number
                          </label>
                          <input
                            type="tel"
                            name="phone"
                            value={formData.phone || ''}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter phone number"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Email
                          </label>
                          <input
                            type="email"
                            name="email"
                            value={formData.email || ''}
                            onChange={handleChange}
                            className="input-field"
                            placeholder="Enter email address"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Status
                          </label>
                          <select
                            name="status"
                            value={formData.status || 'active'}
                            onChange={handleChange}
                            className="input-field"
                          >
                            <option value="active">Active</option>
                            <option value="suspended">Suspended</option>
                            <option value="on_leave">On Leave</option>
                            <option value="dropped_out">Dropped Out</option>
                          </select>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                          Address
                        </label>
                        <textarea
                          rows={3}
                          name="address"
                          value={formData.address || ''}
                          onChange={handleChange}
                          className="input-field resize-none"
                          placeholder="Enter full address"
                        />
                      </div>
                    </div>

                    {/* Academic Information */}
                    <div className="space-y-4">
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-600 pb-2">
                        Academic Information
                      </h3>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                            Class
                          </label>
                          <select
                            name="class_id"
                            value={formData.class_id || ''}
                            onChange={handleChange}
                            className="input-field"
                          >
                            <option value="">Select class</option>
                            {classOptions.map((cls: any) => (
                              <option key={cls.id} value={cls.id}>
                                {cls.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-slate-700 flex-shrink-0">
            <div className="text-sm text-gray-600 dark:text-gray-400">
              Editing student ID: {student?.id} {formData.person_id && `(Person ID: ${formData.person_id})`}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="px-6 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-slate-600 rounded-xl transition-all duration-200 font-medium"
                disabled={loading || uploadingPhoto}
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                disabled={loading || uploadingPhoto}
                className="px-6 py-2 bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700 disabled:from-gray-400 disabled:to-gray-400 disabled:cursor-not-allowed text-white rounded-xl transition-all duration-200 flex items-center gap-2 font-medium shadow-lg hover:shadow-xl"
              >
                {loading || uploadingPhoto ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {uploadingPhoto ? 'Uploading...' : 'Updating...'}
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Update Student
                  </>
                )}
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Custom Scrollbar Styles */}
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(156, 163, 175, 0.5);
          border-radius: 3px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(156, 163, 175, 0.7);
        }
      `}</style>
    </AnimatePresence>
  );
};