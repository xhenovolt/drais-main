'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Fingerprint, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface StaffBiometricModalProps {
  isOpen: boolean;
  onClose: () => void;
  staffId: number;
  staffName: string;
  onSuccess?: (data: any) => void;
}

export const StaffBiometricModal: React.FC<StaffBiometricModalProps> = ({
  isOpen,
  onClose,
  staffId,
  staffName,
  onSuccess
}) => {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [polling, setPolling] = useState(false);
  const [deviceSn, setDeviceSn] = useState('');
  const [devices, setDevices] = useState<any[]>([]);
  const [commandId, setCommandId] = useState<string | null>(null);
  const [enrollmentStatus, setEnrollmentStatus] = useState<'idle' | 'queued' | 'synced' | 'captured'>('idle');
  const [fingerprints, setFingerprints] = useState<any[]>([]);
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  // Local Direct Enrollment (mirrors the students list local-enroll flow).
  const [localDeviceIp, setLocalDeviceIp] = useState('');
  const localPollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load devices when modal opens
  useEffect(() => {
    if (isOpen) {
      loadDevices();
      loadBiometricStatus();
      const savedIp = typeof window !== 'undefined' ? localStorage.getItem('drais_local_device_ip') : null;
      if (savedIp) setLocalDeviceIp(savedIp);
    }
  }, [isOpen, staffId]);

  // Polling for enrollment status
  useEffect(() => {
    if (polling && commandId && step === 2) {
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`/api/staff/enroll-fingerprint?command_id=${commandId}`);
          const data = await response.json();

          if (data.success) {
            if (data.fingerprint_captured) {
              setEnrollmentStatus('captured');
              setPolling(false);
              toast.success('Fingerprint enrolled successfully on device!');
              loadBiometricStatus();
              // Move to success step after 2 seconds
              setTimeout(() => {
                setStep(3);
              }, 2000);
            } else if (data.command.status === 'acked' || data.command.status === 'completed') {
              setEnrollmentStatus('synced');
            } else {
              setEnrollmentStatus('queued');
            }
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000);

      setPollingInterval(interval);
      return () => clearInterval(interval);
    }
  }, [polling, commandId, step]);

  const loadDevices = async () => {
    try {
      const response = await fetch('/api/biometric-devices');
      const data = await response.json();
      if (data.success) {
        setDevices(data.data || []);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
      toast.error('Failed to load biometric devices');
    }
  };

  const loadBiometricStatus = async () => {
    try {
      const response = await fetch(`/api/staff/biometric-status?staff_id=${staffId}`);
      const data = await response.json();
      if (data.success) {
        setFingerprints(data.data.biometric_status.fingerprints || []);
      }
    } catch (error) {
      console.error('Error loading biometric status:', error);
    }
  };

  const handleStartEnrollment = async () => {
    if (!deviceSn) {
      toast.error('Please select a device');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/staff/enroll-fingerprint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          staff_id: staffId,
          device_sn: deviceSn
        })
      });

      const data = await response.json();

      if (data.success) {
        setCommandId(data.command_id?.toString());
        setEnrollmentStatus('queued');
        setStep(2);
        setPolling(true);
        toast.success('Enrollment queued. Please place your finger on the device.');
      } else {
        toast.error(data.error || 'Failed to start enrollment');
      }
    } catch (error: any) {
      toast.error(error.message || 'Error starting enrollment');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // ── Local Direct Enrollment ────────────────────────────────────────────────
  // Talks straight to a device on the local network via /api/device/local-enroll
  // (which accepts staff_id), then polls the truth-based status endpoint until
  // the fingerprint template actually reaches DRAIS. Mirrors the students list.
  const handleLocalEnroll = async () => {
    const ip = localDeviceIp.trim();
    if (!ip) { toast.error('Enter the local device IP first'); return; }
    if (typeof window !== 'undefined') localStorage.setItem('drais_local_device_ip', ip);
    setLoading(true);
    try {
      const response = await fetch('/api/device/local-enroll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ staff_id: staffId, device_ip: ip }),
      });
      const data = await response.json();
      if (!data?.success) { toast.error(data?.error || 'Local enrollment failed'); return; }

      // Device is ready — do NOT declare success yet; wait for the captured template.
      setEnrollmentStatus('synced');
      setStep(2);
      toast.success(`Scan finger now on ${ip}…`);

      const enrollmentId = data.enrollment_id;
      const startedAt = Date.now();
      const poll = async () => {
        if (Date.now() - startedAt > 90_000) {
          toast.error('Captured on device not yet confirmed by DRAIS — check device connectivity (ADMS).');
          setEnrollmentStatus('idle');
          setStep(1);
          return;
        }
        try {
          const st = enrollmentId
            ? await (await fetch(`/api/device/local-enroll/status?enrollment_id=${enrollmentId}`)).json()
            : null;
          if (st?.captured) {
            setEnrollmentStatus('captured');
            loadBiometricStatus();
            toast.success('Fingerprint captured and confirmed by DRAIS!');
            setTimeout(() => setStep(3), 1500);
            return;
          }
          if (st?.capture_status === 'failed') {
            toast.error(st.note || 'Enrollment failed on device.');
            setEnrollmentStatus('idle');
            setStep(1);
            return;
          }
        } catch { /* transient — keep polling */ }
        localPollRef.current = setTimeout(poll, 3000);
      };
      localPollRef.current = setTimeout(poll, 3000);
    } catch (error: any) {
      toast.error(error?.message || 'Direct connection failed');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (pollingInterval) {
      clearInterval(pollingInterval);
    }
    if (localPollRef.current) {
      clearTimeout(localPollRef.current);
      localPollRef.current = null;
    }
    setStep(1);
    setDeviceSn('');
    setCommandId(null);
    setEnrollmentStatus('idle');
    setPolling(false);
    onClose();
  };

  const handleSuccess = () => {
    toast.success('Biometric enrollment complete!');
    onSuccess?.({
      staff_id: staffId,
      fingerprint_count: fingerprints.length
    });
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white dark:bg-slate-800 rounded-lg shadow-xl w-full max-w-md mx-4"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between rounded-t-lg">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Biometric Enrollment</h2>
                <p className="text-indigo-100 text-sm">{staffName}</p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="hover:bg-white/20 p-2 rounded-lg transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Content */}
          <div className="p-6">
            {step === 1 ? (
              // Device Selection
              <div className="space-y-4">
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" />
                    Instructions
                  </h3>
                  <ol className="text-sm text-blue-800 dark:text-blue-200 space-y-1 list-decimal list-inside">
                    <li>Select a biometric device</li>
                    <li>Click "Start Enrollment"</li>
                    <li>Place your finger on the device</li>
                    <li>Complete enrollment on the device screen</li>
                  </ol>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Biometric Device
                  </label>
                  {devices.length > 0 ? (
                    <select
                      value={deviceSn}
                      onChange={(e) => setDeviceSn(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                    >
                      <option value="">Select a device...</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.device_code || device.sn}>
                          {device.device_name} (Serial: {device.device_code || device.sn})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
                      No biometric devices configured. Please contact administrator.
                    </div>
                  )}
                </div>

                {/* Current Fingerprints */}
                {fingerprints.length > 0 && (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-3">
                    <p className="text-sm text-green-800 dark:text-green-200 font-medium">
                      ✓ {fingerprints.length} fingerprint{fingerprints.length !== 1 ? 's' : ''} enrolled
                    </p>
                  </div>
                )}

                <button
                  onClick={handleStartEnrollment}
                  disabled={loading || !deviceSn}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Starting...' : 'Start Enrollment'}
                </button>

                {/* Local Direct Enrollment — enroll straight to a device on the LAN */}
                <div className="relative flex items-center gap-3 py-1">
                  <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                  <span className="text-xs text-gray-400">or enroll directly on a local device</span>
                  <span className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Local device IP
                  </label>
                  <input
                    type="text"
                    value={localDeviceIp}
                    onChange={(e) => setLocalDeviceIp(e.target.value)}
                    placeholder="e.g. 192.168.1.201"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-700 text-gray-900 dark:text-white"
                  />
                </div>
                <button
                  onClick={handleLocalEnroll}
                  disabled={loading || !localDeviceIp.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  <Fingerprint className="w-4 h-4" />
                  Local Direct Enrollment
                </button>
              </div>
            ) : step === 2 ? (
              // Polling/Waiting
              <div className="space-y-6 text-center">
                <div className="flex justify-center">
                  <div className="relative w-20 h-20">
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className="absolute inset-0"
                    >
                      <Fingerprint className="w-full h-full text-indigo-600" />
                    </motion.div>
                  </div>
                </div>

                <div>
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                    {enrollmentStatus === 'queued' && 'Connecting to device...'}
                    {enrollmentStatus === 'synced' && 'Ready to capture fingerprint'}
                    {enrollmentStatus === 'captured' && 'Fingerprint captured!'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {enrollmentStatus === 'queued' && 'Waiting for device to acknowledge identity sync'}
                    {enrollmentStatus === 'synced' && 'Place your finger on the device screen'}
                    {enrollmentStatus === 'captured' && 'Your fingerprint has been registered'}
                  </p>
                </div>

                <button
                  onClick={handleClose}
                  className="w-full bg-gray-300 hover:bg-gray-400 text-gray-800 font-medium py-2 px-4 rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            ) : (
              // Success
              <div className="space-y-6 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 15 }}
                  className="flex justify-center"
                >
                  <CheckCircle className="w-16 h-16 text-green-500" />
                </motion.div>

                <div>
                  <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-2">
                    Enrollment Complete!
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Biometric profile ready for {staffName}
                  </p>
                </div>

                <button
                  onClick={handleSuccess}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-lg transition"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default StaffBiometricModal;
