/**
 * Device Connection Manager
 *
 * Manages device configuration persistence, connection monitoring,
 * and heartbeat checks
 */

import { getConnection } from '@/lib/db';
import { dahuaService, DahuaDeviceConfig, DeviceConnectionResponse } from './DahuaDeviceService';
import { encryptionUtil } from './EncryptionUtil';

export interface StoredDeviceConfig {
  id: number;
  schoolId: number;
  deviceName: string;
  deviceIp: string;
  devicePort: number;
  deviceUsername: string;
  deviceSerialNumber?: string;
  deviceType?: string;
  connectionStatus: 'connected' | 'disconnected' | 'error';
  lastConnectionAttempt?: Date;
  lastSuccessfulConnection?: Date;
  lastErrorMessage?: string;
}

class DeviceConnectionManager {
  private monitoringIntervals: Map<number, NodeJS.Timeout> = new Map();
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds

  /**
   * Save device configuration to database (encrypted password)
   */
  async saveDeviceConfig(
    schoolId: number,
    deviceName: string,
    ip: string,
    port: number,
    username: string,
    password: string
  ): Promise<{ id: number; success: boolean; error?: string }> {
    let connection;
    try {
      connection = await getConnection();

      const encryptedPassword = encryptionUtil.encrypt(password);

      // Check if device config already exists for this school
      const [existing] = await connection.execute(
        'SELECT id FROM device_configs WHERE school_id = ? AND is_active = 1',
        [schoolId]
      );

      if ((existing as any).length > 0) {
        // Update existing config
        const deviceId = (existing as any)[0].id;
        await connection.execute(
          `UPDATE device_configs SET 
            device_name = ?, 
            device_ip = ?, 
            device_port = ?, 
            device_username = ?, 
            device_password_encrypted = ?,
            updated_at = NOW()
          WHERE id = ?`,
          [deviceName, ip, port, username, encryptedPassword, deviceId]
        );

        console.log(`[Device Manager] Updated device config (ID: ${deviceId})`);
        return { id: deviceId, success: true };
      } else {
        // Insert new config
        const [result] = await connection.execute(
          `INSERT INTO device_configs 
          (school_id, device_name, device_ip, device_port, device_username, device_password_encrypted, connection_status)
          VALUES (?, ?, ?, ?, ?, ?, 'disconnected')`,
          [schoolId, deviceName, ip, port, username, encryptedPassword]
        );

        const insertResult = result as any;
        console.log(`[Device Manager] Created new device config (ID: ${insertResult.insertId})`);
        return { id: insertResult.insertId, success: true };
      }
    } catch (error: any) {
      console.error(`[Device Manager] Error saving device config: ${error.message}`);
      return { id: 0, success: false, error: error.message };
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Load device configuration from database (password decrypted)
   */
  async loadDeviceConfig(schoolId: number): Promise<StoredDeviceConfig | null> {
    let connection;
    try {
      connection = await getConnection();

      const [rows] = await connection.execute(
        `SELECT * FROM device_configs WHERE school_id = ? AND is_active = 1 LIMIT 1`,
        [schoolId]
      );

      if ((rows as any).length === 0) {
        return null;
      }

      const config = (rows as any)[0];
      const decryptedPassword = encryptionUtil.decrypt(config.device_password_encrypted);

      return {
        id: config.id,
        schoolId: config.school_id,
        deviceName: config.device_name,
        deviceIp: config.device_ip,
        devicePort: config.device_port,
        deviceUsername: config.device_username,
        deviceSerialNumber: config.device_serial_number,
        deviceType: config.device_type,
        connectionStatus: config.connection_status,
        lastConnectionAttempt: config.last_connection_attempt,
        lastSuccessfulConnection: config.last_successful_connection,
        lastErrorMessage: config.last_error_message
      };
    } catch (error: any) {
      console.error(`[Device Manager] Error loading device config: ${error.message}`);
      return null;
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Test connection and update device status
   */
  async testAndUpdateDeviceConnection(schoolId: number): Promise<DeviceConnectionResponse> {
    try {
      // Load device config
      const storedConfig = await this.loadDeviceConfig(schoolId);
      if (!storedConfig) {
        return {
          success: false,
          message: 'Device not configured',
          error: 'No device configuration found for this school',
          responseTimeMs: 0
        };
      }

      // Prepare Dahua config
      const dahuaConfig: DahuaDeviceConfig = {
        ip: storedConfig.deviceIp,
        port: storedConfig.devicePort,
        username: storedConfig.deviceUsername,
        password: encryptionUtil.decrypt(
          (
            await getConnection().then(async (conn) => {
              const [rows] = await conn.execute(
                'SELECT device_password_encrypted FROM device_configs WHERE id = ?',
                [storedConfig.id]
              );
              await conn.end();
              return (rows as any)[0]?.device_password_encrypted;
            })
          ) || ''
        )
      };

      // Test connection
      const response = await dahuaService.testConnection(dahuaConfig);

      // Update connection history
      await this.recordConnectionAttempt(storedConfig.id, 'test', response);

      // Update device config status
      await this.updateDeviceStatus(
        storedConfig.id,
        response.success ? 'connected' : 'error',
        response.data?.serialNumber,
        response.data?.deviceType,
        response.success ? response.message : response.error
      );

      return response;
    } catch (error: any) {
      console.error(`[Device Manager] Error testing connection: ${error.message}`);
      return {
        success: false,
        message: 'Connection test failed',
        error: error.message,
        responseTimeMs: 0
      };
    }
  }

  /**
   * Record connection attempt in history
   */
  private async recordConnectionAttempt(
    deviceConfigId: number,
    attemptType: 'test' | 'scheduled_check' | 'manual_reconnect' | 'system_startup',
    response: DeviceConnectionResponse
  ): Promise<void> {
    let connection;
    try {
      connection = await getConnection();

      const statusMap: Record<string, string> = {
        'success': 'success',
        'Device Not Reachable': response.error?.includes('timeout') ? 'timeout' : 'unreachable',
        'Authentication Failed': 'unauthorized',
        'API Not Available': 'api_error'
      };

      const status = statusMap[response.message] || (response.success ? 'success' : 'failed');

      await connection.execute(
        `INSERT INTO device_connection_history 
        (device_config_id, connection_attempt_type, status, http_status_code, error_message, response_time_ms)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          deviceConfigId,
          attemptType,
          status,
          response.statusCode || null,
          response.error || response.message,
          response.responseTimeMs
        ]
      );
    } catch (error) {
      console.error(`[Device Manager] Error recording connection attempt: ${error}`);
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Update device status and metadata
   */
  private async updateDeviceStatus(
    deviceConfigId: number,
    status: 'connected' | 'disconnected' | 'error',
    serialNumber?: string,
    deviceType?: string,
    errorMessage?: string
  ): Promise<void> {
    let connection;
    try {
      connection = await getConnection();

      const updateFields = [
        'connection_status = ?',
        'last_connection_attempt = NOW()',
        ...(status === 'connected' ? ['last_successful_connection = NOW()'] : []),
        ...(serialNumber ? ['device_serial_number = ?'] : []),
        ...(deviceType ? ['device_type = ?'] : []),
        ...(errorMessage && status === 'error' ? ['last_error_message = ?'] : [])
      ];

      const updateValues = [
        status,
        ...(serialNumber ? [serialNumber] : []),
        ...(deviceType ? [deviceType] : []),
        ...(errorMessage && status === 'error' ? [errorMessage] : []),
        deviceConfigId
      ];

      await connection.execute(`UPDATE device_configs SET ${updateFields.join(', ')} WHERE id = ?`, updateValues);

      console.log(`[Device Manager] Updated device status: ${status}`);
    } catch (error) {
      console.error(`[Device Manager] Error updating device status: ${error}`);
    } finally {
      if (connection) await connection.end();
    }
  }

  /**
   * Start monitoring heartbeat for a device (every 30 seconds)
   */
  startHeartbeatMonitoring(deviceConfigId: number, schoolId: number): void {
    // Clear existing interval if any
    if (this.monitoringIntervals.has(deviceConfigId)) {
      clearInterval(this.monitoringIntervals.get(deviceConfigId)!);
    }

    // Initial check after 10 seconds
    setTimeout(() => {
      this.testAndUpdateDeviceConnection(schoolId).catch((err) => {
        console.error(`[Device Manager] Heartbeat check failed: ${err.message}`);
      });
    }, 10000);

    // Then repeat every 30 seconds
    const interval = setInterval(() => {
      this.testAndUpdateDeviceConnection(schoolId).catch((err) => {
        console.error(`[Device Manager] Heartbeat check failed: ${err.message}`);
      });
    }, this.HEARTBEAT_INTERVAL);

    this.monitoringIntervals.set(deviceConfigId, interval);
    console.log(`[Device Manager] Started heartbeat monitoring (interval: ${this.HEARTBEAT_INTERVAL}ms)`);
  }

  /**
   * Stop monitoring heartbeat for a device
   */
  stopHeartbeatMonitoring(deviceConfigId: number): void {
    if (this.monitoringIntervals.has(deviceConfigId)) {
      clearInterval(this.monitoringIntervals.get(deviceConfigId)!);
      this.monitoringIntervals.delete(deviceConfigId);
      console.log(`[Device Manager] Stopped heartbeat monitoring`);
    }
  }

  /**
   * Get all active monitoring intervals count
   */
  getMonitoringStats(): { activeDevices: number; intervals: number } {
    return {
      activeDevices: this.monitoringIntervals.size,
      intervals: this.monitoringIntervals.size
    };
  }
}

export const deviceConnectionManager = new DeviceConnectionManager();
export default DeviceConnectionManager;
