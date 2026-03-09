export interface FingerprintCaptureResult {
  success: boolean;
  data?: string;
  error?: string;
  deviceInfo?: any;
}

export class FingerprintCapture {
  private static instance: FingerprintCapture;
  
  static getInstance(): FingerprintCapture {
    if (!FingerprintCapture.instance) {
      FingerprintCapture.instance = new FingerprintCapture();
    }
    return FingerprintCapture.instance;
  }

  // Check if device supports fingerprint capture
  async isSupported(): Promise<boolean> {
    // Check for WebAuthn support (real biometric integration)
    if (window.PublicKeyCredential && navigator.credentials) {
      try {
        const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        return available;
      } catch (error) {
        console.log('WebAuthn check failed:', error);
      }
    }

    // Always return true for demo purposes, but prefer real authentication
    return true;
  }

  // Capture fingerprint using WebAuthn (real device biometrics)
  async captureWebAuthn(studentId: number, schoolName: string = 'School'): Promise<FingerprintCaptureResult> {
    try {
      if (!window.PublicKeyCredential) {
        throw new Error('WebAuthn not supported');
      }

      const challenge = new Uint8Array(32);
      window.crypto.getRandomValues(challenge);

      const publicKeyCredentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: `${schoolName} Fingerprint System`,
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(studentId.toString()),
          name: `student_${studentId}`,
          displayName: `Student ${studentId}`,
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform", // Use platform authenticator (Touch ID, Face ID, etc.)
          userVerification: "required",
          requireResidentKey: false
        },
        timeout: 60000,
        attestation: "direct"
      };

      // This will trigger the device's native biometric prompt
      const credential = await navigator.credentials.create({
        publicKey: publicKeyCredentialCreationOptions
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      
      // Convert to secure format for storage
      const fingerprintData = {
        credentialId: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        publicKey: Array.from(new Uint8Array(response.getPublicKey() || [])),
        authenticatorData: Array.from(new Uint8Array(response.authenticatorData)),
        clientDataJSON: Array.from(new Uint8Array(response.clientDataJSON)),
        attestationObject: Array.from(new Uint8Array(response.attestationObject)),
        timestamp: Date.now()
      };

      return {
        success: true,
        data: btoa(JSON.stringify(fingerprintData)),
        deviceInfo: {
          type: 'webauthn_platform',
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          timestamp: new Date().toISOString(),
          credentialId: credential.id
        }
      };

    } catch (error: any) {
      console.error('WebAuthn capture error:', error);
      
      // Check for specific error types
      if (error.name === 'NotAllowedError') {
        return {
          success: false,
          error: 'Biometric authentication was cancelled or not available'
        };
      } else if (error.name === 'NotSupportedError') {
        return {
          success: false,
          error: 'Biometric authentication is not supported on this device'
        };
      }
      
      return {
        success: false,
        error: error.message || 'Failed to capture fingerprint via biometric sensor'
      };
    }
  }

  // Main capture method that uses real biometric authentication
  async capture(studentId: number): Promise<FingerprintCaptureResult> {
    try {
      // Always try real WebAuthn first for the most secure experience
      return await this.captureWebAuthn(studentId);
    } catch (error: unknown) {
      console.error('Fingerprint capture failed:', error);
      return {
        success: false,
        error: error.message || 'Fingerprint capture failed'
      };
    }
  }
}

export const fingerprintCapture = FingerprintCapture.getInstance();
