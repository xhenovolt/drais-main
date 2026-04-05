import { NextRequest, NextResponse } from 'next/server';

/**
 * DAHUA DEVICE SIMULATOR
 * Mimics the exact response format of a real Dahua Access Control Device
 * 
 * Real Dahua endpoint: http://<device-ip>/cgi-bin/attendanceRecord.cgi?action=getRecords
 * 
 * This simulator allows development and testing without physical device hardware.
 * In production, simply replace this URL with the real device IP.
 */

interface DahuaRecord {
  RecNo: number;
  UserID: string;
  CreateTime: number; // Unix timestamp
  Method: number; // 0=unknown, 6=card, 21=fingerprint
  Type: string; // 'Entry' or 'Exit'
}

/**
 * Generate simulated attendance records
 * In real scenario, these would come from the physical device
 */
function generateSimulatedRecords(count: number = 5): DahuaRecord[] {
  const records: DahuaRecord[] = [];
  const now = Math.floor(Date.now() / 1000);
  const methods = [21, 6, 0]; // fingerprint, card, unknown
  const types = ['Entry', 'Exit'];
  
  // Simulate recent scans
  for (let i = 0; i < count; i++) {
    records.push({
      RecNo: i + 1,
      UserID: String(101 + i), // Device user IDs: 101, 102, 103, 104, 105
      CreateTime: now - (count - i) * 60, // Scan every minute backwards
      Method: methods[Math.floor(Math.random() * methods.length)],
      Type: types[Math.floor(Math.random() * types.length)]
    });
  }
  
  return records;
}

/**
 * Format response exactly like real Dahua device
 * Example:
 * found=3
 * records[0].RecNo=1
 * records[0].UserID=101
 * records[0].CreateTime=1771782789
 * records[0].Method=21
 * records[0].Type=Entry
 */
function formatDahuaResponse(records: DahuaRecord[]): string {
  let response = `found=${records.length}\n`;
  
  records.forEach((record, index) => {
    response += `records[${index}].RecNo=${record.RecNo}\n`;
    response += `records[${index}].UserID=${record.UserID}\n`;
    response += `records[${index}].CreateTime=${record.CreateTime}\n`;
    response += `records[${index}].Method=${record.Method}\n`;
    response += `records[${index}].Type=${record.Type}\n`;
  });
  
  return response;
}

/**
 * GET /api/device-simulator/dahua/attendance
 * 
 * Query params:
 * - action: 'getRecords' (required, matches real Dahua API)
 * - count: number of records to generate (default: 5)
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');
    const count = parseInt(searchParams.get('count', 10) || '5', 10);
    
    // Validate action (real Dahua device requires this)
    if (action !== 'getRecords') {
      return new NextResponse('Invalid action', { 
        status: 400,
        headers: { 'Content-Type': 'text/plain' }
      });
    }
    
    // Generate simulated records
    const records = generateSimulatedRecords(count);
    
    // Format response exactly like real device
    const response = formatDahuaResponse(records);
    
    // Return plain text (Dahua devices return plain text, not JSON)
    return new NextResponse(response, {
      status: 200,
      headers: { 
        'Content-Type': 'text/plain; charset=utf-8'
      }
    });
    
  } catch (error: any) {
    console.error('[Dahua Simulator] Error:', error);
    return new NextResponse('Internal server error', { 
      status: 500,
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * POST endpoint (for future expansion)
 * Real Dahua devices might support POST for configuration
 */
export async function POST(req: NextRequest) {
  return new NextResponse('POST not supported in simulator mode', { 
    status: 501,
    headers: { 'Content-Type': 'text/plain' }
  });
}
