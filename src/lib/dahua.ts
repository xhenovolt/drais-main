/**
 * Dahua Device Integration Utilities
 * Parses and normalizes raw attendance data from Dahua biometric devices
 */

// Raw Dahua data format example:
// found=76
// records[0].RecNo=1
// records[0].CardNo=
// records[0].CreateTime=1771782789
// records[0].Method=21
// records[0].Type=Entry
// records[0].AttendanceState=0

export interface RawDahuaRecord {
  RecNo: string;
  CardNo: string;
  CreateTime: string;
  Method: string;
  Type: string;
  AttendanceState: string;
}

export interface NormalizedDahuaRecord {
  recNo: number;
  cardNo: string | null;
  userId: string | null;
  createTime: Date;
  createTimeUnix: number;
  method: string;
  methodType: 'fingerprint' | 'card' | 'face' | 'password' | 'unknown';
  type: 'Entry' | 'Exit' | 'Unknown';
  attendanceState: number;
}

export interface ParseResult {
  success: boolean;
  found: number;
  records: NormalizedDahuaRecord[];
  errors: string[];
}

/**
 * Parse the raw Dahua text format into structured data
 */
export function parseDahuaRawData(rawData: string): ParseResult {
  const result: ParseResult = {
    success: false,
    found: 0,
    records: [],
    errors: []
  };

  try {
    // Extract the 'found' count
    const foundMatch = rawData.match(/found=(\d+)/);
    if (foundMatch) {
      result.found = parseInt(foundMatch[1], 10);
    }

    // Extract all record entries
    const recordMatches = rawData.matchAll(/records\[(\d+)\]\.(\w+)=([^\r\n]*)/g);
    
    const recordsMap: Record<number, Record<string, string>> = {};

    for (const match of recordMatches) {
      const index = parseInt(match[1], 10);
      const key = match[2];
      const value = match[3].trim();

      if (!recordsMap[index]) {
        recordsMap[index] = {};
      }
      recordsMap[index][key] = value;
    }

    // Convert to normalized records
    for (const [index, record] of Object.entries(recordsMap)) {
      try {
        const rawRecord: RawDahuaRecord = {
          RecNo: record.RecNo || '',
          CardNo: record.CardNo || '',
          CreateTime: record.CreateTime || '',
          Method: record.Method || '',
          Type: record.Type || '',
          AttendanceState: record.AttendanceState || ''
        };

        const normalized = normalizeDahuaRecord(rawRecord, parseInt(index, 10));
        result.records.push(normalized);
      } catch (err: any) {
        result.errors.push(`Error parsing record ${index}: ${err.message}`);
      }
    }

    result.success = result.records.length > 0 || result.found === 0;
  } catch (err: any) {
    result.errors.push(`Parse error: ${err.message}`);
  }

  return result;
}

/**
 * Normalize a single Dahua record
 */
function normalizeDahuaRecord(record: RawDahuaRecord, index: number): NormalizedDahuaRecord {
  // Parse CreateTime (Unix timestamp)
  const createTimeUnix = parseInt(record.CreateTime, 10) || 0;
  const createTime = new Date(createTimeUnix * 1000);

  // Determine method type based on Method code
  // Dahua method codes: 0=Fingerprint, 1=Card, 2=Password, 3=Face, 21=Fingerprint (alternate)
  const methodType = mapMethodToType(record.Method);

  // Determine type (Entry/Exit)
  const type = record.Type === 'Entry' ? 'Entry' : record.Type === 'Exit' ? 'Exit' : 'Unknown';

  return {
    recNo: parseInt(record.RecNo, 10) || index + 1,
    cardNo: record.CardNo || null,
    userId: record.CardNo || null, // CardNo is often used as UserID
    createTime,
    createTimeUnix,
    method: record.Method,
    methodType,
    type,
    attendanceState: parseInt(record.AttendanceState, 10) || 0
  };
}

/**
 * Map Dahua method code to standard method type
 */
function mapMethodToType(method: string): 'fingerprint' | 'card' | 'face' | 'password' | 'unknown' {
  const methodNum = parseInt(method, 10);
  
  switch (methodNum) {
    case 0:
    case 21:
      return 'fingerprint';
    case 1:
    case 4:
    case 5:
      return 'card';
    case 2:
      return 'password';
    case 3:
    case 6:
      return 'face';
    default:
      return 'unknown';
  }
}

/**
 * Determine attendance status based on time
 * Configurable late threshold (default 30 minutes)
 */
export function determineAttendanceStatus(
  eventTime: Date,
  lateThresholdMinutes: number = 30,
  expectedStartHour: number = 8,
  expectedStartMinute: number = 0
): 'present' | 'late' {
  const expectedTime = new Date(eventTime);
  expectedTime.setHours(expectedStartHour, expectedStartMinute, 0, 0);
  
  const diffMinutes = (eventTime.getTime() - expectedTime.getTime()) / (1000 * 60);
  
  return diffMinutes > lateThresholdMinutes ? 'late' : 'present';
}

/**
 * Format Unix timestamp to human-readable datetime
 */
export function formatUnixToDateTime(unixTimestamp: number): string {
  const date = new Date(unixTimestamp * 1000);
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Format datetime to MySQL compatible format
 */
export function formatToMySQLDateTime(date: Date): string {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * Parse a raw date/time string from Dahua device
 */
export function parseDahuaDateTime(dateStr: string): Date | null {
  if (!dateStr) return null;
  
  // Try parsing as Unix timestamp first
  const unixTimestamp = parseInt(dateStr, 10);
  if (!isNaN(unixTimestamp)) {
    return new Date(unixTimestamp * 1000);
  }
  
  // Try parsing as regular date string
  const date = new Date(dateStr);
  return isNaN(date.getTime()) ? null : date;
}

/**
 * Build query URL for Dahua device API
 */
export function buildDahuaAPIUrl(
  baseUrl: string,
  ip: string,
  port: number,
  protocol: 'http' | 'https',
  action: string = 'getRecords'
): string {
  return `${protocol}://${ip}:${port}${baseUrl}`;
}

/**
 * Generate basic auth header for Dahua device
 */
export function generateDahuaAuthHeader(username: string, password: string): string {
  const credentials = Buffer.from(`${username}:${password}`).toString('base64');
  return `Basic ${credentials}`;
}

/**
 * Simulate API response for testing (when actual device is not available)
 */
export function generateMockDahuaData(recordCount: number = 10): string {
  const records: string[] = [];
  const now = Math.floor(Date.now() / 1000);
  
  for (let i = 0; i < recordCount; i++) {
    const cardNo = `CARD${1000 + i}`;
    const createTime = now - (i * 300); // 5 minutes apart
    const method = [0, 1, 2, 3, 21][Math.floor(Math.random() * 5)];
    const type = i % 2 === 0 ? 'Entry' : 'Exit';
    
    records.push(`records[${i}].RecNo=${i + 1}`);
    records.push(`records[${i}].CardNo=${cardNo}`);
    records.push(`records[${i}].CreateTime=${createTime}`);
    records.push(`records[${i}].Method=${method}`);
    records.push(`records[${i}].Type=${type}`);
    records.push(`records[${i}].AttendanceState=0`);
  }
  
  return `found=${recordCount}\n${records.join('\n')}`;
}
