import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';

import { getSessionSchoolId } from '@/lib/auth';
// M-Pesa Configuration
const MPESA_CONFIG = {
  consumerKey: process.env.MPESA_CONSUMER_KEY || '',
  consumerSecret: process.env.MPESA_CONSUMER_SECRET || '',
  businessShortCode: process.env.MPESA_BUSINESS_SHORTCODE || '174379',
  passkey: process.env.MPESA_PASSKEY || '',
  callbackUrl: process.env.MPESA_CALLBACK_URL || '',
  environment: process.env.MPESA_ENVIRONMENT || 'sandbox'
};

// Get M-Pesa access token
async function getAccessToken(): Promise<string> {
  const url = MPESA_CONFIG.environment === 'live'
    ? 'https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials'
    : 'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials';
  
  const auth = Buffer.from(`${MPESA_CONFIG.consumerKey}:${MPESA_CONFIG.consumerSecret}`).toString('base64');
  
  try {
    const response = await fetch(url, {
      headers: { 'Authorization': `Basic ${auth}` }
    });
    const data = await response.json();
    return data.access_token || '';
  } catch (error) {
    console.error('M-Pesa access token error:', error);
    throw new Error('Failed to get M-Pesa access token');
  }
}

// Format timestamp for M-Pesa
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

// POST /api/finance/mpesa/stk-push
// Trigger M-Pesa STK push for payment
export async function POST(req: NextRequest) {
  let connection;
  
  try {
    // Enforce multi-tenant isolation: derive school_id from session
    const session = await getSessionSchoolId(req);
    if (!session) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const schoolId = session.schoolId;

    const body = await req.json();
    const { student_id,
      phone_number,
      amount,
      description = 'School Fees Payment',
      callback_url,
      created_by = 1 } = body;
    
    if (!student_id || !phone_number || !amount) {
      return NextResponse.json({
        success: false,
        error: 'student_id, phone_number, and amount are required'
      }, { status: 400 });
    }
    
    // Format phone number
    let formattedPhone = phone_number.replace(/\s/g, '');
    if (formattedPhone.startsWith('07')) {
      formattedPhone = '256' + formattedPhone.substring(1);
    }
    if (!/^256\d{9}$/.test(formattedPhone)) {
      return NextResponse.json({
        success: false,
        error: 'Invalid phone number format'
      }, { status: 400 });
    }
    
    connection = await getConnection();
    await connection.beginTransaction();
    
    // Get student info
    const [students] = await connection.execute(`
      SELECT s.id, s.admission_no, p.first_name, p.last_name
      FROM students s
      JOIN people p ON s.person_id = p.id
      WHERE s.id = ?
    `, [student_id]);
    
    if (!students.length) {
      throw new Error('Student not found');
    }
    
    const student = students[0];
    const transactionRef = `STK-${Date.now()}-${student_id}`;
    
    // Store pending transaction
    const [transactionResult] = await connection.execute(`
      INSERT INTO mobile_money_transactions (
        schoolId, payment_id, transaction_type, phone_number, amount,
        merchant_request_id, status, created_by
      ) VALUES (?, NULL, 'stk_push', ?, ?, ?, 'pending', ?)
    `, [schoolId, formattedPhone, amount, transactionRef, created_by]);
    
    const transactionId = transactionResult.insertId;
    await connection.commit();
    
    // Simulate STK push response (in production, call actual M-Pesa API)
    const stkResponse = await simulateSTKPush({
      phoneNumber: formattedPhone,
      amount,
      accountReference: `ST-${student.admission_no}`,
      transactionDesc: description,
      callBackURL: callback_url || MPESA_CONFIG.callbackUrl,
      merchantRequestId: transactionRef
    });
    
    await connection.beginTransaction();
    await connection.execute(`
      UPDATE mobile_money_transactions 
      SET checkout_request_id = ?, status = 'pending'
      WHERE id = ?
    `, [stkResponse.checkout_request_id, transactionId]);
    await connection.commit();
    
    return NextResponse.json({
      success: true,
      data: {
        transaction_id: transactionId,
        merchant_request_id: transactionRef,
        checkout_request_id: stkResponse.checkout_request_id,
        status: 'pending'
      }
    });
    
  } catch (error: any) {
    if (connection) await connection.rollback();
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to initiate M-Pesa payment'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}

// Simulate STK push
async function simulateSTKPush(params: any): Promise<any> {
  return {
    response_code: '0',
    response_description: 'Success. Request accepted for processing',
    merchant_request_id: params.merchantRequestId,
    checkout_request_id: `ws_CO_${Date.now()}${Math.random().toString(36).substring(7)}`
  };
}
