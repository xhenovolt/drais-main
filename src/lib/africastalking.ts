/**
 * AFRICASTALKING SMS Integration Utility
 * Uses official AFRICASTALKING SDK for reliable message delivery
 */

import AfricasTalking from 'africastalking';

export interface SMSResponse {
  success: boolean;
  messageId?: string;
  status?: string;
  cost?: string;
  phone?: string;
  recipientName?: string;
  error?: string;
  details?: any;
}

/**
 * Send SMS via AFRICASTALKING SDK
 */
export async function sendSMS(
  phoneNumber: string,
  message: string,
  recipientName?: string,
  shortCode?: string
): Promise<SMSResponse> {
  try {
    // Accept either env naming convention. Historically the codebase
    // mixed AFRICASTALKING_* (most callers) and AT_* (legacy reminder
    // route). Both work in production now.
    const username = process.env.AFRICASTALKING_USERNAME || process.env.AT_USERNAME;
    const apiKey   = process.env.AFRICASTALKING_API_KEY  || process.env.AT_API_KEY;

    if (!username || !apiKey) {
      console.warn('AFRICASTALKING credentials not configured. SMS sending disabled.');
      return {
        success: false,
        error: 'SMS service not configured'
      };
    }

    // Validate inputs
    const normalizedPhone = normalizePhoneNumber(phoneNumber);
    if (!normalizedPhone) {
      return {
        success: false,
        error: 'Invalid phone number format'
      };
    }

    if (!message || message.trim().length === 0) {
      return {
        success: false,
        error: 'Message cannot be empty'
      };
    }

    // Initialize SDK
    const AfricasTalkingInstance = AfricasTalking({
      apiKey,
      username
    });

    const sms = AfricasTalkingInstance.SMS;

    // Sender ID handling — Africa's Talking REQUIRES alphanumeric
    // sender IDs (e.g. "DRAIS", "ALBAYAN") to be pre-registered on
    // the account. If we pass an unregistered one, AT returns an empty
    // Recipients array with a sandbox-style error and the message is
    // never delivered. Only include `from` when the caller explicitly
    // configured a sender ID — let AT use its default otherwise.
    const sendPayload: { to: string[]; message: string; from?: string } = {
      to:      [normalizedPhone],
      message,
    };
    if (shortCode && shortCode.trim()) {
      sendPayload.from = shortCode.trim();
    }

    const result = await sms.send(sendPayload);

    // Parse response
    const recipients = result.SMSMessageData?.Recipients || [];

    if (recipients.length === 0) {
      // AT's SMSMessageData.Message carries the real error when the
      // Recipients array is empty (commonly "InvalidSenderId" or
      // "Your sandbox application can only send to safelisted numbers").
      const atMessage = result.SMSMessageData?.Message || 'unknown';
      console.error('No recipients in AFRICASTALKING response:', atMessage);
      return {
        success: false,
        error: `Provider rejected message: ${atMessage}`,
        details: { providerMessage: atMessage, sendPayload },
      };
    }

    const recipient = recipients[0];

    // Check if SMS was sent successfully
    if (recipient.status === 'Success') {
      console.log(`SMS sent successfully to ${phoneNumber}`, {
        messageId: recipient.messageId,
        cost: recipient.cost,
        recipient: recipientName
      });

      return {
        success: true,
        messageId: recipient.messageId,
        status: recipient.status,
        cost: recipient.cost,
        phone: normalizedPhone,
        recipientName: recipientName,
        details: {
          statusCode: result.SMSMessageData?.Message,
          sentAt: new Date().toISOString()
        }
      };
    } else {
      console.error(`SMS failed for ${phoneNumber}:`, recipient.status);
      return {
        success: false,
        error: `SMS sending failed: ${recipient.status}`,
        details: recipient
      };
    }

  } catch (error: any) {
    console.error('SMS sending error:', error);
    return {
      success: false,
      error: error.message || 'Failed to send SMS'
    };
  }
}

/**
 * Normalize phone number to international format
 * Accepts various formats and converts to +256...
 */
export function normalizePhoneNumber(phone: string): string | null {
  if (!phone) return null;

  // Remove common formatting characters
  let normalized = phone.replace(/[\s\-\(\)]/g, '');

  // If starts with 0, replace with +256
  if (normalized.startsWith('0')) {
    normalized = '+256' + normalized.substring(1);
  }
  // If starts with 256, add +
  else if (normalized.startsWith('256')) {
    normalized = '+' + normalized;
  }
  // If already has +, use as is
  else if (!normalized.startsWith('+')) {
    normalized = '+' + normalized;
  }

  // Validate format (should be +256 followed by 9 digits for Uganda)
  if (!/^\+256\d{9}$/.test(normalized)) {
    console.warn(`Invalid phone number format after normalization: ${normalized}`);
    return null;
  }

  return normalized;
}

/**
 * Log SMS activity for audit trail
 */
export async function logSMSActivity(
  phoneNumber: string,
  message: string,
  status: 'sent' | 'failed' | 'pending',
  recipientName?: string,
  messageId?: string
): Promise<void> {
  try {
    // You can implement database logging here if needed
    console.log('[SMS LOG]', {
      timestamp: new Date().toISOString(),
      phoneNumber,
      recipientName,
      messageId,
      status,
      messageLength: message.length
    });
  } catch (error) {
    console.error('Error logging SMS activity:', error);
  }
}
