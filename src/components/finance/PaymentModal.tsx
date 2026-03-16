"use client";
import React, { useState, useEffect } from 'react';
import { Receipt, Download, Search } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'react-hot-toast';
import useSWR from 'swr';
import { fetcher } from '@/utils/fetcher';

interface PaymentData {
  id?: number;
  student_id: number;
  term_id: number;
  wallet_id: number;
  amount: number;
  discount_applied: number;
  tax_amount: number;
  method: string;
  paid_by: string;
  payer_contact: string;
  reference: string;
  gateway_reference?: string;
}

interface PaymentModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  mode: 'add' | 'edit';
  initialData?: PaymentData;
  schoolId: number;
}

const PaymentModal: React.FC<PaymentModalProps> = ({
  open,
  onClose,
  onSubmit,
  mode,
  initialData,
  schoolId
}) => {
  const [formData, setFormData] = useState<PaymentData>({
    student_id: 0,
    term_id: 0,
    wallet_id: 0,
    amount: 0,
    discount_applied: 0,
    tax_amount: 0,
    method: '',
    paid_by: '',
    payer_contact: '',
    reference: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [studentSearch, setStudentSearch] = useState('');
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);

  // Fetch data
  const { data: studentsData } = useSWR(
    studentSearch.length > 2 ? `/api/students/full?q=${studentSearch}&school_id=${schoolId}` : null,
    fetcher
  );
  const { data: termsData } = useSWR(`/api/terms?school_id=${schoolId}`, fetcher);
  const { data: walletsData } = useSWR(`/api/finance/wallets?school_id=${schoolId}`, fetcher);

  const students = studentsData?.data || [];
  const terms = termsData?.data || [];
  const wallets = walletsData?.data || [];

  const paymentMethods = [
    { value: 'cash', label: 'Cash Payment' },
    { value: 'bank_transfer', label: 'Bank Transfer' },
    { value: 'mpesa', label: 'Mobile Money (MPesa)' },
    { value: 'card', label: 'Card Payment' },
    { value: 'cheque', label: 'Cheque Payment' }
  ];

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setFormData(initialData);
        // Set student search to current student name
        const student = students.find((s: any) => s.id === initialData.student_id);
        if (student) {
          setStudentSearch(`${student.first_name} ${student.last_name}`);
        }
      } else {
        setFormData({
          student_id: 0,
          term_id: 0,
          wallet_id: 0,
          amount: 0,
          discount_applied: 0,
          tax_amount: 0,
          method: '',
          paid_by: '',
          payer_contact: '',
          reference: ''
        });
        setStudentSearch('');
      }
      setErrors({});
    }
  }, [open, mode, initialData]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.student_id) {
      newErrors.student_id = 'Student is required';
    }

    if (!formData.term_id) {
      newErrors.term_id = 'Term is required';
    }

    if (!formData.wallet_id) {
      newErrors.wallet_id = 'Wallet is required';
    }

    if (formData.amount <= 0) {
      newErrors.amount = 'Amount must be greater than 0';
    }

    if (!formData.method) {
      newErrors.method = 'Payment method is required';
    }

    if (!formData.paid_by.trim()) {
      newErrors.paid_by = 'Payer name is required';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const url = mode === 'edit' 
        ? `/api/finance/payments/${formData.id}`
        : '/api/finance/payments';
      
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          school_id: schoolId
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          mode === 'edit' 
            ? 'Payment updated successfully!' 
            : 'Payment recorded successfully!'
        );

        // For new payments, offer to download receipt
        if (mode === 'add' && result.receipt?.download_url) {
          toast.success(
            <div className="flex items-center space-x-2">
              <span>Receipt generated!</span>
              <button
                onClick={() => window.open(result.receipt.download_url, '_blank')}
                className="text-blue-600 underline flex items-center space-x-1"
              >
                <Download className="w-4 h-4" />
                <span>Download</span>
              </button>
            </div>,
            { duration: 5000 }
          );
        }

        onSubmit();
        onClose();
      } else {
        toast.error(result.error || 'Failed to save payment');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
      console.error('Payment save error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof PaymentData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({
        ...prev,
        [field]: ''
      }));
    }
  };

  const handleStudentSelect = (student: any) => {
    setFormData(prev => ({ ...prev, student_id: student.id }));
    setStudentSearch(`${student.first_name} ${student.last_name}`);
    setShowStudentDropdown(false);
    if (errors.student_id) {
      setErrors(prev => ({ ...prev, student_id: '' }));
    }
  };

  // Calculate net amount
  const netAmount = formData.amount - formData.discount_applied + formData.tax_amount;

  return (
    <Modal
      title={mode === 'edit' ? 'Edit Payment' : 'Record New Payment'}
      open={open}
      onClose={onClose}
      size="lg"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Student Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Student *
          </label>
          <div className="relative">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                value={studentSearch}
                onChange={(e) => {
                  setStudentSearch(e.target.value);
                  setShowStudentDropdown(true);
                }}
                onFocus={() => setShowStudentDropdown(true)}
                className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.student_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                placeholder="Search student by name or admission number..."
                disabled={isSubmitting}
              />
            </div>
            
            {/* Student Dropdown */}
            {showStudentDropdown && studentSearch.length > 2 && students.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white dark:bg-slate-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                {students.map((student: any) => (
                  <button
                    key={student.id}
                    type="button"
                    onClick={() => handleStudentSelect(student)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 border-b border-gray-100 dark:border-gray-700 last:border-b-0"
                  >
                    <div className="font-medium text-gray-900 dark:text-white">
                      {student.first_name} {student.last_name}
                    </div>
                    <div className="text-sm text-gray-500">
                      {student.admission_no} • {student.class_name}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {errors.student_id && (
            <p className="mt-1 text-sm text-red-600">{errors.student_id}</p>
          )}
        </div>

        {/* Term and Wallet */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Term *
            </label>
            <select
              value={formData.term_id}
              onChange={(e) => handleInputChange('term_id', parseInt(e.target.value))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.term_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              disabled={isSubmitting}
            >
              <option value="">Select Term</option>
              {terms.map((term: any) => (
                <option key={term.id} value={term.id}>
                  {term.name}
                </option>
              ))}
            </select>
            {errors.term_id && (
              <p className="mt-1 text-sm text-red-600">{errors.term_id}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Wallet *
            </label>
            <select
              value={formData.wallet_id}
              onChange={(e) => handleInputChange('wallet_id', parseInt(e.target.value))}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.wallet_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              disabled={isSubmitting}
            >
              <option value="">Select Wallet</option>
              {wallets.map((wallet: any) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name} ({wallet.currency} {wallet.current_balance?.toLocaleString()})
                </option>
              ))}
            </select>
            {errors.wallet_id && (
              <p className="mt-1 text-sm text-red-600">{errors.wallet_id}</p>
            )}
          </div>
        </div>

        {/* Amount Details */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Amount (UGX) *
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.amount}
              onChange={(e) => handleInputChange('amount', parseFloat(e.target.value) || 0)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.amount ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {errors.amount && (
              <p className="mt-1 text-sm text-red-600">{errors.amount}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Discount
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.discount_applied}
              onChange={(e) => handleInputChange('discount_applied', parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Tax
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.tax_amount}
              onChange={(e) => handleInputChange('tax_amount', parseFloat(e.target.value) || 0)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="0.00"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Net Amount Display */}
        {netAmount !== formData.amount && (
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <div className="text-sm text-blue-800 dark:text-blue-200">
              Net Amount: UGX {netAmount.toLocaleString()}
            </div>
          </div>
        )}

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Payment Method *
          </label>
          <select
            value={formData.method}
            onChange={(e) => handleInputChange('method', e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
              errors.method ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
            disabled={isSubmitting}
          >
            <option value="">Select Payment Method</option>
            {paymentMethods.map((method) => (
              <option key={method.value} value={method.value}>
                {method.label}
              </option>
            ))}
          </select>
          {errors.method && (
            <p className="mt-1 text-sm text-red-600">{errors.method}</p>
          )}
        </div>

        {/* Payer Information */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Paid By *
            </label>
            <input
              type="text"
              value={formData.paid_by}
              onChange={(e) => handleInputChange('paid_by', e.target.value)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.paid_by ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              placeholder="Name of person making payment"
              disabled={isSubmitting}
            />
            {errors.paid_by && (
              <p className="mt-1 text-sm text-red-600">{errors.paid_by}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Contact
            </label>
            <input
              type="text"
              value={formData.payer_contact}
              onChange={(e) => handleInputChange('payer_contact', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="Phone number or email"
              disabled={isSubmitting}
            />
          </div>
        </div>

        {/* Reference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Reference
          </label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => handleInputChange('reference', e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
            placeholder="Transaction reference or notes"
            disabled={isSubmitting}
          />
        </div>

        {/* Submit Buttons */}
        <div className="flex items-center justify-end space-x-4 pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
          >
            {isSubmitting && (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            )}
            <span>{mode === 'edit' ? 'Update Payment' : 'Record Payment'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default PaymentModal;
