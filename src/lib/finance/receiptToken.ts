/**
 * Receipt verification token. The printed QR encodes a verify URL carrying this
 * token so anyone can confirm a receipt is genuine, while random receipt-number
 * guessing fails (the token can't be forged without the server secret).
 */
import crypto from 'node:crypto';

const SECRET = process.env.RECEIPT_VERIFY_SECRET || 'drais-receipt-v1';

export function receiptToken(receiptNo: string, paymentId: number | string): string {
  return crypto.createHash('sha256').update(`${receiptNo}:${paymentId}:${SECRET}`).digest('hex').slice(0, 16);
}

export function verifyReceiptToken(receiptNo: string, paymentId: number | string, token: string | null | undefined): boolean {
  if (!token) return false;
  const expected = receiptToken(receiptNo, paymentId);
  if (token.length !== expected.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected)); } catch { return false; }
}
