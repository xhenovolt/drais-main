import { useState, useCallback } from 'react';
import { toast } from 'react-hot-toast';
import { fingerprintCapture } from '@/utils/fingerprintCapture';

interface FingerprintData {
  id: number;
  method: 'phone' | 'biometric';
  registered: boolean;
  createdAt: Date;
}

interface FingerprintStatus {
  studentId: number;
  fingerprints: FingerprintData[];
  hasPhone: boolean;
  hasBiometric: boolean;
}

interface WebAuthnCredential {
  id: string;
  rawId: string;
  response: {
    clientDataJSON: string;
    attestationObject: string;
  };
  type: string;
}

export const useFingerprint = () => {
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<FingerprintStatus | null>(null);
  const [demoMode, setDemoMode] = useState(false); // Start with real mode
  const [capturing, setCapturing] = useState(false);

  // Check if WebAuthn is supported
  const isWebAuthnSupported = useCallback(() => {
    return !!(
      window.PublicKeyCredential &&
      window.navigator.credentials &&
      window.navigator.credentials.create &&
      window.navigator.credentials.get
    );
  }, []);

  // Generate WebAuthn challenge - moved before createWebAuthnCredential
  const generateChallenge = useCallback(() => {
    const array = new Uint8Array(32);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }, []);

  // DEMO: Simplified credential creation for demonstration
  const createDemoCredential = useCallback((studentId: number) => {
    return {
      id: `demo_credential_${studentId}_${Date.now()}`,
      rawId: `demo_raw_${studentId}`,
      response: {
        clientDataJSON: `demo_client_data_${studentId}`,
        attestationObject: `demo_attestation_${studentId}`
      },
      type: 'public-key'
    };
  }, []);

  // Create WebAuthn credential - Real implementation with fallback
  const createWebAuthnCredential = useCallback(async (studentId: number): Promise<WebAuthnCredential | null> => {
    if (!isWebAuthnSupported()) {
      // Fallback to demo mode if WebAuthn not supported
      setDemoMode(true);
      toast.info('Using demo mode: WebAuthn not supported');
      await new Promise(resolve => setTimeout(resolve, 1500));
      return createDemoCredential(studentId);
    }

    try {
      const challenge = generateChallenge();
      
      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: new TextEncoder().encode(challenge),
        rp: {
          name: "School Biometric System",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(studentId.toString()),
          name: `student_${studentId}`,
          displayName: `Student ${studentId}`,
        },
        pubKeyCredParams: [{alg: -7, type: "public-key"}],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "direct"
      };

      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      
      return {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)).map(b => b.toString(16).padStart(2, '0')).join(''),
        response: {
          clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)).map(b => b.toString(16).padStart(2, '0')).join(''),
          attestationObject: Array.from(new Uint8Array(response.attestationObject)).map(b => b.toString(16).padStart(2, '0')).join('')
        },
        type: credential.type
      };
    } catch (error) {
      console.error('WebAuthn creation error:', error);
      // Fallback to demo mode on error
      setDemoMode(true);
      toast.info('Falling back to demo mode due to device limitations');
      await new Promise(resolve => setTimeout(resolve, 1500));
      return createDemoCredential(studentId);
    }
  }, [isWebAuthnSupported, generateChallenge, createDemoCredential]);

  // Get fingerprint status for a student
  const getFingerprintStatus = useCallback(async (studentId: number): Promise<FingerprintStatus | null> => {
    try {
      setLoading(true);
      const response = await fetch(`/api/students/${studentId}/fingerprint`);
      const result = await response.json();

      if (result.success) {
        setStatus(result.data);
        return result.data;
      } else {
        toast.error(result.error || 'Failed to get fingerprint status');
        return null;
      }
    } catch (error) {
      console.error('Error getting fingerprint status:', error);
      toast.error('Network error occurred');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  // Real fingerprint capture function
  const captureFingerprint = useCallback(async (studentId: number, method: 'phone' | 'biometric'): Promise<boolean> => {
    try {
      setCapturing(true);
      setLoading(true);

      // Show capture instructions
      toast('Place your finger on the scanner...', {
        duration: 3000,
        icon: '👆'
      });

      // Use real WebAuthn credential creation
      const credential = await createWebAuthnCredential(studentId);
      if (!credential) {
        return false;
      }

      // Send to backend
      const response = await fetch(`/api/students/${studentId}/fingerprint/capture`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprintData: JSON.stringify(credential),
          deviceInfo: {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            timestamp: new Date().toISOString(),
            method: method
          },
          method: method
        })
      });

      const backendResult = await response.json();

      if (backendResult.success) {
        toast.success('Fingerprint captured and stored successfully!');
        await getFingerprintStatus(studentId); // Refresh status
        return true;
      } else {
        toast.error(backendResult.error || 'Failed to store fingerprint');
        return false;
      }

    } catch (error: any) {
      console.error('Fingerprint capture error:', error);
      toast.error('An error occurred during fingerprint capture');
      return false;
    } finally {
      setCapturing(false);
      setLoading(false);
    }
  }, [createWebAuthnCredential, getFingerprintStatus]);

  // Add fingerprint with real capture
  const addFingerprint = useCallback(async (studentId: number, method: 'phone' | 'biometric'): Promise<boolean> => {
    return captureFingerprint(studentId, method);
  }, [captureFingerprint]);

  // Update fingerprint
  const updateFingerprint = useCallback(async (studentId: number, method: 'phone' | 'biometric'): Promise<boolean> => {
    try {
      setLoading(true);
      
      const credential = await createWebAuthnCredential(studentId);
      if (!credential) {
        return false;
      }

      const response = await fetch(`/api/students/${studentId}/fingerprint`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method,
          credential: JSON.stringify(credential)
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        await getFingerprintStatus(studentId);
        return true;
      } else {
        toast.error(result.error || 'Failed to update fingerprint');
        return false;
      }
    } catch (error) {
      console.error('Error updating fingerprint:', error);
      toast.error('Network error occurred');
      return false;
    } finally {
      setLoading(false);
    }
  }, [createWebAuthnCredential, getFingerprintStatus]);

  // Verify fingerprint with demo mode
  const verifyFingerprint = useCallback(async (studentId: number, method: 'phone' | 'biometric'): Promise<boolean> => {
    try {
      setLoading(true);
      
      const credential = await createWebAuthnCredential(studentId);
      if (!credential) {
        return false;
      }

      const response = await fetch(`/api/students/${studentId}/fingerprint/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method,
          credential: JSON.stringify(credential)
        })
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        return true;
      } else {
        toast.error(result.message || 'Fingerprint verification failed');
        return false;
      }
    } catch (error) {
      console.error('Error verifying fingerprint:', error);
      toast.error('Network error occurred');
      return false;
    } finally {
      setLoading(false);
    }
  }, [createWebAuthnCredential]);

  // Remove fingerprint
  const removeFingerprint = useCallback(async (studentId: number, method: 'phone' | 'biometric'): Promise<boolean> => {
    try {
      setLoading(true);
      
      const response = await fetch(`/api/students/${studentId}/fingerprint?method=${method}`, {
        method: 'DELETE'
      });

      const result = await response.json();

      if (result.success) {
        toast.success(result.message);
        await getFingerprintStatus(studentId);
        return true;
      } else {
        toast.error(result.error || 'Failed to remove fingerprint');
        return false;
      }
    } catch (error) {
      console.error('Error removing fingerprint:', error);
      toast.error('Network error occurred');
      return false;
    } finally {
      setLoading(false);
    }
  }, [getFingerprintStatus]);

  return {
    loading,
    status,
    demoMode,
    capturing,
    isWebAuthnSupported,
    getFingerprintStatus,
    addFingerprint,
    updateFingerprint,
    verifyFingerprint,
    removeFingerprint,
    captureFingerprint
  };
};
