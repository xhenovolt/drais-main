'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Fingerprint, Copy, Link2, Smartphone, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface FingerprintRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: number;
  studentName: string;
  onSuccess?: (data: any) => void;
}

type RegisterMethod = 'usb' | 'link' | null;
type FingerPosition = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
type Hand = 'left' | 'right';

export const FingerprintRegistrationModal: React.FC<FingerprintRegistrationModalProps> = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  onSuccess
}) => {
  const [method, setMethod] = useState<RegisterMethod>(null);
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [fingerPosition, setFingerPosition] = useState<FingerPosition>('index');
  const [hand, setHand] = useState<Hand>('right');
  const [biometricUUID, setBiometricUUID] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [templateData, setTemplateData] = useState('');
  const [qualityScore, setQualityScore] = useState(0);
  const [devices, setDevices] = useState<any[]>([]);
  const [existingFingerprints, setExistingFingerprints] = useState<any[]>([]);

  // Load existing fingerprints when modal opens
  React.useEffect(() => {
    if (isOpen) {
      loadExistingFingerprints();
      loadBiometricDevices();
    }
  }, [isOpen]);

  const loadExistingFingerprints = async () => {
    try {
      const response = await fetch(`/api/fingerprints?student_id=${studentId}`);
      const data = await response.json();
      if (data.success) {
        setExistingFingerprints(data.data);
      }
    } catch (error) {
      console.error('Error loading fingerprints:', error);
    }
  };

  const loadBiometricDevices = async () => {
    try {
      const response = await fetch('/api/biometric-devices');
      const data = await response.json();
      if (data.success) {
        setDevices(data.data);
      }
    } catch (error) {
      console.error('Error loading devices:', error);
    }
  };

  const handleUSBRegistration = async () => {
    if (!templateData) {
      toast.error('Please capture fingerprint using USB scanner');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/fingerprints?action=register-usb', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          template_data: templateData,
          template_format: 'ISO/IEC 19794-2',
          finger_position: fingerPosition,
          hand,
          quality_score: qualityScore,
          biometric_uuid: `USB-${Date.now()}`
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Fingerprint registered successfully');
        reloadFingerprints();
        resetForm();
        onSuccess?.(data.data);
      } else {
        toast.error(data.error || 'Failed to register fingerprint');
      }
    } catch (error) {
      toast.error('Error registering fingerprint');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkExisting = async () => {
    if (!deviceId || !biometricUUID) {
      toast.error('Please select device and enter biometric UUID');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/fingerprints?action=link-existing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          device_id: parseInt(deviceId),
          biometric_uuid: biometricUUID,
          finger_position: fingerPosition,
          hand
        })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Fingerprint linked successfully');
        reloadFingerprints();
        resetForm();
        onSuccess?.(data.data);
      } else {
        toast.error(data.error || 'Failed to link fingerprint');
      }
    } catch (error) {
      toast.error('Error linking fingerprint');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const reloadFingerprints = () => {
    loadExistingFingerprints();
  };

  const resetForm = () => {
    setMethod(null);
    setStep(1);
    setFingerPosition('index');
    setHand('right');
    setBiometricUUID('');
    setDeviceId('');
    setTemplateData('');
    setQualityScore(0);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const removeFingerprint = async (fingerprintId: number) => {
    if (!confirm('Are you sure you want to remove this fingerprint?')) return;

    try {
      const response = await fetch('/api/fingerprints?action=remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint_id: fingerprintId })
      });

      const data = await response.json();

      if (data.success) {
        toast.success('Fingerprint removed successfully');
        reloadFingerprints();
      } else {
        toast.error('Failed to remove fingerprint');
      }
    } catch (error) {
      toast.error('Error removing fingerprint');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 flex items-center justify-between border-b">
            <div className="flex items-center gap-3">
              <Fingerprint className="w-6 h-6" />
              <div>
                <h2 className="text-xl font-bold">Fingerprint Management</h2>
                <p className="text-indigo-100 text-sm">{studentName}</p>
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
          <div className="p-6 space-y-6">
            {/* Existing Fingerprints */}
            {existingFingerprints.length > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4" />
                  Registered Fingerprints
                </h3>
                <div className="space-y-2">
                  {existingFingerprints.map((fp) => (
                    <div
                      key={fp.id}
                      className="flex items-center justify-between bg-white p-3 rounded border border-blue-100"
                    >
                      <div className="flex items-center gap-3">
                        <Fingerprint className="w-4 h-4 text-blue-600" />
                        <div>
                          <p className="font-medium text-sm">
                            {fp.hand.charAt(0).toUpperCase() + fp.hand.slice(1)} {fp.finger_position}
                          </p>
                          <p className="text-xs text-gray-500">
                            Quality: {fp.quality_score}%
                            {fp.device_name && ` • Device: ${fp.device_name}`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => removeFingerprint(fp.id)}
                        className="text-red-600 hover:text-red-700 text-sm font-medium transition"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Method Selection */}
            {!method ? (
              <div className="space-y-4">
                <h3 className="font-semibold text-gray-900">Add New Fingerprint</h3>

                {/* USB Option */}
                <button
                  onClick={() => setMethod('usb')}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-100 p-3 rounded-lg">
                      <Smartphone className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Register via USB Scanner</p>
                      <p className="text-sm text-gray-600">
                        Connect USB fingerprint scanner and capture live
                      </p>
                    </div>
                  </div>
                </button>

                {/* Link Option */}
                <button
                  onClick={() => setMethod('link')}
                  className="w-full p-4 border-2 border-gray-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 p-3 rounded-lg">
                      <Link2 className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900">Link Existing Fingerprint</p>
                      <p className="text-sm text-gray-600">
                        Link fingerprint already registered on a biometric machine
                      </p>
                    </div>
                  </div>
                </button>
              </div>
            ) : method === 'usb' ? (
              // USB Registration Form
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">USB Scanner Registration</h3>
                  <button
                    onClick={() => setMethod(null)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Back
                  </button>
                </div>

                {/* Finger Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Finger Position
                  </label>
                  <select
                    value={fingerPosition}
                    onChange={(e) => setFingerPosition(e.target.value as FingerPosition)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="thumb">Thumb</option>
                    <option value="index">Index Finger</option>
                    <option value="middle">Middle Finger</option>
                    <option value="ring">Ring Finger</option>
                    <option value="pinky">Pinky Finger</option>
                  </select>
                </div>

                {/* Hand */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hand</label>
                  <div className="flex gap-4">
                    {['left', 'right'].map((h) => (
                      <label key={h} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hand"
                          value={h}
                          checked={hand === h}
                          onChange={(e) => setHand(e.target.value as Hand)}
                          className="w-4 h-4"
                        />
                        <span className="capitalize text-gray-700">{h}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Scanner Instructions */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <div className="flex gap-2">
                    <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-800">
                      <p className="font-semibold mb-1">Scanner Instructions:</p>
                      <ol className="list-decimal list-inside space-y-1">
                        <li>Connect USB fingerprint scanner</li>  
                        <li>Open fingerprint capture application</li>
                        <li>Scan the selected fingerposition</li>
                        <li>Copy the template data and paste below</li>
                      </ol>
                    </div>
                  </div>
                </div>

                {/* Template Data */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Fingerprint Template Data (Base64)
                  </label>
                  <textarea
                    value={templateData}
                    onChange={(e) => setTemplateData(e.target.value)}
                    placeholder="Paste fingerprint template data here..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 h-24 font-mono text-xs"
                  />
                </div>

                {/* Quality Score */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quality Score: {qualityScore}%
                  </label>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={qualityScore}
                    onChange={(e) => setQualityScore(parseInt(e.target.value))}
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    {qualityScore < 70 && '⚠️ Low quality - may not match well'}
                    {qualityScore >= 70 && qualityScore < 85 && '⚡ Acceptable quality'}
                    {qualityScore >= 85 && '✓ Good quality'}
                  </p>
                </div>

                {/* Register Button */}
                <button
                  onClick={handleUSBRegistration}
                  disabled={loading || !templateData}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Registering...' : 'Register Fingerprint'}
                </button>
              </div>
            ) : (
              // Link Existing Form
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-gray-900">Link Existing Fingerprint</h3>
                  <button
                    onClick={() => setMethod(null)}
                    className="text-sm text-gray-600 hover:text-gray-900"
                  >
                    ← Back
                  </button>
                </div>

                {/* Device Selection */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Biometric Device
                  </label>
                  {devices.length > 0 ? (
                    <select
                      value={deviceId}
                      onChange={(e) => setDeviceId(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    >
                      <option value="">Select a device...</option>
                      {devices.map((device) => (
                        <option key={device.id} value={device.id}>
                          {device.device_name} ({device.device_code})
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                      No biometric devices configured. Please contact administrator.
                    </div>
                  )}
                </div>

                {/* Finger Position */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Finger Position
                  </label>
                  <select
                    value={fingerPosition}
                    onChange={(e) => setFingerPosition(e.target.value as FingerPosition)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="thumb">Thumb</option>
                    <option value="index">Index Finger</option>
                    <option value="middle">Middle Finger</option>
                    <option value="ring">Ring Finger</option>
                    <option value="pinky">Pinky Finger</option>
                  </select>
                </div>

                {/* Hand */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Hand</label>
                  <div className="flex gap-4">
                    {['left', 'right'].map((h) => (
                      <label key={h} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio"
                          name="hand"
                          value={h}
                          checked={hand === h}
                          onChange={(e) => setHand(e.target.value as Hand)}
                          className="w-4 h-4"
                        />
                        <span className="capitalize text-gray-700">{h}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Biometric UUID */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Biometric UUID
                  </label>
                  <input
                    type="text"
                    value={biometricUUID}
                    onChange={(e) => setBiometricUUID(e.target.value)}
                    placeholder="Device fingerprint ID or UUID..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    This ID should come from your biometric device administrator
                  </p>
                </div>

                {/* Link Button */}
                <button
                  onClick={handleLinkExisting}
                  disabled={loading || !deviceId || !biometricUUID}
                  className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white font-medium py-2 px-4 rounded-lg transition flex items-center justify-center gap-2"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {loading ? 'Linking...' : 'Link Fingerprint'}
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default FingerprintRegistrationModal;
