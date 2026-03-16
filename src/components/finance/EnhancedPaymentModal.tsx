"use client";

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Receipt, 
  Download, 
  Search, 
  CreditCard, 
  Smartphone, 
  Building, 
  DollarSign,
  CheckCircle,
  XCircle,
  Loader2,
  Phone,
  FileText,
  Printer
} from 'lucide-react';
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

type MunoPayStatus = 'idle' | 'initiating' | 'pending' | 'success' | 'failed';

const EnhancedPaymentModal: React.FC<PaymentModalProps> = ({
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
  
  // MunoPay states
  const [munoPayStatus, setMunoPayStatus] = useState<MunoPayStatus>('idle');
  const [munoPayError, setMunoPayError] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [checkoutRequestId, setCheckoutRequestId] = useState<string>('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [generatedInvoice, setGeneratedInvoice] = useState<any>(null);
  const [generatedReceipt, setGeneratedReceipt] = useState<any>(null);

  // Fetch data
  const { data: studentsData } = useSWR(
    studentSearch.length > 2 ? `/api/students/full?q=${studentSearch}&school_id=${schoolId}` : null,
    fetcher
  );
  const { data: termsData } = useSWR(`/api/terms?school_id=${schoolId}`, fetcher);
  const { data: walletsData } = useSWR(`/api/finance/wallets?school_id=${schoolId}`, fetcher);
  const { data: schoolData } = useSWR('/api/school/info', fetcher);

  const students = (studentsData as any)?.data || [];
  const terms = (termsData as any)?.data || [];
  const wallets = (walletsData as any)?.data || [];
  const school = (schoolData as any)?.data || {};

  const paymentMethods = [
    { value: 'cash', label: 'Cash Payment', icon: DollarSign, color: 'text-green-600' },
    { value: 'mpesa', label: 'Mobile Money (M-Pesa)', icon: Smartphone, color: 'text-purple-600' },
    { value: 'bank_transfer', label: 'Bank Transfer', icon: Building, color: 'text-blue-600' },
    { value: 'card', label: 'Card Payment', icon: CreditCard, color: 'text-orange-600' }
  ];

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setFormData(initialData);
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
        setPhoneNumber('');
        setMunoPayStatus('idle');
        setMunoPayError('');
        setShowInvoice(false);
      }
      setErrors({});
    }
  }, [open, mode, initialData, students]);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.student_id) {
      newErrors.student_id = 'Student is required';
    }
    if (!formData.term_id) {
      newErrors.term_id = 'Term is required';
    }
    if (!formData.wallet_id && formData.method !== 'mpesa') {
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

    // MunoPay validation
    if (formData.method === 'mpesa') {
      if (!phoneNumber) {
        newErrors.phone = 'Phone number is required for mobile money';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // MunoPay STK Push
  const initiateMunoPay = async () => {
    setMunoPayStatus('initiating');
    setMunoPayError('');

    try {
      const response = await fetch('/api/finance/mpesa/stk-push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          school_id: schoolId,
          student_id: formData.student_id,
          phone_number: phoneNumber,
          amount: formData.amount,
          description: `School Fees Payment - ${formData.paid_by}`,
          paid_by: formData.paid_by,
          payer_contact: formData.payer_contact
        })
      });

      const result = await response.json();

      if (result.success) {
        setCheckoutRequestId(result.data.checkout_request_id);
        setMunoPayStatus('pending');
        
        // Poll for payment status
        pollPaymentStatus(result.data.checkout_request_id);
        
        toast.success('STK Push sent! Please check your phone.');
      } else {
        setMunoPayStatus('failed');
        setMunoPayError(result.error || 'Failed to initiate payment');
        toast.error(result.error || 'Failed to initiate payment');
      }
    } catch (error: any) {
      setMunoPayStatus('failed');
      setMunoPayError('Failed to connect to payment service');
      toast.error('Failed to connect to payment service');
    }
  };

  const pollPaymentStatus = async (checkoutId: string) => {
    // Poll for payment status every 3 seconds for 60 seconds
    let attempts = 0;
    const maxAttempts = 20;
    
    const poll = async () => {
      attempts++;
      
      try {
        const response = await fetch(`/api/finance/mpesa/status?checkout_request_id=${checkoutId}`);
        const result = await response.json();
        
        if (result.status === 'completed') {
          setMunoPayStatus('success');
          setGeneratedReceipt(result.receipt);
          setGeneratedInvoice(result.invoice);
          setShowInvoice(true);
          toast.success('Payment successful!');
          onSubmit();
        } else if (result.status === 'failed') {
          setMunoPayStatus('failed');
          setMunoPayError(result.error || 'Payment failed');
          toast.error('Payment failed');
        } else if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setMunoPayStatus('failed');
          setMunoPayError('Payment timeout - please check your phone and try again');
        }
      } catch (error) {
        if (attempts < maxAttempts) {
          setTimeout(poll, 3000);
        } else {
          setMunoPayStatus('failed');
          setMunoPayError('Failed to check payment status');
        }
      }
    };

    poll();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    // For M-Pesa, initiate STK Push instead of direct submission
    if (formData.method === 'mpesa') {
      await initiateMunoPay();
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

        if (result.receipt) {
          setGeneratedReceipt(result.receipt);
          setGeneratedInvoice(result.invoice);
          setShowInvoice(true);
        }

        onSubmit();
        onClose();
      } else {
        toast.error(result.error || 'Failed to save payment');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof PaymentData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
    
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
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

  const netAmount = formData.amount - formData.discount_applied + formData.tax_amount;

  const selectedMethod = paymentMethods.find(m => m.value === formData.method);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        className="bg-white dark:bg-slate-800 rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-auto"
      >
        {/* Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {mode === 'edit' ? 'Edit Payment' : 'Record New Payment'}
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {selectedMethod?.label || 'Select payment method'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <XCircle className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
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
                  className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                    errors.student_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                  } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                  placeholder="Search student..."
                  disabled={isSubmitting}
                />
              </div>
              
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
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.term_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                disabled={isSubmitting}
              >
                <option value="">Select Term</option>
                {terms.map((term: any) => (
                  <option key={term.id} value={term.id}>{term.name}</option>
                ))}
              </select>
              {errors.term_id && <p className="mt-1 text-sm text-red-600">{errors.term_id}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Wallet {!formData.method?.includes('mpesa') && '*'}
              </label>
              <select
                value={formData.wallet_id}
                onChange={(e) => handleInputChange('wallet_id', parseInt(e.target.value))}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.wallet_id ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                disabled={isSubmitting || formData.method === 'mpesa'}
              >
                <option value="">Select Wallet</option>
                {wallets.map((wallet: any) => (
                  <option key={wallet.id} value={wallet.id}>
                    {wallet.name} ({wallet.currency})
                  </option>
                ))}
              </select>
              {errors.wallet_id && <p className="mt-1 text-sm text-red-600">{errors.wallet_id}</p>}
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
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.amount ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                placeholder="0.00"
                disabled={isSubmitting}
              />
              {errors.amount && <p className="mt-1 text-sm text-red-600">{errors.amount}</p>}
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
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
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
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
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
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => handleInputChange('method', method.value)}
                  className={`flex items-center gap-3 px-4 py-3 border rounded-lg transition-all ${
                    formData.method === method.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 ring-2 ring-blue-500'
                      : 'border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-slate-700'
                  }`}
                  disabled={isSubmitting}
                >
                  <method.icon className={`w-5 h-5 ${method.color}`} />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {method.label}
                  </span>
                </button>
              ))}
            </div>
            {errors.method && <p className="mt-1 text-sm text-red-600">{errors.method}</p>}
          </div>

          {/* MunoPay Specific Fields */}
          <AnimatePresence>
            {formData.method === 'mpesa' && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center gap-2 mb-4">
                    <Smartphone className="w-5 h-5 text-purple-600" />
                    <h3 className="font-medium text-purple-900 dark:text-purple-100">
                      MunoPay Mobile Money
                    </h3>
                  </div>

                  {munoPayStatus === 'idle' && (
                    <div>
                      <p className="text-sm text-purple-700 dark:text-purple-300 mb-4">
                        Enter the phone number to receive STK push for payment.
                      </p>
                      <div>
                        <label className="block text-sm font-medium text-purple-800 dark:text-purple-200 mb-2">
                          Phone Number *
                        </label>
                        <div className="relative">
                          <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-purple-400" />
                          <input
                            type="text"
                            value={phoneNumber}
                            onChange={(e) => setPhoneNumber(e.target.value)}
                            className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-purple-500 ${
                              errors.phone ? 'border-red-500' : 'border-purple-300 dark:border-purple-600'
                            } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                            placeholder="07XXXXXXXX"
                          />
                        </div>
                        {errors.phone && <p className="mt-1 text-sm text-red-600">{errors.phone}</p>}
                      </div>
                    </div>
                  )}

                  {munoPayStatus === 'initiating' && (
                    <div className="text-center py-4">
                      <Loader2 className="w-8 h-8 text-purple-600 animate-spin mx-auto mb-2" />
                      <p className="text-purple-700 dark:text-purple-300">Initiating STK Push...</p>
                    </div>
                  )}

                  {munoPayStatus === 'pending' && (
                    <div className="text-center py-4">
                      <Smartphone className="w-12 h-12 text-yellow-500 mx-auto mb-2" />
                      <p className="text-yellow-700 dark:text-yellow-300 font-medium">
                        Check your phone for STK Push
                      </p>
                      <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                        Enter your M-Pesa PIN to complete payment
                      </p>
                      <button
                        type="button"
                        onClick={() => setMunoPayStatus('idle')}
                        className="mt-4 text-sm text-purple-600 hover:underline"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {munoPayStatus === 'success' && (
                    <div className="text-center py-4">
                      <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-2" />
                      <p className="text-green-700 dark:text-green-300 font-medium">
                        Payment Successful!
                      </p>
                    </div>
                  )}

                  {munoPayStatus === 'failed' && (
                    <div className="text-center py-4">
                      <XCircle className="w-12 h-12 text-red-500 mx-auto mb-2" />
                      <p className="text-red-700 dark:text-red-300 font-medium">
                        Payment Failed
                      </p>
                      {munoPayError && (
                        <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                          {munoPayError}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setMunoPayStatus('idle');
                          setMunoPayError('');
                        }}
                        className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors"
                      >
                        Try Again
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                  errors.paid_by ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                placeholder="Name of payer"
                disabled={isSubmitting}
              />
              {errors.paid_by && <p className="mt-1 text-sm text-red-600">{errors.paid_by}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Contact
              </label>
              <input
                type="text"
                value={formData.payer_contact}
                onChange={(e) => handleInputChange('payer_contact', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="Phone or email"
                disabled={isSubmitting}
              />
            </div>
          </div>

          {/* Reference */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Reference / Notes
            </label>
            <input
              type="text"
              value={formData.reference}
              onChange={(e) => handleInputChange('reference', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              placeholder="Transaction reference"
              disabled={isSubmitting}
            />
          </div>

          {/* Submit Buttons */}
          <div className="flex items-center justify-end gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
              disabled={isSubmitting || munoPayStatus === 'pending'}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || munoPayStatus === 'pending'}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {mode === 'edit' ? 'Update Payment' : formData.method === 'mpesa' ? 'Send STK Push' : 'Record Payment'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
};

export default EnhancedPaymentModal;
