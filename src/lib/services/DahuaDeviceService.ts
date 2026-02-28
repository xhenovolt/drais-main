/**
 * DahuaDeviceService
 *
 * Service for communicating with Dahua fingerprint access control devices
 * via their authenticated HTTP CGI APIs
 *
 * Handles:
 * - Device connection testing
 * - System info retrieval
 * - Access log fetching
 * - Error handling and retries
 * - Timeout management
 */

import https from 'https';
import http from 'http';

export interface DahuaDeviceConfig {
  ip: string;
  port: number;
  username: string;
  password: string;
  timeout?: number;
  maxRetries?: number;
}

export interface DahuaSystemInfo {
  deviceType: string;
  serialNumber: string;
  firmwareVersion: string;
  hardwareVersion?: string;
  deviceName?: string;
}

export interface DahuaAccessLog {
  eventId: string;
  timestamp: string;
  userID?: string;
  cardNumber?: string;
  personName?: string;
  recordType?: string;
  accessResult?: 'Granted' | 'Denied' | 'Unknown';
}

export interface DeviceConnectionResponse {
  success: boolean;
  statusCode?: number;
  message: string;
  data?: DahuaSystemInfo;
  error?: string;
  responseTimeMs: number;
}

class DahuaDeviceService {
  private defaultTimeout = 5000; // 5 seconds
  private maxRetries = 3;

  /**
   * Test connection to Dahua device
   * Makes real HTTP request to /cgi-bin/magicBox.cgi?action=getSystemInfo
   */
  async testConnection(config: DahuaDeviceConfig): Promise<DeviceConnectionResponse> {
    const startTime = Date.now();
    const endpoint = `/cgi-bin/magicBox.cgi?action=getSystemInfo`;
    const protocol = config.port === 443 ? https : http;

    console.log(`[Dahua] Testing connection to ${config.ip}:${config.port}${endpoint}`);

    return new Promise((resolve) => {
      const options = {
        hostname: config.ip,
        port: config.port,
        path: endpoint,
        method: 'GET',
        timeout: config.timeout || this.defaultTimeout,
        auth: `${config.username}:${config.password}`,
        headers: {
          'Connection': 'close',
          'Accept': '*/*',
          'User-Agent': 'DRAIS-Device-Manager/1.0'
        },
        rejectUnauthorized: false // Allow self-signed certs
      };

      const handleError = (statusCode: number, errorMsg: string) => {
        const responseTime = Date.now() - startTime;
        console.log(`[Dahua] Connection failed: ${statusCode} - ${errorMsg} (${responseTime}ms)`);
        resolve({
          success: false,
          statusCode,
          message: errorMsg,
          error: errorMsg,
          responseTimeMs: responseTime
        });
      };

      const handleSuccess = (data: string) => {
        const responseTime = Date.now() - startTime;
        console.log(`[Dahua] Connection successful (${responseTime}ms)`);

        try {
          // Parse the response - Dahua returns key=value format
          const systemInfo = this.parseSystemInfo(data);

          if (systemInfo.serialNumber || systemInfo.deviceType) {
            console.log(`[Dahua] Device Info - Type: ${systemInfo.deviceType}, SN: ${systemInfo.serialNumber}`);
            resolve({
              success: true,
              statusCode: 200,
              message: 'Device connected successfully',
              data: systemInfo,
              responseTimeMs: responseTime
            });
          } else {
            resolve({
              success: false,
              statusCode: 200,
              message: 'Invalid response format from device',
              error: 'Response missing required fields (deviceType, serialNumber)',
              responseTimeMs: responseTime
            });
          }
        } catch (parseErr: any) {
          resolve({
            success: false,
            statusCode: 200,
            message: 'Failed to parse device response',
            error: parseErr.message,
            responseTimeMs: responseTime
          });
        }
      };

      const req = protocol.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            handleSuccess(responseData);
          } else if (res.statusCode === 401) {
            handleError(401, 'Authentication Failed - Invalid username or password');
          } else if (res.statusCode === 404) {
            handleError(404, 'API Not Available - CGI endpoints not enabled on device');
          } else {
            handleError(res.statusCode || 500, `HTTP ${res.statusCode}: ${res.statusMessage}`);
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        handleError(408, 'Device Not Reachable - Connection timeout');
      });

      req.on('error', (err: any) => {
        const responseTime = Date.now() - startTime;
        if (err.code === 'ECONNREFUSED') {
          console.error(`[Dahua] Connection refused: ${err.message}`);
          resolve({
            success: false,
            message: 'Device Not Reachable - Connection refused',
            error: err.message,
            responseTimeMs: responseTime
          });
        } else if (err.code === 'ENOTFOUND') {
          console.error(`[Dahua] Host not found: ${err.message}`);
          resolve({
            success: false,
            message: 'Device Not Reachable - Invalid IP address',
            error: 'Host not found',
            responseTimeMs: responseTime
          });
        } else {
          console.error(`[Dahua] Connection error: ${err.message}`);
          resolve({
            success: false,
            message: 'Device Not Reachable',
            error: err.message,
            responseTimeMs: responseTime
          });
        }
      });

      req.end();
    });
  }

  /**
   * Fetch access logs from device
   * Uses recordFinder.cgi endpoint to retrieve access records
   */
  async fetchAccessLogs(
    config: DahuaDeviceConfig,
    startTime?: number,
    maxRecords: number = 100
  ): Promise<{ success: boolean; logs?: DahuaAccessLog[]; error?: string }> {
    const protocol = config.port === 443 ? https : http;
    const timestamp = startTime || Math.floor(Date.now() / 1000) - 86400; // Default: last 24 hours

    const endpoint = `/cgi-bin/recordFinder.cgi?action=findRecord&StartTime=${timestamp}&maxResults=${maxRecords}`;

    console.log(`[Dahua] Fetching access logs from ${config.ip}:${config.port}`);

    return new Promise((resolve) => {
      const options = {
        hostname: config.ip,
        port: config.port,
        path: endpoint,
        method: 'GET',
        timeout: config.timeout || this.defaultTimeout,
        auth: `${config.username}:${config.password}`,
        headers: {
          'Connection': 'close',
          'Accept': '*/*',
          'User-Agent': 'DRAIS-Device-Manager/1.0'
        },
        rejectUnauthorized: false
      };

      const req = protocol.request(options, (res) => {
        let responseData = '';

        res.on('data', (chunk) => {
          responseData += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const logs = this.parseAccessLogs(responseData);
              console.log(`[Dahua] Fetched ${logs.length} access logs`);
              resolve({
                success: true,
                logs
              });
            } catch (err: any) {
              console.error(`[Dahua] Error parsing logs: ${err.message}`);
              resolve({
                success: false,
                error: `Failed to parse logs: ${err.message}`
              });
            }
          } else {
            resolve({
              success: false,
              error: `HTTP ${res.statusCode}: Failed to fetch logs`
            });
          }
        });
      });

      req.on('timeout', () => {
        req.destroy();
        resolve({ success: false, error: 'Request timeout' });
      });

      req.on('error', (err: any) => {
        console.error(`[Dahua] Log fetch error: ${err.message}`);
        resolve({ success: false, error: err.message });
      });

      req.end();
    });
  }

  /**
   * Parse Dahua CGI response format (key=value pairs)
   */
  private parseSystemInfo(response: string): DahuaSystemInfo {
    const lines = response.split('\n');
    const info: any = {};

    lines.forEach((line) => {
      const [key, value] = line.split('=');
      if (key && value) {
        info[key.trim().toLowerCase()] = value.trim();
      }
    });

    return {
      deviceType: info.devicetype || info.deviceType || 'Unknown',
      serialNumber: info.serialnumber || info.serialNumber || '',
      firmwareVersion: info.firmwareversion || info.firmwareVersion || '',
      hardwareVersion: info.hardwareversion || info.hardwareVersion,
      deviceName: info.devicename || info.deviceName
    };
  }

  /**
   * Parse access log response from recordFinder.cgi
   * Expected format: JSON array of objects with access event details
   */
  private parseAccessLogs(response: string): DahuaAccessLog[] {
    try {
      // Attempt JSON parse first (newer Dahua firmware)
      const parsed = JSON.parse(response);
      if (Array.isArray(parsed)) {
        return parsed.map((record: any) => ({
          eventId: record.EventID || record.eventId || '',
          timestamp: this.formatTimestamp(record.Time || record.timestamp || 0),
          userID: record.UserID || record.userId || '',
          cardNumber: record.CardNo || record.cardNumber || '',
          personName: record.PersonName || record.personName || '',
          recordType: record.RecordType || record.type || '',
          accessResult: this.parseAccessResult(record.Result || record.accessResult || 'Unknown')
        }));
      }
    } catch (e) {
      // Fall back to key=value parsing
    }

    // Parse CSV or key=value format
    const logs: DahuaAccessLog[] = [];
    const records = response.split('object=')[1]?.split('object=') || [];

    records.forEach((record) => {
      const obj: any = {};
      record.split(/\r?\n/).forEach((line) => {
        const [key, value] = line.split('=');
        if (key && value) {
          obj[key.trim()] = value.trim();
        }
      });

      if (obj.EventID || obj.Time) {
        logs.push({
          eventId: obj.EventID || obj.eventId || '',
          timestamp: this.formatTimestamp(parseInt(obj.Time) || 0),
          userID: obj.UserID || obj.userId || '',
          cardNumber: obj.CardNo || obj.cardNumber || '',
          personName: obj.PersonName || obj.personName || '',
          recordType: obj.RecordType || obj.type || '',
          accessResult: this.parseAccessResult(obj.Result || obj.accessResult || 'Unknown')
        });
      }
    });

    return logs;
  }

  /**
   * Convert Unix timestamp to ISO 8601 format
   */
  private formatTimestamp(unixTimestamp: number): string {
    try {
      return new Date(unixTimestamp * 1000).toISOString();
    } catch (e) {
      return new Date().toISOString();
    }
  }

  /**
   * Normalize access result from device
   */
  private parseAccessResult(result: string): 'granted' | 'denied' | 'unknown' {
    const normalized = result.toLowerCase();
    if (normalized.includes('grant') || normalized.includes('success') || normalized === '0') {
      return 'granted';
    } else if (normalized.includes('deny') || normalized.includes('fail') || normalized === '1') {
      return 'denied';
    }
    return 'unknown';
  }

  /**
   * Encode credentials for Basic Auth
   */
  encodeBasicAuth(username: string, password: string): string {
    return Buffer.from(`${username}:${password}`).toString('base64');
  }
}

export const dahuaService = new DahuaDeviceService();
export default DahuaDeviceService;
