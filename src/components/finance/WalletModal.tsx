"use client";
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wallet, Building, CreditCard, DollarSign } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import { toast } from 'react-hot-toast';

interface WalletData {
  id?: number;
  name: string;
  method: string;
  currency: string;
  opening_balance: number;
  account_number?: string;
  bank_name?: string;
}

interface WalletModalProps {
  open: boolean;
  onClose: () => void;
  onSubmit: () => void;
  mode: 'add' | 'edit';
  initialData?: WalletData;
  schoolId?: number;
}

const WalletModal: React.FC<WalletModalProps> = ({
  open,
  onClose,
  onSubmit,
  mode,
  initialData,
}: WalletModalProps) => {
  const [formData, setFormData] = useState<WalletData>({
    name: '',
    method: '',
    currency: 'UGX',
    opening_balance: 0,
    account_number: '',
    bank_name: ''
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Reset form when modal opens/closes or mode changes
  useEffect(() => {
    if (open) {
      if (mode === 'edit' && initialData) {
        setFormData(initialData);
      } else {
        setFormData({
          name: '',
          method: '',
          currency: 'UGX',
          opening_balance: 0,
          account_number: '',
          bank_name: ''
        });
      }
      setErrors({});
    }
  }, [open, mode, initialData]);

  const paymentMethods = [
    { value: 'cash', label: 'Cash', icon: DollarSign },
    { value: 'bank', label: 'Bank Account', icon: Building },
    { value: 'card', label: 'Card Payment', icon: CreditCard },
    { value: 'mobile_money', label: 'Mobile Money', icon: Wallet }
  ];

  const currencies = [
    { value: 'UGX', label: 'UGX - Ugandan Shilling' },
    { value: 'USD', label: 'USD - US Dollar' },
    { value: 'EUR', label: 'EUR - Euro' },
    { value: 'KES', label: 'KES - Kenyan Shilling' }
  ];

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Wallet name is required';
    }

    if (!formData.method) {
      newErrors.method = 'Payment method is required';
    }

    if (formData.opening_balance < 0) {
      newErrors.opening_balance = 'Opening balance cannot be negative';
    }

    if (formData.method === 'bank' && !formData.bank_name?.trim()) {
      newErrors.bank_name = 'Bank name is required for bank accounts';
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
        ? `/api/finance/wallets/${formData.id}`
        : '/api/finance/wallets';
      
      const method = mode === 'edit' ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const result = await response.json();

      if (result.success) {
        toast.success(
          mode === 'edit' 
            ? 'Wallet updated successfully!' 
            : 'Wallet created successfully!'
        );
        onSubmit();
        onClose();
      } else {
        toast.error(result.error || 'Failed to save wallet');
      }
    } catch (error) {
      toast.error('An error occurred while saving');
      console.error('Wallet save error:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (field: keyof WalletData, value: string | number) => {
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

  return (
    <Modal
      title={mode === 'edit' ? 'Edit Wallet' : 'Add New Wallet'}
      isOpen={open}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Wallet Name */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Wallet Name *
          </label>
          <input
            type="text"
            value={formData.name}
            onChange={(e) => handleInputChange('name', e.target.value)}
            className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
              errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
            } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
            placeholder="e.g., Main Cash Account"
            disabled={isSubmitting}
          />
          {errors.name && (
            <p className="mt-1 text-sm text-red-600">{errors.name}</p>
          )}
        </div>

        {/* Payment Method */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Payment Method *
          </label>
          <div className="grid grid-cols-2 gap-3">
            {paymentMethods.map((method) => {
              const IconComponent = method.icon;
              return (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => handleInputChange('method', method.value)}
                  className={`p-4 border-2 rounded-lg transition-all duration-200 ${
                    formData.method === method.value
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                      : 'border-gray-300 dark:border-gray-600 hover:border-gray-400'
                  }`}
                  disabled={isSubmitting}
                >
                  <div className="flex flex-col items-center space-y-2">
                    <IconComponent className={`w-6 h-6 ${
                      formData.method === method.value 
                        ? 'text-blue-600' 
                        : 'text-gray-500'
                    }`} />
                    <span className={`text-sm font-medium ${
                      formData.method === method.value 
                        ? 'text-blue-600' 
                        : 'text-gray-700 dark:text-gray-300'
                    }`}>
                      {method.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
          {errors.method && (
            <p className="mt-1 text-sm text-red-600">{errors.method}</p>
          )}
        </div>

        {/* Bank Details (show only for bank method) */}
        {formData.method === 'bank' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Bank Name *
              </label>
              <input
                type="text"
                value={formData.bank_name || ''}
                onChange={(e) => handleInputChange('bank_name', e.target.value)}
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                  errors.bank_name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
                placeholder="e.g., Stanbic Bank"
                disabled={isSubmitting}
              />
              {errors.bank_name && (
                <p className="mt-1 text-sm text-red-600">{errors.bank_name}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Account Number
              </label>
              <input
                type="text"
                value={formData.account_number || ''}
                onChange={(e) => handleInputChange('account_number', e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                placeholder="e.g., 1234567890"
                disabled={isSubmitting}
              />
            </div>
          </motion.div>
        )}

        {/* Currency and Opening Balance */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Currency
            </label>
            <select
              value={formData.currency}
              onChange={(e) => handleInputChange('currency', e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
              disabled={isSubmitting}
            >
              {currencies.map((currency) => (
                <option key={currency.value} value={currency.value}>
                  {currency.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Opening Balance
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={formData.opening_balance}
              onChange={(e) => handleInputChange('opening_balance', parseFloat(e.target.value) || 0)}
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
                errors.opening_balance ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              } bg-white dark:bg-slate-700 text-gray-900 dark:text-white`}
              placeholder="0.00"
              disabled={isSubmitting}
            />
            {errors.opening_balance && (
              <p className="mt-1 text-sm text-red-600">{errors.opening_balance}</p>
            )}
          </div>
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
            <span>{mode === 'edit' ? 'Update Wallet' : 'Create Wallet'}</span>
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default WalletModal;
