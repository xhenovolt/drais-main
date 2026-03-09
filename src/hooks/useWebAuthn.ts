import { useState, useCallback } from 'react';

interface WebAuthnCredential {
  id: string;
  rawId: number[];
  type: string;
  response: {
    attestationObject?: number[];
    clientDataJSON: number[];
    authenticatorData?: number[];
    signature?: number[];
    userHandle?: number[] | null;
  };
}

export const useWebAuthn = () => {
  const [isSupported, setIsSupported] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  // Check WebAuthn support
  const checkSupport = useCallback(() => {
    const supported = !!(window.PublicKeyCredential && navigator.credentials);
    setIsSupported(supported);
    return supported;
  }, []);

  // Create a new credential (for registration)
  const createCredential = useCallback(async (
    userId: string,
    userName: string,
    displayName: string,
    authenticatorType: 'platform' | 'cross-platform' = 'cross-platform'
  ): Promise<WebAuthnCredential> => {
    if (!checkSupport()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    setIsCapturing(true);

    try {
      const credentialCreationOptions: PublicKeyCredentialCreationOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: {
          name: "School Biometric System",
          id: window.location.hostname,
        },
        user: {
          id: new TextEncoder().encode(userId),
          name: userName,
          displayName: displayName,
        },
        pubKeyCredParams: [
          {
            alg: -7, // ES256
            type: "public-key",
          },
          {
            alg: -257, // RS256
            type: "public-key",
          },
        ],
        authenticatorSelection: {
          authenticatorAttachment: authenticatorType,
          userVerification: 'required',
          requireResidentKey: false,
        },
        timeout: 60000,
        attestation: 'direct',
      };

      const credential = await navigator.credentials.create({
        publicKey: credentialCreationOptions,
      }) as PublicKeyCredential;

      if (!credential) {
        throw new Error('Failed to create credential');
      }

      // Convert credential to JSON-serializable format
      const credentialData: WebAuthnCredential = {
        id: credential.id,
        rawId: Array.from(new Uint8Array(credential.rawId)),
        type: credential.type,
        response: {
          attestationObject: Array.from(
            new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject)
          ),
          clientDataJSON: Array.from(new Uint8Array(credential.response.clientDataJSON)),
        },
      };

      return credentialData;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new Error('User denied permission or cancelled the operation');
      } else if (error.name === 'NotSupportedError') {
        throw new Error('This authenticator is not supported');
      } else if (error.name === 'InvalidStateError') {
        throw new Error('An authenticator is already registered for this account');
      } else if (error.name === 'ConstraintError') {
        throw new Error('The authenticator does not meet the requirements');
      } else {
        throw new Error(error.message || 'Failed to create credential');
      }
    } finally {
      setIsCapturing(false);
    }
  }, [checkSupport]);

  // Get an assertion (for authentication)
  const getAssertion = useCallback(async (
    allowedCredentials: PublicKeyCredentialDescriptor[] = []
  ): Promise<WebAuthnCredential> => {
    if (!checkSupport()) {
      throw new Error('WebAuthn is not supported in this browser');
    }

    setIsCapturing(true);

    try {
      const credentialRequestOptions: PublicKeyCredentialRequestOptions = {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: allowedCredentials,
        userVerification: 'required',
        timeout: 60000,
      };

      const assertion = await navigator.credentials.get({
        publicKey: credentialRequestOptions,
      }) as PublicKeyCredential;

      if (!assertion) {
        throw new Error('Failed to get assertion');
      }

      // Convert assertion to JSON-serializable format
      const assertionData: WebAuthnCredential = {
        id: assertion.id,
        rawId: Array.from(new Uint8Array(assertion.rawId)),
        type: assertion.type,
        response: {
          authenticatorData: Array.from(
            new Uint8Array((assertion.response as AuthenticatorAssertionResponse).authenticatorData)
          ),
          clientDataJSON: Array.from(new Uint8Array(assertion.response.clientDataJSON)),
          signature: Array.from(
            new Uint8Array((assertion.response as AuthenticatorAssertionResponse).signature)
          ),
          userHandle: assertion.response.userHandle 
            ? Array.from(new Uint8Array(assertion.response.userHandle))
            : null,
        },
      };

      return assertionData;
    } catch (error: any) {
      if (error.name === 'NotAllowedError') {
        throw new Error('User denied permission or cancelled the operation');
      } else if (error.name === 'InvalidStateError') {
        throw new Error('No credentials available for this account');
      } else {
        throw new Error(error.message || 'Failed to authenticate');
      }
    } finally {
      setIsCapturing(false);
    }
  }, [checkSupport]);

  return {
    isSupported,
    isCapturing,
    checkSupport,
    createCredential,
    getAssertion,
  };
};
