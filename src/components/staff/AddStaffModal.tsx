"use client";
import React, { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  X, Upload, User, Briefcase, Building, CreditCard, 
  UserCog, Camera, FileText, Eye, EyeOff 
} from 'lucide-react';
import { showToast } from '@/lib/toast';
import useSWR from 'swr';
import { apiFetch } from '@/lib/apiClient';
import { useDropzone } from 'react-dropzone';

interface AddStaffModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddStaffModal: React.FC<AddStaffModalProps> = ({ open, onClose, onSuccess }) => {
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState({
    // Personal Info
    first_name: '',
    last_name: '',
    other_name: '',
    gender: '',
    date_of_birth: '',
    phone: '',
    email: '',
    address: '',
    
    // Professional Info
    staff_no: '',
    position: '',
    employment_type: 'permanent',
    qualification: '',
    experience_years: 0,
    hire_date: '',
    salary: '',
    
    // Organizational Info
    department_id: '',
    branch_id: '',
    role_id: '',
    
    // Bank Info
    bank_name: '',
    bank_account_no: '',
    nssf_no: '',
    tin_no: '',
    
    // User Account
    create_account: false,
    username: '',
    password: '',
    confirm_password: ''
  });

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string>('');
  const [documents, setDocuments] = useState<{ [key: string]: File }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch dropdown data
  const { data: departmentsData } = useSWR('/api/departments/list');
  const { data: rolesData } = useSWR('/api/roles/list');

  const departments = departmentsData?.data || [];
  const roles = rolesData?.data || [];

  const steps = [
    { title: 'Personal Info', icon: User },
    { title: 'Professional', icon: Briefcase },
    { title: 'Organization', icon: Building },
    { title: 'Financial', icon: CreditCard },
    { title: 'Account Access', icon: UserCog }
  ];

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) {
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
    maxSize: 5 * 1024 * 1024 // 5MB
  });

  const validateStep = (step: number): boolean => {
    const newErrors: { [key: string]: string } = {};

    switch (step) {
      case 0: // Personal Info
        if (!formData.first_name.trim()) newErrors.first_name = 'First name is required';
        if (!formData.last_name.trim()) newErrors.last_name = 'Last name is required';
        if (formData.email && !/\S+@\S+\.\S+/.test(formData.email)) {
          newErrors.email = 'Invalid email format';
        }
        break;
      case 1: // Professional
        if (!formData.position.trim()) newErrors.position = 'Position is required';
        break;
      case 4: // Account Access
        if (formData.create_account) {
          if (!formData.email.trim()) newErrors.email = 'Email is required for login accounts';
          if (!formData.password) newErrors.password = 'Password is required';
          if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
          if (formData.password !== formData.confirm_password) {
            newErrors.confirm_password = 'Passwords do not match';
          }
        }
        break;
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateStep(currentStep)) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const handlePrevious = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  const handleSubmit = async () => {
    if (!validateStep(currentStep)) return;

    setLoading(true);
    try {
      const submitData = new FormData();
      
      // Append all form data
      Object.entries(formData).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          submitData.append(key, value.toString());
        }
      });

      // Append photo if selected
      if (photoFile) {
        submitData.append('photo', photoFile);
      }

      // Append documents
      Object.entries(documents).forEach(([key, file]) => {
        submitData.append(`document_${key}`, file);
      });

      const result = await apiFetch<{ message?: string }>('/api/staff/add', {
        method: 'POST',
        body: submitData,
        successMessage: 'Staff member added successfully!',
      });

      onSuccess();
      onClose();
      resetForm();
    } catch (error) {
      // apiFetch already shows error toast
      console.error('Submit error:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCurrentStep(0);
    setFormData({
      first_name: '', last_name: '', other_name: '', gender: '', date_of_birth: '',
      phone: '', email: '', address: '', staff_no: '', position: '',
      employment_type: 'permanent', qualification: '', experience_years: 0,
      hire_date: '', salary: '', department_id: '', branch_id: '', role_id: '',
      bank_name: '', bank_account_no: '', nssf_no: '', tin_no: '',
      create_account: false, username: '', password: '', confirm_password: ''
    });
    setPhotoFile(null);
    setPhotoPreview('');
    setDocuments({});
    setErrors({});
  };

  const renderPersonalInfo = () => (
    <div className="space-y-6">
      {/* Photo Upload */}
      <div className="text-center">
        <div
          {...getRootProps()}
          className={`mx-auto w-32 h-32 rounded-full border-4 border-dashed cursor-pointer transition-all ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
          } flex items-center justify-center overflow-hidden`}
        >
          <input {...getInputProps()} />
          {photoPreview ? (
            <img src={photoPreview} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <div className="text-center">
              <Camera className="w-8 h-8 text-gray-400 mx-auto mb-2" />
              <p className="text-xs text-gray-500">Upload Photo</p>
            </div>
          )}
        </div>
        {photoFile && (
          <button
            type="button"
            onClick={() => {
              setPhotoFile(null);
              setPhotoPreview('');
            }}
            className="mt-2 text-sm text-red-600 hover:text-red-700"
          >
            Remove Photo
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            First Name *
          </label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => handleInputChange('first_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.first_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter first name"
          />
          {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Last Name *
          </label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => handleInputChange('last_name', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.last_name ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter last name"
          />
          {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Other Names
          </label>
          <input
            type="text"
            value={formData.other_name}
            onChange={(e) => handleInputChange('other_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter other names"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Gender
          </label>
          <select
            value={formData.gender}
            onChange={(e) => handleInputChange('gender', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select gender</option>
            <option value="M">Male</option>
            <option value="F">Female</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date of Birth
          </label>
          <input
            type="date"
            value={formData.date_of_birth}
            onChange={(e) => handleInputChange('date_of_birth', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Phone Number
          </label>
          <input
            type="tel"
            value={formData.phone}
            onChange={(e) => handleInputChange('phone', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter phone number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Email Address
          </label>
          <input
            type="email"
            value={formData.email}
            onChange={(e) => handleInputChange('email', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.email ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter email address"
          />
          {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Address
          </label>
          <textarea
            value={formData.address}
            onChange={(e) => handleInputChange('address', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter home address"
          />
        </div>
      </div>
    </div>
  );

  const renderProfessionalInfo = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Staff Number
          </label>
          <input
            type="text"
            value={formData.staff_no}
            onChange={(e) => handleInputChange('staff_no', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Auto-generated if empty"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Position *
          </label>
          <input
            type="text"
            value={formData.position}
            onChange={(e) => handleInputChange('position', e.target.value)}
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
              errors.position ? 'border-red-500' : 'border-gray-300'
            }`}
            placeholder="Enter job position"
          />
          {errors.position && <p className="text-red-500 text-xs mt-1">{errors.position}</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Employment Type
          </label>
          <select
            value={formData.employment_type}
            onChange={(e) => handleInputChange('employment_type', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="permanent">Permanent</option>
            <option value="contract">Contract</option>
            <option value="volunteer">Volunteer</option>
            <option value="part-time">Part-time</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Experience (Years)
          </label>
          <input
            type="number"
            min="0"
            value={formData.experience_years}
            onChange={(e) => handleInputChange('experience_years', parseInt(e.target.value) || 0)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Hire Date
          </label>
          <input
            type="date"
            value={formData.hire_date}
            onChange={(e) => handleInputChange('hire_date', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Monthly Salary (UGX)
          </label>
          <input
            type="number"
            min="0"
            step="1000"
            value={formData.salary}
            onChange={(e) => handleInputChange('salary', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter monthly salary"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Qualification
          </label>
          <textarea
            value={formData.qualification}
            onChange={(e) => handleInputChange('qualification', e.target.value)}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter education qualifications and certificates"
          />
        </div>
      </div>
    </div>
  );

  const renderOrganizationInfo = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Department
          </label>
          <select
            value={formData.department_id}
            onChange={(e) => handleInputChange('department_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select department</option>
            {departments.map((dept: any) => (
              <option key={dept.id} value={dept.id}>{dept.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Role
          </label>
          <select
            value={formData.role_id}
            onChange={(e) => handleInputChange('role_id', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Select role</option>
            {roles.map((role: any) => (
              <option key={role.id} value={role.id}>{role.name}</option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );

  const renderFinancialInfo = () => (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bank Name
          </label>
          <input
            type="text"
            value={formData.bank_name}
            onChange={(e) => handleInputChange('bank_name', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter bank name"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Bank Account Number
          </label>
          <input
            type="text"
            value={formData.bank_account_no}
            onChange={(e) => handleInputChange('bank_account_no', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter account number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            NSSF Number
          </label>
          <input
            type="text"
            value={formData.nssf_no}
            onChange={(e) => handleInputChange('nssf_no', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter NSSF number"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            TIN Number
          </label>
          <input
            type="text"
            value={formData.tin_no}
            onChange={(e) => handleInputChange('tin_no', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            placeholder="Enter TIN number"
          />
        </div>
      </div>
    </div>
  );

  const renderAccountAccess = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-4 border border-gray-300 rounded-lg">
        <input
          type="checkbox"
          id="create_account"
          checked={formData.create_account}
          onChange={(e) => handleInputChange('create_account', e.target.checked)}
          className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
        />
        <label htmlFor="create_account" className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Create login account for this staff member
        </label>
      </div>

      {formData.create_account && (
        <div className="space-y-4 mt-4">
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm text-blue-700 dark:text-blue-300">
            The staff member will use their email ({formData.email || 'not set'}) to log in.
            {!formData.email && <span className="block mt-1 text-red-500 font-medium">Please enter an email in Step 1 first.</span>}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Password *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10 ${
                    errors.password ? 'border-red-500' : 'border-gray-300'
                  }`}
                  placeholder="Enter password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {errors.password && <p className="text-red-500 text-xs mt-1">{errors.password}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Confirm Password *
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={formData.confirm_password}
                onChange={(e) => handleInputChange('confirm_password', e.target.value)}
                className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.confirm_password ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="Confirm password"
              />
              {errors.confirm_password && <p className="text-red-500 text-xs mt-1">{errors.confirm_password}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderStepContent = () => {
    switch (currentStep) {
      case 0: return renderPersonalInfo();
      case 1: return renderProfessionalInfo();
      case 2: return renderOrganizationInfo();
      case 3: return renderFinancialInfo();
      case 4: return renderAccountAccess();
      default: return renderPersonalInfo();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Add New Staff</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Step {currentStep + 1} of {steps.length}: {steps[currentStep].title}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="px-6 py-4 bg-gray-50 dark:bg-slate-700/50">
          <div className="flex justify-between">
            {steps.map((step, index) => (
              <div
                key={index}
                className={`flex items-center ${index < steps.length - 1 ? 'flex-1' : ''}`}
              >
                <div className={`flex items-center justify-center w-8 h-8 rounded-full ${
                  index === currentStep 
                    ? 'bg-blue-600 text-white' 
                    : index < currentStep 
                    ? 'bg-green-600 text-white' 
                    : 'bg-gray-300 text-gray-600'
                }`}>
                  <step.icon className="w-4 h-4" />
                </div>
                <span className={`ml-2 text-sm font-medium ${
                  index === currentStep ? 'text-blue-600' : 'text-gray-600'
                }`}>
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-4 ${
                    index < currentStep ? 'bg-green-600' : 'bg-gray-300'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[60vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handlePrevious}
            disabled={currentStep === 0}
            className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            
            {currentStep === steps.length - 1 ? (
              <button
                onClick={handleSubmit}
                disabled={loading}
                className="px-6 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:shadow-lg transition-all disabled:opacity-50"
              >
                {loading ? 'Adding...' : 'Add Staff'}
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Next
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};

export default AddStaffModal;
