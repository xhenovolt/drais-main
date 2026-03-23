import { NextRequest, NextResponse } from 'next/server';
import { getConnection } from '@/lib/db';
import { getSessionSchoolId } from '@/lib/auth';

/**
 * POST /api/attendance/devices/test-connection
 * Test connection to a biometric device
 * 
 * Body params:
 * - device_type: 'dahua' | 'zkteco' | 'other'
 * - ip_address: string
 * - port: number
 * - username: string
 * - password: string
 * - protocol: 'http' | 'https'
 * - api_url: string (optional, for Dahua)
 */
export async function POST(req: NextRequest) {
  const session = await getSessionSchoolId(req);
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const schoolId = session.schoolId;

  let connection;
  try {
    const body = await req.json();
    const {
      device_type,
      ip_address,
      port,
      username,
      password,
      protocol = 'http',
      api_url
    } = body;

    // Validate required fields
    if (!device_type || !ip_address || !port) {
      return NextResponse.json({
        success: false,
        error: 'device_type, ip_address, and port are required'
      }, { status: 400 });
    }

    const testResult = {
      success: false,
      message: '',
      response_time: null as number | null,
      device_info: null as any
    };

    const startTime = Date.now();

    try {
      // Test connection based on device type
      if (device_type === 'dahua') {
        // Dahua specific test
        const dahuaUrl = `${protocol}://${ip_address}:${port}${api_url || '/cgi-bin/attendanceRecord.cgi?action=getRecords'}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(dahuaUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Basic ${Buffer.from(`${username || ''}:${password || ''}`).toString('base64')}`,
            'Content-Type': 'text/plain'
          },
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        testResult.response_time = Date.now() - startTime;

        if (response.ok || response.status === 401) {
          // 401 is OK - it means the device responded with auth challenge
          testResult.success = true;
          testResult.message = `Device responded successfully (${response.status})`;
          
          // Try to parse response for device info
          try {
            const text = await response.text();
            testResult.device_info = {
              raw_response_preview: text.substring(0, 200),
              content_length: text.length
            };
          } catch (e) {
            // Ignore parse errors
          }
        } else {
          testResult.message = `Device returned status ${response.status}`;
        }
      } else if (device_type === 'zkteco') {
        // ZKTeco test - typically uses HTTP API
        const zktecoUrl = `${protocol}://${ip_address}:${port}/cgi/attendance`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(zktecoUrl, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        testResult.response_time = Date.now() - startTime;

        if (response.ok || response.status === 401) {
          testResult.success = true;
          testResult.message = 'Device connection successful';
        } else {
          testResult.message = `Device returned status ${response.status}`;
        }
      } else {
        // Generic HTTP test for other devices
        const testUrl = `${protocol}://${ip_address}:${port}`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(testUrl, {
          method: 'GET',
          signal: controller.signal
        });

        clearTimeout(timeoutId);
        testResult.response_time = Date.now() - startTime;

        if (response.ok || response.status === 401 || response.status === 403) {
          testResult.success = true;
          testResult.message = 'Device connection successful';
        } else {
          testResult.message = `Device returned status ${response.status}`;
        }
      }
    } catch (fetchError: any) {
      testResult.response_time = Date.now() - startTime;
      
      if (fetchError.name === 'AbortError') {
        testResult.message = 'Connection timeout - device may be unreachable';
      } else if (fetchError.code === 'ECONNREFUSED') {
        testResult.message = 'Connection refused - check IP and port';
      } else if (fetchError.code === 'ENOTFOUND') {
        testResult.message = 'Device not found - check IP address';
      } else {
        testResult.message = fetchError.message || 'Connection failed';
      }
    }

    // Log the connection attempt
    try {
      connection = await getConnection();
      await connection.execute(
        `INSERT INTO device_connection_logs 
         (device_id, action, status, request_data, response_status, error_message, ip_address) 
         VALUES (NULL, 'test_connection', ?, ?, ?, ?, ?)`,
        [
          testResult.success ? 'success' : 'failed',
          JSON.stringify({ device_type, ip_address, port }),
          testResult.success ? 200 : 500,
          testResult.message,
          req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
        ]
      );
    } catch (logError) {
      console.error('Failed to log connection attempt:', logError);
    }

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      data: {
        response_time_ms: testResult.response_time,
        device_info: testResult.device_info
      }
    });

  } catch (error: any) {
    console.error('Test connection error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test connection'
    }, { status: 500 });
  } finally {
    if (connection) await connection.end();
  }
}
