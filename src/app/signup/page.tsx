// src/app/signup/page.tsx
// School registration and first user creation

'use client';

import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { motion } from 'framer-motion';
import SystemThemeWrapper from '@/components/auth/SystemThemeWrapper';
import { Shield, Sparkles, Building2, User, Mail, Lock, Phone, CheckCircle2 } from 'lucide-react';

export default function SignupPage() {
  const { signup } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState<{ message: string; pendingApproval?: boolean } | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: '',
    schoolName: '', // Required for creating new school
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    // Clear validation error for this field
    if (validationErrors[name]) {
      setValidationErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[name];
        return newErrors;
      });
    }
    setError('');
  };

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.email.trim()) errors.email = 'Email is required';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Invalid email address';
    }
    if (!formData.password) errors.password = 'Password is required';
    if (formData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    if (formData.password !== formData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.schoolName.trim()) {
      errors.schoolName = 'School name is required';
    }

    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(null);

    if (!validateForm()) {
      return;
    }

    setIsLoading(true);

    try {
      const result = await signup({
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email,
        password: formData.password,
        confirmPassword: formData.confirmPassword,
        phone: formData.phone || undefined,
        schoolName: formData.schoolName,
      });

      if (result.success) {
        if (result.pendingApproval) {
          setSuccess({
            message: 'Account created successfully! Please wait for administrator approval before logging in.',
            pendingApproval: true,
          });
        }
        // If not pending, the user is auto-redirected by AuthContext
      } else {
        setError(result.error || 'Signup failed');
      }
    } catch (err) {
      console.error('Signup error:', err);
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  // Success state - show confirmation
  if (success?.pendingApproval) {
    return (
      <SystemThemeWrapper>
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-700 max-w-md w-full text-center"
        >
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-full">
              <CheckCircle2 className="w-12 h-12 text-emerald-600 dark:text-emerald-400" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">Account Created!</h2>
          <p className="text-gray-600 dark:text-gray-300 mb-6">{success.message}</p>
          <Link
            href="/auth/login"
            className="inline-block px-6 py-3 bg-indigo-600 dark:bg-indigo-500 text-white rounded-lg font-medium hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors shadow-sm"
          >
            Go to Login
          </Link>
        </motion.div>
      </div>
      </SystemThemeWrapper>
    );
  }

  return (
    <SystemThemeWrapper>
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 transition-colors">

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-md"
      >
        {/* Logo and Branding */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-center mb-6"
        >
          <div className="flex items-center justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">DRAIS</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">School Management System</p>
          
          <div className="flex items-center justify-center gap-2 text-indigo-600 dark:text-indigo-400 mt-3">
            <Sparkles className="w-4 h-4" />
            <span className="text-sm font-medium">Create Your School Account</span>
          </div>
        </motion.div>

        {/* Signup Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-8 shadow-lg border border-gray-200 dark:border-gray-700"
        >
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Get Started</h2>
            <p className="text-gray-600 dark:text-gray-400">Create your account and school</p>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-800 dark:text-red-300 text-sm"
            >
              {error}
            </motion.div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* School Name - First and most important */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Building2 className="w-4 h-4 inline mr-1" />
                School Name *
              </label>
              <input
                type="text"
                name="schoolName"
                value={formData.schoolName}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                  validationErrors.schoolName
                    ? 'border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Your School Name"
              />
              {validationErrors.schoolName && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">{validationErrors.schoolName}</p>
              )}
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  value={formData.firstName}
                  onChange={handleChange}
                  className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                             focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                    validationErrors.firstName
                      ? 'border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
                      : 'border-gray-300 dark:border-gray-600'
                  }`}
                  placeholder="John"
                />
                {validationErrors.firstName && (
                  <p className="text-red-500 dark:text-red-400 text-xs mt-1">{validationErrors.firstName}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Last Name
                </label>
                <input
                  type="text"
                  name="lastName"
                  value={formData.lastName}
                  onChange={handleChange}
                  className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                             focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                  placeholder="Doe"
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Mail className="w-4 h-4 inline mr-1" />
                Email Address *
              </label>
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                  validationErrors.email
                    ? 'border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="admin@yourschool.com"
              />
              {validationErrors.email && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">{validationErrors.email}</p>
              )}
            </div>

            {/* Phone */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Phone className="w-4 h-4 inline mr-1" />
                Phone (Optional)
              </label>
              <input
                type="tel"
                name="phone"
                value={formData.phone}
                onChange={handleChange}
                className="w-full px-4 py-2.5 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition"
                placeholder="+256700000000"
              />
            </div>

            {/* Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Lock className="w-4 h-4 inline mr-1" />
                Password *
              </label>
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                  validationErrors.password
                    ? 'border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Minimum 8 characters"
              />
              {validationErrors.password && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">{validationErrors.password}</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                <Lock className="w-4 h-4 inline mr-1" />
                Confirm Password *
              </label>
              <input
                type="password"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                className={`w-full px-4 py-2.5 bg-white dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500
                           focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition ${
                  validationErrors.confirmPassword
                    ? 'border-red-300 dark:border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Confirm your password"
              />
              {validationErrors.confirmPassword && (
                <p className="text-red-500 dark:text-red-400 text-xs mt-1">{validationErrors.confirmPassword}</p>
              )}
            </div>

            {/* Info Box */}
            <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-lg">
              <p className="text-indigo-800 dark:text-indigo-300 text-xs">
                You will become the Super Admin for your school. You can add more staff members after setup.
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-4 py-3 bg-indigo-600 dark:bg-indigo-500 text-white font-semibold rounded-lg
                         hover:bg-indigo-700 dark:hover:bg-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed
                         transition duration-200 shadow-sm"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Creating Account...
                </span>
              ) : (
                'Create Account & School'
              )}
            </button>
          </form>

          {/* Login Link */}
          <div className="mt-6 text-center">
            <p className="text-gray-600 dark:text-gray-400 text-sm">
              Already have an account?{' '}
              <Link href="/auth/login" className="text-indigo-600 dark:text-indigo-400 font-medium hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors">
                Sign in here
              </Link>
            </p>
          </div>
        </motion.div>

        {/* Footer */}
        <p className="text-center text-gray-600 dark:text-gray-400 text-xs mt-6">
          By creating an account, you agree to our Terms of Service and Privacy Policy
        </p>
      </motion.div>
    </div>
    </SystemThemeWrapper>
  );
}
