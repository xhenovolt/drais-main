"use client";
import React, { useState } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { Fragment } from 'react';
import { X, Fingerprint, Smartphone, Shield, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';

interface BiometricModalProps {
  open: boolean;
  onClose: () => void;
  student: any;
  date: string;
  onSuccess: () => void;
}

const BiometricModal: React.FC<BiometricModalProps> = ({
  open,
  onClose,
  student,
  date,
  onSuccess
}) => {
  const [processing, setProcessing] = useState(false);
  const [step, setStep] = useState<'choice' | 'setup' | 'verify'>('choice');

  const handleBiometricSetup = async () => {
    if (!student) return;
    
    setProcessing(true);
    setStep('setup');

    try {
      // Check if WebAuthn is supported
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn is not supported in this browser');
      }

      // Create credential options
      const createOptions = {
        publicKey: {
          challenge: new Uint8Array(32),
          rp: {
            name: "School Biometric System",
            id: window.location.hostname,
          },
          user: {
            id: new TextEncoder().encode(student.student_id.toString()),
            name: `${student.first_name} ${student.last_name}`,
            displayName: `${student.first_name} ${student.last_name}`,
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }],
          authenticatorSelection: {
            authenticatorAttachment: "platform",
            userVerification: "required",
          },
          timeout: 60000,
          attestation: "direct"
        }
      };

      // Create credential
      const credential = await navigator.credentials.create(createOptions) as any;
      
      if (!credential) {
        throw new Error('Failed to create credential');
      }

      // Register with backend
      const response = await fetch(`/api/students/${student.student_id}/fingerprint`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_id: credential.id,
          public_key: btoa(String.fromCharCode(...new Uint8Array(credential.response.publicKey))),
          method: 'passkey'
        })
      });

      if (response.ok) {
        toast.success('Biometric setup completed!');
        setStep('verify');
      } else {
        throw new Error('Failed to register biometric');
      }

    } catch (error: any) {
      console.error('Biometric setup error:', error);
      toast.error(error.message || 'Biometric setup failed');
      setStep('choice');
    } finally {
      setProcessing(false);
    }
  };

  const handleBiometricVerify = async () => {
    if (!student) return;
    
    setProcessing(true);

    try {
      // Get credential options for verification
      const getOptions = {
        publicKey: {
          challenge: new Uint8Array(32),
          timeout: 60000,
          userVerification: "required",
        }
      };

      // Get credential
      const credential = await navigator.credentials.get(getOptions) as any;
      
      if (!credential) {
        throw new Error('Verification failed');
      }

      // Verify with backend and mark attendance
      const response = await fetch('/api/attendance/biometric', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          credential_id: credential.id,
          authenticator_data: btoa(String.fromCharCode(...new Uint8Array(credential.response.authenticatorData))),
          client_data_json: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
          signature: btoa(String.fromCharCode(...new Uint8Array(credential.response.signature))),
          date: date
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        onSuccess();
      } else {
        throw new Error(result.error);
      }

    } catch (error: any) {
      console.error('Biometric verify error:', error);
      toast.error(error.message || 'Verification failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <Transition show={open} as={Fragment}>
      <Dialog onClose={onClose} className="relative z-50">
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-300"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-200"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30 backdrop-blur-sm" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-300"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-200"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md transform overflow-hidden rounded-2xl bg-white dark:bg-slate-800 p-6 shadow-xl transition-all">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    Biometric Attendance
                  </Dialog.Title>
                  <button
                    onClick={onClose}
                    className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {student && (
                  <div className="text-center mb-6">
                    <img
                      src={student.photo_url || '/default-avatar.png'}
                      alt={`${student.first_name} ${student.last_name}`}
                      className="w-20 h-20 rounded-full mx-auto mb-3 object-cover border-4 border-blue-500"
                    />
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      {student.first_name} {student.last_name}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {student.class_name}
                    </p>
                  </div>
                )}

                {step === 'choice' && (
                  <div className="space-y-4">
                    {student?.has_fingerprint ? (
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleBiometricVerify}
                        disabled={processing}
                        className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-4 rounded-xl font-medium flex items-center justify-center gap-3 hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                      >
                        <Fingerprint className="w-5 h-5" />
                        Verify & Mark Present
                      </motion.button>
                    ) : (
                      <div className="space-y-4">
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
                          <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300">
                            <AlertCircle className="w-5 h-5" />
                            <span className="font-medium">Setup Required</span>
                          </div>
                          <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-1">
                            This student needs to set up biometric authentication first.
                          </p>
                        </div>
                        
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleBiometricSetup}
                          disabled={processing}
                          className="w-full bg-gradient-to-r from-green-500 to-blue-600 text-white py-4 rounded-xl font-medium flex items-center justify-center gap-3 hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                        >
                          <Shield className="w-5 h-5" />
                          Setup Biometric
                        </motion.button>
                      </div>
                    )}
                  </div>
                )}

                {step === 'setup' && (
                  <div className="text-center space-y-4">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Smartphone className="w-16 h-16 text-blue-500 mx-auto" />
                    </motion.div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Setting up biometric...
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      Please follow the prompts to register your fingerprint or face ID.
                    </p>
                  </div>
                )}

                {step === 'verify' && (
                  <div className="text-center space-y-4">
                    <motion.div
                      animate={{ scale: [1, 1.1, 1] }}
                      transition={{ repeat: Infinity, duration: 2 }}
                    >
                      <Fingerprint className="w-16 h-16 text-green-500 mx-auto" />
                    </motion.div>
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Biometric Ready!
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      You can now use biometric verification for attendance.
                    </p>
                    <button
                      onClick={handleBiometricVerify}
                      disabled={processing}
                      className="w-full bg-gradient-to-r from-blue-500 to-purple-600 text-white py-3 rounded-xl font-medium hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                    >
                      Mark Attendance Now
                    </button>
                  </div>
                )}

                {processing && (
                  <div className="absolute inset-0 bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm flex items-center justify-center rounded-2xl">
                    <div className="text-center">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1 }}
                        className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"
                      />
                      <p className="text-sm text-gray-600 dark:text-gray-400">Processing...</p>
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BiometricModal;
