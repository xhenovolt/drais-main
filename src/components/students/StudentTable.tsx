"use client";
import React, { useState, useEffect } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import useSWR from 'swr';
import useSWRImmutable from 'swr/immutable';
import { Plus, Search, Loader2, Printer, FileDown, FileUp, Edit, Trash, Eye, MoreVertical, Filter, Users, UserCheck, UserX, UserMinus, Clock, CheckSquare, Square, Camera, Upload, Home, Thermometer, Fingerprint, ChevronRight, X, AlertTriangle, FolderOpen } from 'lucide-react';
import clsx from 'clsx';
import { StudentWizard } from './StudentWizard';
import { EditStudentWizard } from './EditStudentWizard';
import { LearnerDetailsModal } from './LearnerDetailsModal';
import { ImportModal } from './ImportModal';
import { BulkPhotoUploadModal } from './BulkPhotoUploadModal';
import { FolderPhotoUploadModal } from './FolderPhotoUploadModal';
import { StatusActionModal } from './StatusActionModal';
import { FingerprintModal } from './FingerprintModal';
import DuplicatesManager from './DuplicatesManager';
import { useI18n } from '@/components/i18n/I18nProvider';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { fetcher } from '@/utils/fetcher';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { motion, AnimatePresence } from 'framer-motion';
import PhotoEditorModal from './PhotoEditorModal'; // <-- new import
import { toast } from 'react-hot-toast';
import { Info } from 'lucide-react';
import { usePagination } from '@/hooks/usePagination';
import { useSchoolConfig } from '@/hooks/useSchoolConfig';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/onboarding/EmptyState';

const API_BASE = '/api';

interface Student {
  id: number;
  person_id?: number;
  admission_no?: string;
  first_name: string;
  last_name: string;
  other_name?: string;
  gender?: string;
  date_of_birth?: string;
  phone?: string;
  email?: string;
  address?: string;
  photo_url?: string;
  // make status optional and extend possible values
  status?: 'active' | 'suspended' | 'on_leave' | 'dropped_out' | 'at_home' | 'sick' | 'expelled';
  admission_date?: string;
  class_id?: string;
  class_name?: string;
  stream_name?: string;
  theology_class_id?: string;
  stream_id?: string;
  academic_year_id?: string;
  term_id?: string;
  notes?: string;
  district_name?: string;
  village_name?: string;
  attendance_percentage?: number;
}

const statusOptions = [
  { value: 'active', label: 'Active', icon: UserCheck, color: 'text-green-600 bg-green-50' },
  { value: 'suspended', label: 'Suspended', icon: UserX, color: 'text-red-600 bg-red-50' },
  { value: 'on_leave', label: 'On Leave', icon: Clock, color: 'text-yellow-600 bg-yellow-50' },
  { value: 'dropped_out', label: 'Dropped Out', icon: UserMinus, color: 'text-gray-600 bg-gray-50' },
  { value: 'at_home', label: 'At Home', icon: Home, color: 'text-blue-600 bg-blue-50' },
  { value: 'sick', label: 'Sick', icon: Thermometer, color: 'text-pink-600 bg-pink-50' },
  { value: 'expelled', label: 'Expelled', icon: UserX, color: 'text-red-800 bg-red-100' },
];

export const StudentTable: React.FC = () => {
  const { t, lang, dir } = useI18n();
  const { school: schoolCfg } = useSchoolConfig();
  const isRTL = dir === 'rtl';
  
  // Allow upload components to opt-out of client-side file-size limits.
  // Other components (e.g. StudentWizard, BulkPhotoUploadModal) can read:
  // if ((window as any).__ALLOW_LARGE_UPLOADS) { /* skip size checks */ }
  useEffect(() => {
    (window as any).__ALLOW_LARGE_UPLOADS = true;
    return () => {
      try { delete (window as any).__ALLOW_LARGE_UPLOADS; } catch { (window as any).__ALLOW_LARGE_UPLOADS = undefined; }
    };
  }, []);

  
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState('');
  const [selectedStream, setSelectedStream] = useState('');
  const [selectedGender, setSelectedGender] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedLearner, setSelectedLearner] = useState<Student | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [exportType, setExportType] = useState('csv');
  const [importType, setImportType] = useState('csv');
  const [selectedLearners, setSelectedLearners] = useState<number[]>([]);
  const [bulkClass, setBulkClass] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [fingerprintModalOpen, setFingerprintModalOpen] = useState(false);
  const [fingerprintStudent, setFingerprintStudent] = useState<Student | null>(null);
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [showAlphabetFilter, setShowAlphabetFilter] = useState(false);
  const [showBulkPhotoUpload, setShowBulkPhotoUpload] = useState(false);
  const [showFolderPhotoUpload, setShowFolderPhotoUpload] = useState(false);
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [statusAction, setStatusAction] = useState<'suspend' | 'expel' | null>(null);
  const [statusTargetStudent, setStatusTargetStudent] = useState<Student | null>(null);
  const [photoEditorOpen, setPhotoEditorOpen] = useState(false);
  const [photoEditorStudent, setPhotoEditorStudent] = useState<Student | null>(null);
  const [fingerprintStatuses, setFingerprintStatuses] = useState<Record<number, {hasFingerprint: boolean, loading: boolean, lastFetched?: number}>>({});
  const [showDuplicatesManager, setShowDuplicatesManager] = useState(false);
  const [enrollingFingerprint, setEnrollingFingerprint] = useState<Record<number, boolean>>({});

  // Inline editing state
  const [editingCell, setEditingCell] = useState<{studentId: number, field: 'first_name' | 'last_name'} | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  // Device ID editing state
  const [deviceIdEditingCell, setDeviceIdEditingCell] = useState<{studentId: number} | null>(null);
  const [deviceIdValue, setDeviceIdValue] = useState('');
  const [isUpdatingDeviceId, setIsUpdatingDeviceId] = useState(false);

  // Contact phone editing state
  const [contactPhoneEditingCell, setContactPhoneEditingCell] = useState<{studentId: number} | null>(null);
  const [contactPhoneValue, setContactPhoneValue] = useState('');
  const [isUpdatingContactPhone, setIsUpdatingContactPhone] = useState(false);

  const router = useRouter();

  // SWR Hook - define early so data is available for other functions
  const { data, isLoading, mutate } = useSWR(
    `${API_BASE}/students/full?q=${encodeURIComponent(query)}${selectedClass ? `&class_id=${selectedClass}` : ''}${selectedStream ? `&stream_id=${selectedStream}` : ''}${selectedGender ? `&gender=${selectedGender}` : ''}${selectedStatus ? `&status=${selectedStatus}` : ''}`,
    fetcher
  );

  const rows: Student[] = data?.data || [];
  const total = rows.length;
  const rowsPerPage = 10;

  // Data processing - single source of truth
  const uniqueRows = rows
    .filter((student, index, self) => self.findIndex((s) => s.id === student.id) === index)
    .sort((a, b) =>
      (a.last_name ?? '').localeCompare(b.last_name ?? '', undefined, { sensitivity: 'base' }) ||
      (a.first_name ?? '').localeCompare(b.first_name ?? '', undefined, { sensitivity: 'base' })
    );
  
  // Apply alphabetical filter
  const filteredByLetter = selectedLetter
    ? uniqueRows.filter(student => 
        student.first_name?.toUpperCase().startsWith(selectedLetter)
      )
    : uniqueRows;
  
  const totalFiltered = filteredByLetter.length;
  const pages = Math.ceil(totalFiltered / rowsPerPage) || 1;
  const paginatedRows = filteredByLetter.slice((page - 1) * rowsPerPage, page * rowsPerPage);

  // Inline editing - save on blur
  const saveInlineEditCallback = async () => {
    if (!editingCell || isUpdating) return;
    
    const student = rows.find(s => s.id === editingCell.studentId);
    if (!student) return;

    // Don't save if value hasn't changed
    const currentValue = student[editingCell.field];
    if (editingValue.trim() === currentValue) {
      cancelInlineEdit();
      return;
    }

    // Validate input
    if (!editingValue.trim()) {
      toast.error('Name cannot be empty');
      setEditingValue(currentValue); // Reset to original value
      return;
    }

    setIsUpdating(true);

    try {
      const updateData = {
        id: student.id,
        first_name: editingCell.field === 'first_name' ? editingValue.trim() : student.first_name,
        last_name: editingCell.field === 'last_name' ? editingValue.trim() : student.last_name,
        other_name: student.other_name,
        gender: student.gender,
        date_of_birth: student.date_of_birth,
        phone: student.phone,
        email: student.email,
        address: student.address,
        class_id: student.class_id,
        status: student.status,
        photo_url: student.photo_url
      };

      const response = await fetch('/api/students/edit', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updateData),
      });

      const result = await response.json();

      if (result.success) {
        // Optimistically update local data
        mutate();
        toast.success(`${editingCell.field === 'first_name' ? 'First name' : 'Last name'} updated successfully`);
        cancelInlineEdit();
      } else {
        throw new Error(result.error || 'Update failed');
      }
    } catch (error: any) {
      console.error('Inline edit error:', error);
      toast.error(`Failed to update ${editingCell.field === 'first_name' ? 'first name' : 'last name'}: ${error.message}`);
      // Reset to original value
      setEditingValue(student[editingCell.field]);
    } finally {
      setIsUpdating(false);
    }
  };

  // Effect to handle clicking outside of editing input
  useEffect(() => {
    if (!editingCell || isUpdating) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Check if the click is on an input or if we're in the middle of an update
      if (!target.closest('input[type="text"]') && !target.closest('.inline-edit-container')) {
        saveInlineEditCallback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [editingCell?.studentId, editingCell?.field, isUpdating]);

  // Effect to handle clicking outside of device ID editing input
  useEffect(() => {
    if (!deviceIdEditingCell || isUpdatingDeviceId) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      // Check if the click is on an input or if we're in the middle of an update
      if (!target.closest('input[type="number"]') && !target.closest('.device-id-edit-container')) {
        saveDeviceIdCallback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [deviceIdEditingCell?.studentId, isUpdatingDeviceId]);

  // Effect to handle clicking outside of contact phone editing input
  useEffect(() => {
    if (!contactPhoneEditingCell || isUpdatingContactPhone) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest('input[type="tel"]') && !target.closest('.contact-phone-edit-container')) {
        saveContactPhoneCallback();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [contactPhoneEditingCell?.studentId, isUpdatingContactPhone]);

  const { data: classData } = useSWRImmutable(`${API_BASE}/classes`, fetcher);
  const classOptions = classData?.data || [];

  const { data: streamData } = useSWRImmutable(`${API_BASE}/streams`, fetcher);
  const streamOptions = streamData?.data || [];

  // Helper functions - display admission number from student record
  const getAdmissionNo = (student: any) => {
    // Return the student's actual admission_no from the database
    return student.admission_no || `XHN/${student.id.toString().padStart(4, '0')}/2025`;
  };

  // Inline editing functions
  const startInlineEdit = (studentId: number, field: 'first_name' | 'last_name', currentValue: string) => {
    if (isUpdating || editingCell) return; // Prevent editing while update is in progress or another cell is being edited
    setEditingCell({ studentId, field });
    setEditingValue(currentValue);
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const handleInlineEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveInlineEditCallback();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelInlineEdit();
    }
  };

  // Device ID editing functions
  const startDeviceIdEdit = (studentId: number, currentValue: number) => {
    if (isUpdatingDeviceId || deviceIdEditingCell) return;
    setDeviceIdEditingCell({ studentId });
    setDeviceIdValue(currentValue.toString());
  };

  const cancelDeviceIdEdit = () => {
    setDeviceIdEditingCell(null);
    setDeviceIdValue('');
  };

  const saveDeviceIdCallback = async () => {
    if (!deviceIdEditingCell || isUpdatingDeviceId) return;

    const student = rows.find(s => s.id === deviceIdEditingCell.studentId);
    if (!student) return;

    const newDeviceId = parseInt(deviceIdValue) || 0;
    if (newDeviceId === (student.device_user_id || 0)) {
      cancelDeviceIdEdit();
      return;
    }

    setIsUpdatingDeviceId(true);

    try {
      if (newDeviceId === 0) {
        // Delete device mapping
        if (student.device_mapping_id) {
          const response = await fetch(`/api/device-mappings/${student.device_mapping_id}`, {
            method: 'DELETE'
          });

          if (!response.ok) throw new Error('Failed to delete device mapping');
          toast.success('Device ID removed successfully');
        }
      } else {
        // Create or update mapping using the by-device endpoint which auto-selects default device
        const response = await fetch(`/api/device-mappings/by-device`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: student.id,
            device_user_id: newDeviceId
          })
        });

        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to update device mapping');
        toast.success('Device ID updated successfully');
      }

      mutate();
      cancelDeviceIdEdit();
    } catch (error: any) {
      console.error('Device ID update error:', error);
      toast.error(`Failed to update device ID: ${error.message}`);
      setDeviceIdValue(student.device_user_id?.toString() || '');
    } finally {
      setIsUpdatingDeviceId(false);
    }
  };

  const handleDeviceIdKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveDeviceIdCallback();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelDeviceIdEdit();
    }
  };

  // Contact phone editing functions
  const startContactPhoneEdit = (studentId: number, currentPhone: string) => {
    if (isUpdatingContactPhone || contactPhoneEditingCell) return;
    setContactPhoneEditingCell({ studentId });
    setContactPhoneValue(currentPhone || '');
  };

  const cancelContactPhoneEdit = () => {
    setContactPhoneEditingCell(null);
    setContactPhoneValue('');
  };

  const saveContactPhoneCallback = async () => {
    if (!contactPhoneEditingCell || isUpdatingContactPhone) return;

    const student = rows.find(s => s.id === contactPhoneEditingCell.studentId);
    if (!student) return;

    if (contactPhoneValue.trim() === (student.contact_phone || '')) {
      cancelContactPhoneEdit();
      return;
    }

    if (!contactPhoneValue.trim()) {
      toast.error('Phone number cannot be empty');
      setContactPhoneValue(student.contact_phone || '');
      return;
    }

    setIsUpdatingContactPhone(true);

    try {
      const response = await fetch(`/api/students/${student.id}/primary-contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contact_phone: contactPhoneValue.trim(),
          relationship: 'Guardian'
        })
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Failed to save contact');

      toast.success('Contact phone updated successfully');
      mutate();
      cancelContactPhoneEdit();
    } catch (error: any) {
      console.error('Contact phone update error:', error);
      toast.error(`Failed to update contact: ${error.message}`);
      setContactPhoneValue(student.contact_phone || '');
    } finally {
      setIsUpdatingContactPhone(false);
    }
  };

  const handleContactPhoneKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveContactPhoneCallback();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelContactPhoneEdit();
    }
  };

  const getStatusBadge = (status?: Student['status']) => {
    if (!status) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-gray-600 bg-gray-50">
          Select status
        </span>
      );
    }
    const statusOption = statusOptions.find(s => s.value === status);
    const Icon = statusOption?.icon || UserCheck;
    
    return (
      <span className={clsx('inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', statusOption?.color)}>
        <Icon className="w-3 h-3" />
        {statusOption?.label || status}
      </span>
    );
  };

  // Enterprise-grade avatar component with theme-aware fallback
  const getStudentAvatar = (student: Student, size = 'w-10 h-10') => {
    // Check for photo from people table via person_id relationship
    const photoUrl = student.photo_url;
    
    if (photoUrl) {
      return (
        <div className="relative group">
          <img 
            src={photoUrl} 
            alt={`${student.first_name} ${student.last_name}`}
            className={`${size} rounded-full object-cover shadow-md ring-2 ring-white dark:ring-slate-600 transition-all duration-200 group-hover:shadow-lg group-hover:scale-105`}
            onError={(e) => {
              // Enhanced error logging for debugging
              console.warn(`Failed to load image for ${student.first_name} ${student.last_name}:`, photoUrl);
              
              // Graceful fallback to initials on image load error
              const target = e.target as HTMLImageElement;
              const fallback = target.nextElementSibling as HTMLElement;
              target.style.display = 'none';
              if (fallback) fallback.classList.remove('hidden');
            }}
            onLoad={() => {
              // Debug successful loads
              console.log(`Successfully loaded image for ${student.first_name} ${student.last_name}:`, photoUrl);
            }}
          />
          {/* Fallback initials (hidden by default) */}
          <div className={`${size} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-600 transition-all duration-200 hidden absolute inset-0`}>
            <span className="text-sm font-semibold text-white select-none">
              {student.first_name?.charAt(0)?.toUpperCase()}{student.last_name?.charAt(0)?.toUpperCase()}
            </span>
          </div>
        </div>
      );
    }
    
    // Direct initials fallback with enterprise styling
    return (
      <div className={`${size} rounded-full bg-gradient-to-br from-blue-500 to-purple-600 dark:from-blue-600 dark:to-purple-700 flex items-center justify-center shadow-md ring-2 ring-white dark:ring-slate-600 transition-all duration-200 hover:shadow-lg hover:scale-105`}>
        <span className="text-sm font-semibold text-white select-none">
          {student.first_name?.charAt(0)?.toUpperCase()}{student.last_name?.charAt(0)?.toUpperCase()}
        </span>
      </div>
    );
  };

  // Enhanced avatar for larger displays with improved enterprise styling
  const getStudentAvatarLarge = (student: Student, size = 'w-12 h-12') => {
    const photoUrl = student.photo_url;
    
    if (photoUrl) {
      return (
        <div className="relative group">
          <img 
            src={photoUrl} 
            alt={`${student.first_name} ${student.last_name}`}
            className={`${size} rounded-xl object-cover shadow-lg ring-3 ring-white dark:ring-slate-600 transition-all duration-300 group-hover:shadow-xl group-hover:scale-105 group-hover:ring-blue-200 dark:group-hover:ring-blue-700`}
            onError={(e) => {
              const target = e.target as HTMLImageElement;
              const fallback = target.nextElementSibling as HTMLElement;
              target.style.display = 'none';
              if (fallback) fallback.classList.remove('hidden');
            }}
          />
          {/* Enhanced fallback with enterprise styling */}
          <div className={`${size} rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 flex items-center justify-center shadow-lg ring-3 ring-white dark:ring-slate-600 transition-all duration-300 hidden absolute inset-0`}>
            <span className="text-lg font-bold text-white select-none tracking-wide">
              {student.first_name?.charAt(0)?.toUpperCase()}{student.last_name?.charAt(0)?.toUpperCase()}
            </span>
          </div>
        </div>
      );
    }
    
    return (
      <div className={`${size} rounded-xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 dark:from-blue-600 dark:via-purple-600 dark:to-pink-600 flex items-center justify-center shadow-lg ring-3 ring-white dark:ring-slate-600 transition-all duration-300 hover:shadow-xl hover:scale-105 hover:ring-blue-200 dark:hover:ring-blue-700`}>
        <span className="text-lg font-bold text-white select-none tracking-wide">
          {student.first_name?.charAt(0)?.toUpperCase()}{student.last_name?.charAt(0)?.toUpperCase()}
        </span>
      </div>
    );
  };

  const clearFilters = () => {
    setQuery('');
    setSelectedClass('');
    setSelectedStream('');
    setSelectedGender('');
    setSelectedStatus('');
    setSelectedLetter(null);
    setPage(1);
  };

  // Event handlers
  const handleEdit = (student: Student) => {
    setSelectedStudent(student);
    setEditOpen(true);
  };

  const handleDelete = async (student: Student) => {
    const confirm = await Swal.fire({
      title: 'Are you sure?',
      text: `You are about to delete ${student.first_name} ${student.last_name}. This action cannot be undone!`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Yes, delete it!',
      cancelButtonText: 'Cancel',
    });

    if (confirm.isConfirmed) {
      try {
        const response = await fetch(`${API_BASE}/students/delete`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: student.id }),
        });
        const result = await response.json();
        if (result.success) {
          Swal.fire('Deleted!', 'The student has been deleted.', 'success');
          mutate();
        } else {
          Swal.fire('Error!', 'Failed to delete the student.', 'error');
        }
      } catch (error) {
        Swal.fire('Error!', 'An unexpected error occurred.', 'error');
      }
    }
  };

  const handleSubmit = async (formData: Student) => {
    const confirm = await Swal.fire({
      title: 'Confirm Edit',
      text: 'Are you sure you want to save these changes?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, save it!',
      cancelButtonText: 'Cancel',
    });

    if (confirm.isConfirmed) {
      try {
        const response = await fetch(`${API_BASE}/students/edit`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        });
        const result = await response.json();
        if (response.ok && result.success) {
          Swal.fire('Saved!', 'The student details have been updated.', 'success');
          setOpen(false);
          mutate();
        } else {
          Swal.fire('Error!', result.error || 'Failed to update the student details.', 'error');
        }
      } catch (error) {
        Swal.fire('Error!', 'An unexpected error occurred.', 'error');
      }
    }
  };

  const handleStatusChange = async (student: Student, newStatus: Student['status']) => {
    const statusOption = statusOptions.find(s => s.value === newStatus);
    
    const confirm = await Swal.fire({
      title: 'Change Student Status',
      html: `
        <div class="text-center">
          <p>Change status of <strong>${student.first_name} ${student.last_name}</strong> to:</p>
          <div class="mt-3 p-3 rounded-lg ${statusOption?.color}">
            <span class="font-semibold">${statusOption?.label}</span>
          </div>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, change status',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'rounded-2xl',
        confirmButton: 'bg-blue-600 hover:bg-blue-700',
        cancelButton: 'bg-gray-300 hover:bg-gray-400'
      }
    });

    if (confirm.isConfirmed) {
      try {
        const response = await fetch(`${API_BASE}/students/status`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ student_id: student.id, new_status: newStatus }),
        });

        const result = await response.json();

        if (result.success) {
          Swal.fire({
            title: 'Status Updated!',
            text: `${student.first_name} ${student.last_name} is now ${statusOption?.label}`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
          });
          mutate();
        } else {
          Swal.fire('Error!', result.error || 'Failed to update status.', 'error');
        }
      } catch (error) {
        Swal.fire('Error!', 'An unexpected error occurred.', 'error');
      }
    }
  };

  const handleViewDetails = (student: Student) => {
    setSelectedLearner(student);
    setDetailsOpen(true);
  };

  const openPhotoEditor = (student: Student) => {
    setPhotoEditorStudent(student);
    setPhotoEditorOpen(true);
  };

  // Load fingerprint statuses for visible students with 10-minute cache
  useEffect(() => {
    const loadFingerprintStatuses = async () => {
      const now = Date.now();
      const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds
      
      const studentsToFetch = paginatedRows.filter(student => {
        const status = fingerprintStatuses[student.id];
        
        // Skip if already loading
        if (status?.loading) return false;
        
        // Skip if recently fetched (within 10 minutes)
        if (status?.lastFetched && (now - status.lastFetched) < CACHE_DURATION) return false;
        
        return true;
      });

      if (studentsToFetch.length === 0) return;

      // Set loading state for students we're about to fetch
      const loadingUpdates = studentsToFetch.reduce((acc, student) => {
        acc[student.id] = { 
          hasFingerprint: fingerprintStatuses[student.id]?.hasFingerprint || false, 
          loading: true,
          lastFetched: fingerprintStatuses[student.id]?.lastFetched
        };
        return acc;
      }, {} as Record<number, {hasFingerprint: boolean, loading: boolean, lastFetched?: number}>);

      setFingerprintStatuses(prev => ({ ...prev, ...loadingUpdates }));

      const statusPromises = studentsToFetch.map(async (student) => {
        try {
          const response = await fetch(`/api/students/${student.id}/fingerprint`);
          const result = await response.json();
          
          return {
            studentId: student.id,
            hasFingerprint: result.success && (result.data?.hasPhone || result.data?.hasBiometric),
            error: null
          };
        } catch (error) {
          console.error(`Failed to load fingerprint status for student ${student.id}:`, error);
          return {
            studentId: student.id,
            hasFingerprint: false,
            error: error
          };
        }
      });

      const results = await Promise.all(statusPromises);
      
      // Update all statuses at once
      const statusUpdates = results.reduce((acc, result) => {
        acc[result.studentId] = {
          hasFingerprint: result.hasFingerprint,
          loading: false,
          lastFetched: now
        };
        return acc;
      }, {} as Record<number, {hasFingerprint: boolean, loading: boolean, lastFetched: number}>);

      setFingerprintStatuses(prev => ({ ...prev, ...statusUpdates }));
    };

    if (paginatedRows.length > 0) {
      loadFingerprintStatuses();
    }
  }, [paginatedRows]); // Removed fingerprintStatuses from dependencies to prevent infinite loops

  // Enhanced fingerprint click handler with cache invalidation
  const handleFingerprintClick = (student: Student) => {
    const status = fingerprintStatuses[student.id];
    
    if (status?.hasFingerprint) {
      toast('Fingerprint already registered! Opening management...', {
        duration: 2000,
        position: 'top-right',
        icon: '✅'
      });
    } else {
      toast('Opening fingerprint registration...', {
        duration: 2000,
        position: 'top-right',
        icon: '🔒'
      });
    }
    
    setFingerprintStudent(student);
    setFingerprintModalOpen(true);
  };

  // Listen for fingerprint status changes from the modal
  useEffect(() => {
    const handleFingerprintStatusChange = (event: CustomEvent) => {
      const { studentId, hasFingerprint } = event.detail;
      
      // Immediately update the status and mark as recently fetched
      setFingerprintStatuses(prev => ({
        ...prev,
        [studentId]: { 
          hasFingerprint, 
          loading: false,
          lastFetched: Date.now() // Mark as just updated
        }
      }));
    };

    window.addEventListener('fingerprintStatusChanged', handleFingerprintStatusChange as EventListener);
    
    return () => {
      window.removeEventListener('fingerprintStatusChanged', handleFingerprintStatusChange as EventListener);
    };
  }, []);

  // Enhanced fingerprint icon with better loading state
  const getFingerprintIcon = (student: Student) => {
    const status = fingerprintStatuses[student.id];
    
    if (status?.loading) {
      return (
        <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
      );
    }

    if (status?.hasFingerprint) {
      return (
        <Fingerprint className="w-4 h-4 text-green-600" />
      );
    }

    return (
      <Fingerprint className="w-4 h-4 text-gray-400" />
    );
  };

  // Enhanced fingerprint button with status styling
  const getFingerprintButton = (student: Student, isMobile = false) => {
    const status = fingerprintStatuses[student.id];
    const baseClass = isMobile 
      ? "p-2 rounded-lg transition-all"
      : "p-2 rounded-lg transition-all dark:hover:bg-purple-900/20";
    
    if (status?.hasFingerprint) {
      return (
        <button
          onClick={() => handleFingerprintClick(student)}
          className={`${baseClass} ${isMobile ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-300 hover:bg-green-200 dark:hover:bg-green-900/40' : 'text-green-600 hover:text-green-700 hover:bg-green-50'}`}
          title="Fingerprint Registered - Manage"
        >
          {getFingerprintIcon(student)}
        </button>
      );
    }

    return (
      <button
        onClick={() => handleFingerprintClick(student)}
        className={`${baseClass} ${isMobile ? 'bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-purple-100 hover:text-purple-600' : 'text-gray-400 hover:text-purple-600 hover:bg-purple-50'}`}
        title="Register Fingerprint"
      >
        {getFingerprintIcon(student)}
      </button>
    );
  };

  // Capture Fingerprint: queue ENROLL command on the ZK device
  const handleEnrollFingerprint = async (student: Student) => {
    const sid = student.id;
    if (enrollingFingerprint[sid]) return; // already in-flight

    // Must have a device_user_id (biometric ID) assigned
    if (!(student as any).device_user_id) {
      toast.error('Assign a Device ID first before capturing fingerprint.');
      return;
    }

    setEnrollingFingerprint(prev => ({ ...prev, [sid]: true }));

    try {
      const res = await fetch('/api/students/enroll-fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ student_id: sid }),
      });
      const data = await res.json();

      if (data.success) {
        toast.success(data.message || `Command Sent! Check the device for ${student.first_name} ${student.last_name}.`, { duration: 6000 });
      } else {
        toast.error(data.error || 'Failed to queue fingerprint enrollment.');
      }
    } catch (err: any) {
      toast.error('Network error — could not reach server.');
      console.error('[enroll-fingerprint]', err);
    } finally {
      // Keep the "sent" visual for 8 seconds, then reset
      setTimeout(() => {
        setEnrollingFingerprint(prev => ({ ...prev, [sid]: false }));
      }, 8000);
    }
  };

  // Capture fingerprint button — shown when student has device_user_id but fingerprint not yet captured
  const getCaptureButton = (student: Student, isMobile = false) => {
    const hasDeviceId = !!(student as any).device_user_id;
    const fpStatus = fingerprintStatuses[student.id];
    const hasFingerprint = fpStatus?.hasFingerprint;
    const isEnrolling = enrollingFingerprint[student.id];

    // Only show for students with a device_user_id who are missing a fingerprint
    if (!hasDeviceId || hasFingerprint) return null;

    if (isEnrolling) {
      return (
        <button
          disabled
          className={`p-2 rounded-lg transition-all ${isMobile ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'text-amber-500 bg-amber-50 dark:bg-amber-900/20'} animate-pulse cursor-wait`}
          title="Waiting for Device..."
        >
          <Loader2 className="w-4 h-4 animate-spin" />
        </button>
      );
    }

    return (
      <button
        onClick={() => handleEnrollFingerprint(student)}
        className={`p-2 rounded-lg transition-all ${isMobile ? 'bg-teal-100 dark:bg-teal-900/30 text-teal-600 hover:bg-teal-200' : 'text-teal-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-900/20'}`}
        title="Capture Fingerprint on Device"
      >
        <Fingerprint className="w-4 h-4" />
      </button>
    );
  };

  // Enhanced bulk actions
  const handleSelectLearner = (id: number) => {
    setSelectedLearners((prev) =>
      prev.includes(id) ? prev.filter((learnerId) => learnerId !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    const allIds = paginatedRows.map((row) => row.id);
    setSelectedLearners((prev) =>
      prev.length === allIds.length ? [] : allIds
    );
  };

  const handleBulkAssign = async () => {
    if (selectedLearners.length === 0) {
      Swal.fire('Error', 'Please select at least one student.', 'error');
      return;
    }

    if (!bulkClass) {
      Swal.fire('Error', 'Please select a class to assign.', 'error');
      return;
    }

    const selectedClassName = classOptions.find((cls: any) => cls.id === parseInt(bulkClass))?.name || 'Unknown Class';

    const confirm = await Swal.fire({
      title: 'Bulk Class Assignment',
      html: `
        <div class="text-center">
          <p>Assign <strong>${selectedLearners.length}</strong> selected students to:</p>
          <div class="mt-3 p-3 rounded-lg bg-blue-50">
            <span class="font-semibold text-blue-800">${selectedClassName}</span>
          </div>
          <p class="mt-3 text-sm text-gray-600">This will update their class enrollment.</p>
        </div>
      `,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, Assign Class',
      cancelButtonText: 'Cancel',
      customClass: {
        popup: 'rounded-2xl',
        confirmButton: 'bg-blue-600 hover:bg-blue-700',
        cancelButton: 'bg-gray-300 hover:bg-gray-400'
      }
    });

    if (!confirm.isConfirmed) return;

    try {
      Swal.fire({
        title: 'Processing...',
        html: 'Assigning class to selected students...',
        allowOutsideClick: false,
        didOpen: () => {
          Swal.showLoading();
        },
      });

      const response = await fetch(`${API_BASE}/students/bulk-assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ learnerIds: selectedLearners, classId: bulkClass }),
      });
      
      const result = await response.json();

      if (result.success) {
        Swal.fire({
          title: 'Success!',
          text: `${selectedLearners.length} students have been assigned to ${selectedClassName}`,
          icon: 'success',
          timer: 3000,
        });
        setSelectedLearners([]);
        setBulkClass('');
        mutate();
      } else {
        Swal.fire('Error', result.error || 'Failed to assign class.', 'error');
      }
    } catch (error) {
      Swal.fire('Error', 'An unexpected error occurred during bulk assignment.', 'error');
    }
  };

  // Enhanced export with format selection
  const handleExport = async (format: 'excel' | 'csv' = 'excel') => {
    try {
      toast.loading('Preparing export...', {
        duration: 2000,
        position: 'top-right',
        id: 'export-toast'
      });

      // First check if we have data to export
      if (!rows || rows.length === 0) {
        toast.error('No data to export', { id: 'export-toast' });
        return;
      }

      // Create CSV data from current filtered results
      const headers = [
        'Admission Number',
        'First Name',
        'Last Name',
        'Other Name',
        'Gender',
        'Date of Birth',
        'Phone',
        'Email',
        'Address',
        'Class',
        'Stream',
        'Status',
        'Admission Date',
        'District',
        'Village',
        'Attendance %'
      ];

      const csvData = uniqueRows.map(student => [
        getAdmissionNo(student),
        student.first_name || '',
        student.last_name || '',
        student.other_name || '',
        student.gender || '',
        student.date_of_birth || '',
        student.phone || '',
        student.email || '',
        student.address || '',
        student.class_name || '',
        student.stream_name || '',
        student.status || 'active',
        student.admission_date || '',
        student.district_name || '',
        student.village_name || '',
        (student.attendance_percentage || 0).toString()
      ]);

      if (format === 'csv') {
        // Generate CSV
        const csvContent = [headers, ...csvData]
          .map(row => row.map(field => `"${field}"`).join(','))
          .join('\n');

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        
        const timestamp = new Date().toISOString().split('T')[0];
        link.download = `students_export_${timestamp}.csv`;
        
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
        
        toast.success('CSV file downloaded successfully!', { id: 'export-toast' });
      } else {
        // Try API endpoint for Excel, fallback to CSV if not available
        try {
          const response = await fetch(`${API_BASE}/students/export?format=excel`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: csvData, headers })
          });

          if (!response.ok) {
            throw new Error('API export failed, using fallback');
          }

          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          
          const timestamp = new Date().toISOString().split('T')[0];
          link.download = `students_export_${timestamp}.xlsx`;
          
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.URL.revokeObjectURL(url);
          
          toast.success('Excel file downloaded successfully!', { id: 'export-toast' });
        } catch (apiError) {
          // Fallback to CSV if Excel API fails
          console.warn('Excel export API failed, falling back to CSV:', apiError);
          await handleExport('csv');
        }
      }
    } catch (error: any) {
      console.error('Export error:', error);
      toast.error(error.message || 'An error occurred during export.', { id: 'export-toast' });
    }
  };

  // Enhanced print function with better formatting
  const handlePrint = async () => {
    try {
      toast.loading('Generating print document...', {
        duration: 3000,
        position: 'top-right',
        id: 'print-toast'
      });

      // Check if we have data to print
      if (!rows || rows.length === 0) {
        toast.error('No data to print', { id: 'print-toast' });
        return;
      }

      const doc = new jsPDF('landscape', 'mm', 'a4');
      
      // Add header
      doc.setFontSize(18);
      doc.setFont('helvetica', 'bold');
      doc.text(`${schoolCfg.name} - STUDENT LIST`, 20, 20);
      
      // Add generation date
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      doc.text(`Generated on: ${new Date().toLocaleDateString()}`, 20, 30);
      doc.text(`Total Students: ${total}`, 20, 35);
      
      // Add filters info if any
      let filterInfo = [];
      if (selectedClass) {
        const className = classOptions.find((cls: any) => cls.id === parseInt(selectedClass))?.name;
        filterInfo.push(`Class: ${className}`);
      }
      if (selectedStream) {
        const streamName = streamOptions.find((stream: any) => stream.id === parseInt(selectedStream))?.name;
        filterInfo.push(`Stream: ${streamName}`);
      }
      if (selectedGender) filterInfo.push(`Gender: ${selectedGender}`);
      if (selectedStatus) filterInfo.push(`Status: ${selectedStatus}`);
      if (query) filterInfo.push(`Search: "${query}"`);
      if (selectedLetter) filterInfo.push(`Name starts with: ${selectedLetter}`);
      if (filterInfo.length > 0) {
        doc.text(`Filters: ${filterInfo.join(', ')}`, 20, 40);
      }

      // Table headers
      const tableColumnHeaders = [
        'Admission #',
        'Name',
        'Gender',
        'Class',
        'Stream',
        'Status',
        'Phone',
        'Attendance'
      ];

      // Table data - use all filtered data, not just paginated
      const tableRows = filteredByLetter.map((row) => [
        getAdmissionNo(row),
        `${row.first_name} ${row.last_name}`,
        row.gender || '-',
        row.class_name || 'No Class',
        row.stream_name || '-',
        row.status || 'active',
        row.phone || '-',
        `${row.attendance_percentage || 0}%`
      ]);

      // Add table using autoTable
      autoTable(doc, {
        head: [tableColumnHeaders],
        body: tableRows,
        startY: filterInfo.length > 0 ? 50 : 45,
        styles: { 
          fontSize: 8,
          cellPadding: 2
        },
        headStyles: {
          fillColor: [59, 130, 246], // Blue color
          textColor: 255,
          fontStyle: 'bold'
        },
        alternateRowStyles: {
          fillColor: [248, 250, 252] // Light gray
        },
        margin: { left: 15, right: 15 },
        tableWidth: 'auto',
        columnStyles: {
          0: { cellWidth: 25 }, // Admission #
          1: { cellWidth: 35 }, // Name
          2: { cellWidth: 15 }, // Gender
          3: { cellWidth: 25 }, // Class
          4: { cellWidth: 25 }, // Stream
          5: { cellWidth: 20 }, // Status
          6: { cellWidth: 25 }, // Phone
          7: { cellWidth: 20 }  // Attendance
        }
      });

      // Add footer
      const pageCount = doc.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.text(`Page ${i} of ${pageCount}`, 280, 200, { align: 'right' });
        doc.text(`${schoolCfg.name} Management System`, 20, 200);
      }

      // Save the PDF
      const pdfBlob = doc.output('blob');
      const url = window.URL.createObjectURL(pdfBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `students_list_${new Date().toISOString().split('T')[0]}.pdf`;
      
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      toast.success('PDF generated and downloaded successfully!', { id: 'print-toast' });
    } catch (error: any) {
      console.error('Print error:', error);
      toast.error('An error occurred while generating the PDF.', { id: 'print-toast' });
    }
  };

  return (
    <div className="space-y-3 p-4 sm:p-6 lg:p-8 gradient-bg min-h-screen">
      {/* Clean Header Section - SINGLE ROW on Desktop: Title | Search | Filters | Actions */}
      <div className="space-y-3">
        {/* Unified Header - All controls on one row (responsive: stacks on mobile) */}
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          {/* Title Section - Left */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-md">
              <Users className="w-4 h-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">Students</h1>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                <span className="font-semibold text-blue-600 dark:text-blue-400">{total}</span> learners
              </p>
            </div>
          </div>

          {/* Search Input - Flex-grow to take available space */}
          <div className="flex-1 min-w-0">
            <div className="relative group">
              <Search className={clsx("absolute top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 group-focus-within:text-blue-500 transition-colors", isRTL ? "right-3" : "left-3")} />
              <input
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(1);
                }}
                placeholder={t('students.search', 'Search students...')}
                className={clsx("input-field text-sm shadow-sm focus:shadow-md", isRTL ? "pr-9 pl-3" : "pl-9 pr-3")}
              />
            </div>
          </div>

          {/* Filter & A-Z Buttons - Center */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium text-sm flex items-center gap-1.5 whitespace-nowrap"
            >
              <Filter className="w-4 h-4" />
              Filters
              {(selectedClass || selectedStream || selectedGender || selectedStatus) && (
                <span className="bg-blue-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                  {[selectedClass, selectedStream, selectedGender, selectedStatus].filter(Boolean).length}
                </span>
              )}
            </button>

            <button
              onClick={() => setShowAlphabetFilter(!showAlphabetFilter)}
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-slate-800 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors font-medium text-sm flex items-center gap-1.5 whitespace-nowrap"
            >
              <span className="text-xs font-bold">A–Z</span>
              {selectedLetter && (
                <span className="bg-pink-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-semibold">
                  ✓
                </span>
              )}
            </button>
          </div>

          {/* Primary Actions - Right */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Primary Action: Add Student */}
            <button
              onClick={() => {
                setSelectedStudent(null);
                setIsEditing(false);
                setOpen(true);
              }}
              className="btn-primary bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg px-4 py-2 flex items-center gap-2 shadow-md hover:shadow-lg hover:brightness-110 transition-all duration-200 focus:ring-4 focus:ring-indigo-300 font-medium text-sm"
            >
              <Plus className="w-5 h-5" />
              Add Student
            </button>

            {/* Secondary Actions Dropdown */}
            <div className="relative group">
              <button
                className="px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-200 font-medium text-sm"
                title="More actions"
              >
                <MoreVertical className="w-5 h-5" />
              </button>
              
              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-1 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-20 py-1">
                {/* Import */}
                <button
                  onClick={() => setImportOpen(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <FileUp className="w-4 h-4 text-green-600 dark:text-green-400" />
                  Import Students
                </button>

                {/* Export */}
                <div className="relative group/export">
                  <button
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                  >
                    <FileDown className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
                    Export Students
                    <ChevronRight className="w-4 h-4 ml-auto" />
                  </button>
                  
                  {/* Export submenu */}
                  <div className="absolute left-full top-0 ml-0 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-gray-200 dark:border-slate-700 opacity-0 invisible group-hover/export:opacity-100 group-hover/export:visible transition-all duration-200 z-20 py-1">
                    <button
                      onClick={() => handleExport('excel')}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-150"
                    >
                      Export as Excel
                    </button>
                    <button
                      onClick={() => handleExport('csv')}
                      className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors duration-150"
                    >
                      Export as CSV
                    </button>
                  </div>
                </div>

                {/* Bulk Photo Upload */}
                <button
                  onClick={() => setShowBulkPhotoUpload(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <Camera className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                  Bulk Photo Upload
                </button>

                {/* Folder Photo Upload */}
                <button
                  onClick={() => setShowFolderPhotoUpload(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <FolderOpen className="w-4 h-4 text-violet-500 dark:text-violet-400" />
                  Folder Photo Upload
                </button>

                {/* Manage Duplicates */}
                <button
                  onClick={() => setShowDuplicatesManager(true)}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                  Find & Merge Duplicates
                </button>

                {/* Print */}
                <button
                  onClick={handlePrint}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <Printer className="w-4 h-4 text-red-600 dark:text-red-400" />
                  Print List
                </button>

                {/* Divider */}
                <div className="my-1 border-t border-gray-200 dark:border-slate-700"></div>

                {/* Attendance */}
                <button
                  onClick={() => router.push('/attendance')}
                  className="w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-slate-700 flex items-center gap-3 transition-colors duration-150"
                >
                  <UserCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  Mark Attendance
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Actions Panel - Only Show When Items Selected */}
        <AnimatePresence>
          {selectedLearners.length > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500 dark:border-blue-400">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">
                      {selectedLearners.length} student{selectedLearners.length !== 1 ? 's' : ''} selected
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-3 w-full sm:w-auto">
                    <select
                      value={bulkClass}
                      onChange={(e) => setBulkClass(e.target.value)}
                      className="flex-1 sm:flex-none px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">Select class...</option>
                      {classOptions.map((cls: any) => (
                        <option key={`class-${cls.id}`} value={cls.id}>
                          {cls.name}
                        </option>
                      ))}
                    </select>
                    
                    <button
                      onClick={handleBulkAssign}
                      disabled={!bulkClass}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 whitespace-nowrap"
                    >
                      Assign Class
                    </button>
                    
                    <button
                      onClick={() => {
                        setSelectedLearners([]);
                        setBulkClass('');
                      }}
                      className="px-3 py-2 rounded-lg border border-gray-300 dark:border-slate-600 text-gray-700 dark:text-gray-200 text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors duration-200 whitespace-nowrap"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Filter Dropdowns - Collapsible */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                {/* Compact select inputs */}
                <select
                  value={selectedClass}
                  onChange={(e) => {
                    setSelectedClass(e.target.value);
                    setPage(1);
                  }}
                  className="input-field text-sm shadow-sm focus:shadow-md transition-all duration-200"
                >
                  <option value="">All Classes</option>
                  {classOptions.map((cls: any) => (
                    <option key={`class-${cls.id}`} value={cls.id}>
                      {cls.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedStream}
                  onChange={(e) => {
                    setSelectedStream(e.target.value);
                    setPage(1);
                  }}
                  className="input-field text-sm shadow-sm focus:shadow-md transition-all duration-200"
                >
                  <option value="">All Streams</option>
                  {streamOptions.map((stream: any) => (
                    <option key={`stream-${stream.id}`} value={stream.id}>
                      {stream.name}
                    </option>
                  ))}
                </select>

                <select
                  value={selectedGender}
                  onChange={(e) => {
                    setSelectedGender(e.target.value);
                    setPage(1);
                  }}
                  className="input-field text-sm shadow-sm focus:shadow-md transition-all duration-200"
                >
                  <option value="">All Genders</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>

                <select
                  value={selectedStatus}
                  onChange={(e) => {
                    setSelectedStatus(e.target.value);
                    setPage(1);
                  }}
                  className="input-field text-sm shadow-sm focus:shadow-md transition-all duration-200"
                >
                  <option value="">All Status</option>
                  {statusOptions.map((status) => (
                    <option key={`status-${status.value}`} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end pt-2 border-t border-gray-200 dark:border-slate-700">
                <button
                  onClick={clearFilters}
                  className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors duration-200 hover:underline"
                >
                  Clear all
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Alphabetical Filter - Compact Collapsible */}
        <AnimatePresence>
          {showAlphabetFilter && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-slate-700">
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => {
                      setSelectedLetter(null);
                      setPage(1);
                    }}
                    className={clsx(
                      'px-2 py-1 rounded text-xs font-semibold transition-all',
                      !selectedLetter
                        ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md scale-105'
                        : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                    )}
                  >
                    All
                  </button>
                  {'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((letter) => (
                    <button
                      key={letter}
                      onClick={() => {
                        setSelectedLetter(letter);
                        setPage(1);
                      }}
                      className={clsx(
                        'px-1.5 py-1 rounded text-xs font-semibold transition-all min-w-[1.75rem]',
                        selectedLetter === letter
                          ? 'bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-md scale-105'
                          : 'bg-gray-100 dark:bg-slate-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-slate-600'
                      )}
                    >
                      {letter}
                    </button>
                  ))}
                </div>
                {selectedLetter && (
                  <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                    Showing <span className="font-semibold text-gray-900 dark:text-white">{selectedLetter}</span> · {totalFiltered} result{totalFiltered !== 1 ? 's' : ''}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Enhanced Table Section */}
      <div className="card overflow-hidden shadow-xl">
        {/* Desktop Table with improved styling */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gradient-to-r from-gray-50 to-blue-50 dark:from-slate-700 dark:to-indigo-800/50 border-b border-gray-200 dark:border-gray-600">
              <tr>
                <th className="px-6 py-4 text-start">
                  <button
                    onClick={handleSelectAll}
                    className="flex items-center justify-center w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-500 transition-all duration-200 hover:scale-110"
                  >
                    {selectedLearners.length === paginatedRows.length && paginatedRows.length > 0 ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </th>
                <th className="px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Class & Stream
                </th>
                <th className="px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Attendance
                </th>
                <th className="hidden sm:table-cell px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Device ID
                </th>
                <th className="hidden md:table-cell px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Contact
                </th>
                <th className="px-6 py-4 text-start text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-4 text-end text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-600">
              {isLoading && (
                <tr key="loading-row">
                  <td colSpan={8} className="px-6 py-12 text-center">
                    <div className="flex flex-col items-center">
                      <Loader2 className="w-8 h-8 animate-spin text-gradient mb-2" />
                      <span className="text-gray-500 dark:text-gray-400">{t('common.loading')}</span>
                    </div>
                  </td>
                </tr>
              )}

              {!isLoading && paginatedRows.length === 0 && (
                <tr key="no-data-row">
                  <td colSpan={8} className="px-6 py-2">
                    <EmptyState
                      icon="👩‍🎓"
                      title="No students admitted yet"
                      description="Students must be registered before attendance can be tracked. Start by admitting your first student."
                      action={{ label: 'Admit First Student', href: '/students/admit' }}
                      learnMoreHref="/documentation/admitting-students"
                    />
                  </td>
                </tr>
              )}
              
              {paginatedRows.map((student) => (
                <motion.tr
                  key={`student-row-${student.id}`}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3 }}
                  className={clsx(
                    "table-row hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-all duration-200",
                    selectedLearners.includes(student.id) && "bg-blue-50 dark:bg-blue-900/20 ring-1 ring-blue-200 dark:ring-blue-700"
                  )}
                >
                  <td className="px-6 py-4">
                    <button
                      onClick={() => handleSelectLearner(student.id)}
                      className="flex items-center justify-center w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-500 transition-all duration-200 hover:scale-110"
                    >
                      {selectedLearners.includes(student.id) ? (
                        <CheckSquare className="w-4 h-4 text-blue-600" />
                      ) : (
                        <Square className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-3 min-w-0">
                      {getStudentAvatar(student)}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                          {editingCell?.studentId === student.id && editingCell.field === 'first_name' ? (
                            <div className="flex items-center gap-1 inline-edit-container">
                              <input
                                type="text"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={saveInlineEditCallback}
                                onKeyDown={handleInlineEditKeyDown}
                                className="border-2 border-blue-300 dark:border-blue-600 rounded px-1 py-0.5 text-sm font-medium bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 min-w-0 w-auto"
                                autoFocus
                                disabled={isUpdating}
                              />
                              {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                            </div>
                          ) : (
                            <span
                              onClick={() => startInlineEdit(student.id, 'first_name', student.first_name)}
                              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 rounded px-1 py-0.5 transition-colors"
                              title="Click to edit first name"
                            >
                              {student.first_name}
                            </span>
                          )}
                          {' '}
                          {editingCell?.studentId === student.id && editingCell.field === 'last_name' ? (
                            <div className="flex items-center gap-1 inline-edit-container">
                              <input
                                type="text"
                                value={editingValue}
                                onChange={(e) => setEditingValue(e.target.value)}
                                onBlur={saveInlineEditCallback}
                                onKeyDown={handleInlineEditKeyDown}
                                className="border-2 border-blue-300 dark:border-blue-600 rounded px-1 py-0.5 text-sm font-medium bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 min-w-0 w-auto"
                                autoFocus
                                disabled={isUpdating}
                              />
                              {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                            </div>
                          ) : (
                            <span
                              onClick={() => startInlineEdit(student.id, 'last_name', student.last_name)}
                              className="cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 rounded px-1 py-0.5 transition-colors"
                              title="Click to edit last name"
                            >
                              {student.last_name}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {getAdmissionNo(student)}
                        </div>
                      </div>

                      {/* New: small inline Edit Photo button */}
                      <button
                        onClick={() => openPhotoEditor(student)}
                        className="ml-3 p-1.5 rounded-md bg-white/70 dark:bg-slate-700 hover:shadow-md border border-gray-200 dark:border-slate-600 text-gray-600 dark:text-gray-200 transition"
                        title="Edit photo"
                      >
                        <Camera className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-gray-100">
                      {student.class_name || 'No Class'}
                    </div>
                    {student.stream_name && (
                      <div className="text-xs text-gray-500 dark:text-gray-400">
                        {student.stream_name}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center space-x-2">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {student.attendance_percentage || 0}%
                      </div>
                      <div className="w-16 bg-gray-200 rounded-full h-2">
                        <div 
                          className={clsx(
                            "h-2 rounded-full",
                            (student.attendance_percentage || 0) >= 85 ? "bg-green-500" :
                            (student.attendance_percentage || 0) >= 75 ? "bg-yellow-500" : "bg-red-500"
                          )}
                          style={{ width: `${student.attendance_percentage || 0}%` }}
                        />
                      </div>
                    </div>
                  </td>
                  <td className="hidden sm:table-cell px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {deviceIdEditingCell?.studentId === student.id ? (
                        <div className="flex items-center gap-2 device-id-edit-container">
                          <input
                            type="number"
                            value={deviceIdValue}
                            onChange={(e) => setDeviceIdValue(e.target.value)}
                            onBlur={saveDeviceIdCallback}
                            onKeyDown={handleDeviceIdKeyDown}
                            autoFocus
                            disabled={isUpdatingDeviceId}
                            className="border-2 border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm w-24 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500"
                            placeholder="Device ID"
                          />
                          {isUpdatingDeviceId && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </div>
                      ) : (
                        <>
                          {student.device_user_id ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                ID: {student.device_user_id}
                              </span>
                              <button
                                onClick={() => startDeviceIdEdit(student.id, student.device_user_id || 0)}
                                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                title="Edit Device ID"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startDeviceIdEdit(student.id, 0)}
                              className="text-xs text-gray-400 hover:text-blue-600 hover:underline transition-colors"
                            >
                              + Assign Device ID
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {student.device_name && !deviceIdEditingCell?.studentId && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {student.device_name}
                      </div>
                    )}
                  </td>
                  <td className="hidden md:table-cell px-6 py-4">
                    <div className="text-sm text-gray-900 dark:text-white">
                      {contactPhoneEditingCell?.studentId === student.id ? (
                        <div className="flex items-center gap-2 contact-phone-edit-container">
                          <input
                            type="tel"
                            value={contactPhoneValue}
                            onChange={(e) => setContactPhoneValue(e.target.value)}
                            onBlur={saveContactPhoneCallback}
                            onKeyDown={handleContactPhoneKeyDown}
                            autoFocus
                            disabled={isUpdatingContactPhone}
                            className="border-2 border-blue-300 dark:border-blue-600 rounded px-2 py-1 text-sm w-32 bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500"
                            placeholder="Phone"
                          />
                          {isUpdatingContactPhone && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </div>
                      ) : (
                        <>
                          {student.contact_phone ? (
                            <div className="flex items-center gap-2">
                              <span className="px-3 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
                                {student.contact_phone}
                              </span>
                              <button
                                onClick={() => startContactPhoneEdit(student.id, student.contact_phone || '')}
                                className="p-1 text-gray-400 hover:text-blue-600 rounded transition-colors"
                                title="Edit Contact"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => startContactPhoneEdit(student.id, '')}
                              className="text-xs text-gray-400 hover:text-green-600 hover:underline transition-colors"
                            >
                              + Add Contact
                            </button>
                          )}
                        </>
                      )}
                    </div>
                    {student.contact_name && !contactPhoneEditingCell?.studentId && (
                      <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        {student.contact_name}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <select
                        value={student.status || ''}
                        onChange={(e) => {
                          const newStatus = e.target.value as Student['status'] | '';
                          if (!newStatus) return;
                          // Intercept for suspend/expel so we can collect details and generate letter
                          if (newStatus === 'on_leave' || newStatus === 'suspended' || newStatus === 'expelled') {
                            // map legacy 'on_leave' -> suspend flow if desired; here treat 'suspended' explicitly
                            if (newStatus === 'suspended' || newStatus === 'on_leave') {
                              setStatusAction('suspend');
                            } else if (newStatus === 'expelled') {
                              setStatusAction('expel');
                            }
                            setStatusTargetStudent(student);
                            setStatusModalOpen(true);
                            return;
                          }
                          // default flow for other statuses
                          handleStatusChange(student, newStatus as Student['status']);
                        }}
                        className="appearance-none bg-transparent border-0 text-xs font-medium focus:ring-0 cursor-pointer"
                      >
                        <option value="">{t('students.select_status', 'Select status...')}</option>
                        {statusOptions.map((option) => (
                          <option key={`status-option-${option.value}`} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      {getStatusBadge(student.status)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-end">
                    <div className="flex items-center justify-end space-x-2 rtl:space-x-reverse">
                      <button
                        onClick={() => handleViewDetails(student)}
                        className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all dark:hover:bg-blue-900/20"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                      {getFingerprintButton(student)}
                      {getCaptureButton(student)}
                      <button
                        onClick={() => handleEdit(student)}
                        className="p-2 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all dark:hover:bg-orange-900/20"
                        title="Edit"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDelete(student)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all dark:hover:bg-red-900/20"
                        title="Delete"
                      >
                        <Trash className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Enhanced Mobile Cards */}
        <div className="lg:hidden space-y-4 p-4">
          {isLoading && (
            <div key="mobile-loading" className="flex flex-col items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gradient mb-2" />
              <span className="text-gray-500 dark:text-gray-400">{t('common.loading')}</span>
            </div>
          )}
          
          {!isLoading && paginatedRows.length === 0 && (
            <div key="mobile-no-data">
              <EmptyState
                icon="👩‍🎓"
                title="No students admitted yet"
                description="Register your first student to begin tracking attendance."
                action={{ label: 'Admit First Student', href: '/students/admit' }}
                learnMoreHref="/documentation/admitting-students"
              />
            </div>
          )}
          
          {paginatedRows.map((student) => (
            <motion.div
              key={`mobile-student-${student.id}`}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className={clsx(
                "card-glass p-4 space-y-3 shadow-lg hover:shadow-xl transition-all duration-300",
                selectedLearners.includes(student.id) && "ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3 rtl:space-x-reverse">
                  <button
                    onClick={() => handleSelectLearner(student.id)}
                    className="flex items-center justify-center w-5 h-5 rounded border-2 border-gray-300 hover:border-blue-500 transition-all duration-200 hover:scale-110"
                  >
                    {selectedLearners.includes(student.id) ? (
                      <CheckSquare className="w-4 h-4 text-blue-600" />
                    ) : (
                      <Square className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                  {getStudentAvatarLarge(student)}
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                      {editingCell?.studentId === student.id && editingCell.field === 'first_name' ? (
                        <div className="flex items-center gap-1 inline-edit-container">
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveInlineEditCallback}
                            onKeyDown={handleInlineEditKeyDown}
                            className="border-2 border-blue-300 dark:border-blue-600 rounded px-1 py-0.5 text-sm font-semibold bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 min-w-0 w-auto"
                            autoFocus
                            disabled={isUpdating}
                          />
                          {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </div>
                      ) : (
                        <span
                          onClick={() => startInlineEdit(student.id, 'first_name', student.first_name)}
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 rounded px-1 py-0.5 transition-colors"
                          title="Click to edit first name"
                        >
                          {student.first_name}
                        </span>
                      )}
                      {' '}
                      {editingCell?.studentId === student.id && editingCell.field === 'last_name' ? (
                        <div className="flex items-center gap-1 inline-edit-container">
                          <input
                            type="text"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onBlur={saveInlineEditCallback}
                            onKeyDown={handleInlineEditKeyDown}
                            className="border-2 border-blue-300 dark:border-blue-600 rounded px-1 py-0.5 text-sm font-semibold bg-white dark:bg-slate-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:border-blue-500 dark:focus:border-blue-400 min-w-0 w-auto"
                            autoFocus
                            disabled={isUpdating}
                          />
                          {isUpdating && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                        </div>
                      ) : (
                        <span
                          onClick={() => startInlineEdit(student.id, 'last_name', student.last_name)}
                          className="cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 rounded px-1 py-0.5 transition-colors"
                          title="Click to edit last name"
                        >
                          {student.last_name}
                        </span>
                      )}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400 font-mono">
                      {getAdmissionNo(student)}
                    </p>
                  </div>
                </div>
                
                {getStatusBadge(student.status)}
              </div>
              
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Class:</span>
                  <div className="text-gray-900 dark:text-gray-100">
                    {student.class_name || 'No Class'}
                  </div>
                </div>
                <div>
                  <span className="font-medium text-gray-600 dark:text-gray-400">Attendance:</span>
                  <div className="flex items-center space-x-2">
                    <span className="text-gray-900 dark:text-gray-100">
                      {student.attendance_percentage || 0}%
                    </span>
                    <div className="flex-1 bg-gray-200 rounded-full h-2">
                      <div 
                        className={clsx(
                          "h-2 rounded-full",
                          (student.attendance_percentage || 0) >= 85 ? "bg-green-500" :
                          (student.attendance_percentage || 0) >= 75 ? "bg-yellow-500" : "bg-red-500"
                        )}
                        style={{ width: `${student.attendance_percentage || 0}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                <div className="flex space-x-2 rtl:space-x-reverse">
                  <button
                    onClick={() => handleViewDetails(student)}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-blue-100 hover:text-blue-600 dark:hover:bg-blue-900/20 transition-all"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  {getFingerprintButton(student, true)}
                  {getCaptureButton(student, true)}
                  <button
                    onClick={() => handleEdit(student)}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-orange-100 hover:text-orange-600 dark:hover:bg-orange-900/20 transition-all"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(student)}
                    className="p-2 rounded-lg bg-gray-100 dark:bg-slate-600 text-gray-600 dark:text-gray-300 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/20 transition-all"
                    title="Delete"
                  >
                    <Trash className="w-4 h-4" />
                  </button>
                </div>
                
                <select
                  value={student.status || ''}
                  onChange={(e) => {
                    const newStatus = e.target.value as Student['status'] | '';
                    if (!newStatus) return;
                    // Intercept for suspend/expel so we can collect details and generate letter
                    if (newStatus === 'on_leave' || newStatus === 'suspended' || newStatus === 'expelled') {
                      // map legacy 'on_leave' -> suspend flow if desired; here treat 'suspended' explicitly
                      if (newStatus === 'suspended' || newStatus === 'on_leave') {
                        setStatusAction('suspend');
                      } else if (newStatus === 'expelled') {
                        setStatusAction('expel');
                      } 
                      setStatusTargetStudent(student);
                      setStatusModalOpen(true);
                      return;
                    }
                    // default flow for other statuses
                    handleStatusChange(student, newStatus as Student['status']);
                  }}
                  className="appearance-none bg-transparent border-0 text-xs font-medium focus:ring-0 cursor-pointer"
                >
                  <option value="">{t('students.select_status', 'Select status...')}</option>
                  {statusOptions.map((option) => (
                    <option key={`status-option-${option.value}`} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Add Pagination Component */}
      {!isLoading && total > 0 && (
        <div className="flex justify-center">
          <Pagination
            currentPage={page}
            totalPages={pages}
            onPageChange={setPage}
            totalItems={total}
            itemsPerPage={rowsPerPage}
          />
        </div>
      )}

      {/* Student Details Modal */}
      <LearnerDetailsModal
        open={detailsOpen}
        onClose={() => setDetailsOpen(false)}
        learner={selectedLearner}
        onRefresh={mutate}
      />

      {/* Student Edit Modal */}
      <EditStudentWizard
        open={editOpen}
        onClose={() => setEditOpen(false)}
        student={selectedStudent}
        onSubmit={handleSubmit}
      />

      {/* Student Add Modal */}
      <StudentWizard
        open={open}
        onClose={() => setOpen(false)}
        onCreated={() => {
          mutate(); // Refresh the data
        }}
        onSubmit={async (formData) => {
          // Auto-assign class and stream based on selected options
          if (bulkClass) {
            formData.class_id = bulkClass;
            formData.stream_id = selectedStream;
          }
          
          await handleSubmit(formData);
        }}
      />

      {/* Import Modal */}
      <ImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onImportSuccess={() => {
          setImportOpen(false);
          mutate(); // Refresh the data
          toast.success('Students imported successfully!');
        }}
      />

      {/* Bulk Photo Upload Modal */}
      <BulkPhotoUploadModal
        open={showBulkPhotoUpload}
        onClose={() => setShowBulkPhotoUpload(false)}
        students={rows || []} // Ensure we pass an array
        onUploadComplete={() => {
          setShowBulkPhotoUpload(false);
          mutate();
        }}
      />

      {/* Folder Photo Upload Modal */}
      <FolderPhotoUploadModal
        open={showFolderPhotoUpload}
        onClose={() => setShowFolderPhotoUpload(false)}
        students={(rows || []).map(s => ({
          id: s.id,
          person_id: (s as { person_id?: number }).person_id,
          first_name: s.first_name,
          last_name: s.last_name,
          admission_no: s.admission_no,
          photo_url: s.photo_url,
          class_name: (s as { class_name?: string }).class_name,
        }))}
        onUploadComplete={() => {
          setShowFolderPhotoUpload(false);
          mutate();
        }}
      />

      {/* Status Action Modal */}
      <StatusActionModal
        open={statusModalOpen}
        onClose={() => setStatusModalOpen(false)}
        student={statusTargetStudent}
        action={statusAction}
        onConfirm={async (reason?) => {
          if (statusAction === 'suspend' && reason) {
            // Enhanced suspend flow with reason and letter generation
            const letterResponse = await fetch('/api/letters/generate-suspension', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ student_id: statusTargetStudent?.id, reason }),
            });
            
            const letterResult = await letterResponse.json();
            
            if (letterResult.success) {
              // Auto-download the generated letter
              const pdfUrl = letterResult.data.url;
              const link = document.createElement('a');
              link.href = pdfUrl;
              link.download = `Suspension_Letter_${statusTargetStudent?.id}.pdf`;
              link.click();
              
              toast.success('Suspension letter generated and downloaded!', { duration: 4000 });
            } else {
              toast.error('Failed to generate suspension letter.', { duration: 4000 });
            }
          }
          
          handleStatusChange(statusTargetStudent!, statusAction === 'expel' ? 'expelled' : 'suspended');
        }}
        onCancel={() => setStatusModalOpen(false)}
      />

      {/* Fingerprint Modal */}
      <FingerprintModal
        open={fingerprintModalOpen}
        onClose={() => {
          setFingerprintModalOpen(false);
          setFingerprintStudent(null);
        }}
        student={fingerprintStudent}
        onFingerprintCaptured={(studentId, hasFingerprint) => {
          // Update local status immediately
          setFingerprintStatuses(prev => ({
            ...prev,
            [studentId]: { hasFingerprint, loading: false, lastFetched: Date.now() }
          }));
          
          // Dispatch custom event for other components
          window.dispatchEvent(new CustomEvent('fingerprintStatusChanged', {
            detail: { studentId, hasFingerprint }
          }));
          
          // Refresh data
          mutate();
        }}
      />

      {/* Photo Editor Modal */}
      <PhotoEditorModal
        open={photoEditorOpen}
        onClose={() => setPhotoEditorOpen(false)}
        student={photoEditorStudent}
        onSave={async (photoUrl) => {
          if (selectedLearner) {
            // Optimistically update the local state
          }
          
          mutate();
        }}
      />

      {/* Duplicates Manager */}
      <DuplicatesManager
        open={showDuplicatesManager}
        onClose={() => setShowDuplicatesManager(false)}
        onMergeComplete={() => {
          mutate();
        }}
      />
    </div>
  );
};

export default StudentTable;
