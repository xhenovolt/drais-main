/**
 * Encryption Utility
 *
 * Handles symmetric encryption/decryption of sensitive device credentials
 * Uses AES-256-GCM for authenticated encryption at rest
 *
 * Environment variable required:
 * DEVICE_ENCRYPTION_KEY (32 bytes hex-encoded for AES-256)
 */

import crypto from 'crypto';

class EncryptionUtil {
  private encryptionKey: Buffer;

  constructor() {
    const keyEnv = process.env.DEVICE_ENCRYPTION_KEY;

    if (!keyEnv) {
      // Generate a default key if not provided (development only)
      console.warn('[Encryption] WARNING: DEVICE_ENCRYPTION_KEY not set. Using development key.');
      this.encryptionKey = Buffer.from(
        '0000000000000000000000000000000000000000000000000000000000000000',
        'hex'
      );
    } else {
      try {
        this.encryptionKey = Buffer.from(keyEnv, 'hex');
        if (this.encryptionKey.length !== 32) {
          throw new Error('Key must be 32 bytes (256 bits)');
        }
      } catch (err) {
        throw new Error(`Invalid DEVICE_ENCRYPTION_KEY format: must be 64 hex characters (${err})`);
      }
    }
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   * Returns: IV + AuthTag + Ciphertext (hex encoded)
   */
  encrypt(plaintext: string): string {
    try {
      const iv = crypto.randomBytes(16); // 128-bit IV
      const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);

      let encrypted = cipher.update(plaintext, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();

      // Format: IV(32) + AuthTag(32) + Ciphertext(variable)
      return `${iv.toString('hex')}${authTag.toString('hex')}${encrypted}`;
    } catch (error: any) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt AES-256-GCM encrypted data
   * Expects format: IV + AuthTag + Ciphertext (hex encoded)
   */
  decrypt(encryptedData: string): string {
    try {
      // Extract components
      const iv = Buffer.from(encryptedData.slice(0, 32), 'hex'); // First 16 bytes = 32 hex chars
      const authTag = Buffer.from(encryptedData.slice(32, 64), 'hex'); // Next 16 bytes = 32 hex chars
      const ciphertext = encryptedData.slice(64); // Remaining

      const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error: any) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate a secure encryption key (for setup/initialization only)
   */
  static generateKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Verify encryption key format
   */
  static isValidKeyFormat(key: string): boolean {
    try {
      const buf = Buffer.from(key, 'hex');
      return buf.length === 32;
    } catch (e) {
      return false;
    }
  }
}

export const encryptionUtil = new EncryptionUtil();
export default EncryptionUtil;
