# DRACE Attendance System - Device Integration & Adapter Guide

## Overview

The DRACE attendance system uses an **Adapter Pattern** to support multiple biometric device brands without tight coupling. This design allows seamless integration with new device types by implementing standard interfaces.

---

## 1. Device Adapter Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  DRACE Core System                           │
│  (Attendance Processing, Rules Engine, Database)             │
└──────────────────────────▲──────────────────────────────────┘
                           │
                ┌──────────┴──────────┐
                │                     │
         ┌──────▼──────┐       ┌──────▼──────┐
         │ Polling     │       │ Webhook     │
         │ Service     │       │ Receiver    │
         └──────┬──────┘       └──────┬──────┘
                │                     │
         ┌──────▼─────────────────────▼──────┐
         │   Device Adapter Interface        │
         │  (Abstract Base Class)            │
         └──────┬──────────────────────┬─────┘
                │                      │
      ┌─────────▼────────┐  ┌──────────▼──────────┐
      │  ZKTeco Adapter  │  │  U-Attendance      │
      │  (Fingerprint)   │  │  Adapter           │
      └──────┬───────────┘  └──────────┬─────────┘
             │                         │
      ┌──────▼────────┐  ┌──────────────▼──────┐
      │  HID Adapter  │  │  Multi-Modal        │
      │  (Face/Iris)  │  │  Adapter            │
      └───────────────┘  └─────────────────────┘

             All implementing:
         ┌─────────────────────────┐
         │ IDeviceAdapter          │
         │ - authenticate()        │
         │ - fetchLogs()           │
         │ - parseLog()            │
         │ - validateLog()         │
         │ - mapFields()           │
         │ - getStatus()           │
         │ - handleErrors()        │
         └─────────────────────────┘
```

---

## 2. Device Adapter Interface

### Abstract Base Class

```typescript
// device-adapter.abstract.ts

export interface BiometricLog {
  device_user_id: number;
  scan_timestamp: Date;
  verification_status: 'success' | 'failed' | 'unknown';
  biometric_quality?: number;
  device_log_id?: string;
  raw_payload?: any;
}

export interface DeviceConfig {
  api_url: string;
  api_key: string;
  device_id: string;
  device_brand: string;
  device_model: string;
  location: string;
  polling_interval: number;
}

export interface DeviceStatus {
  is_online: boolean;
  last_sync: Date;
  logs_pending: number;
  firmware_version: string;
  enrolled_users: number;
  battery_level?: number;
  memory_usage?: number;
  error_message?: string;
}

export interface FetchLogsOptions {
  since?: Date;
  limit?: number;
  offset?: number;
  user_id?: number;
}

export abstract class IDeviceAdapter {
  protected config: DeviceConfig;
  protected logger: Logger;
  
  constructor(config: DeviceConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Authenticate with the device
   * Should validate credentials and connection
   */
  abstract authenticate(): Promise<boolean>;

  /**
   * Fetch logs from device
   * Returns raw logs as provided by device
   */
  abstract fetchLogs(options: FetchLogsOptions): Promise<any[]>;

  /**
   * Parse device-specific log format to standard format
   */
  abstract parseLog(rawLog: any): BiometricLog;

  /**
   * Validate parsed log for correctness
   */
  abstract validateLog(log: BiometricLog): boolean;

  /**
   * Get current device status
   */
  abstract getStatus(): Promise<DeviceStatus>;

  /**
   * Handle device-specific errors
   */
  abstract handleError(error: any): Promise<void>;

  /**
   * Get device timestamp (for sync coordination)
   */
  abstract getDeviceTime(): Promise<Date>;

  /**
   * Optional: Enroll user on device
   */
  abstract enrollUser?(userId: number, template: any): Promise<boolean>;

  /**
   * Optional: Delete user from device
   */
  abstract deleteUser?(userId: number): Promise<boolean>;

  /**
   * Optional: Get user details from device
   */
  abstract getUserInfo?(userId: number): Promise<any>;
}
```

---

## 3. Concrete Adapter Implementations

### 3.1 ZKTeco Adapter

```typescript
// zkteco-adapter.ts
import { IDeviceAdapter, BiometricLog, DeviceConfig, DeviceStatus, FetchLogsOptions } from './device-adapter.abstract';

export class ZKTecoAdapter extends IDeviceAdapter {
  private client: ZKTecoClient;
  
  constructor(config: DeviceConfig, logger: Logger) {
    super(config, logger);
    this.client = new ZKTecoClient(config.api_url, config.api_key);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await this.client.connect();
      this.logger.info(`ZKTeco device connected: ${this.config.device_id}`);
      return response.success;
    } catch (error) {
      this.logger.error(`Failed to authenticate ZKTeco device: ${error.message}`);
      throw error;
    }
  }

  async fetchLogs(options: FetchLogsOptions): Promise<any[]> {
    try {
      const response = await this.client.getAttendanceLogs({
        start_time: options.since?.getTime() || 0,
        maxRecords: options.limit || 1000,
        offset: options.offset || 0
      });

      if (!response.success) {
        throw new Error(`Failed to fetch logs: ${response.error}`);
      }

      this.logger.info(
        `Fetched ${response.data.length} logs from ZKTeco device ${this.config.device_id}`
      );

      return response.data;
    } catch (error) {
      this.logger.error(`Error fetching from ZKTeco: ${error.message}`);
      throw error;
    }
  }

  parseLog(rawLog: any): BiometricLog {
    // ZKTeco log format:
    // {
    //   "UserID": 1001,
    //   "RecordTime": "2026-02-20 08:15:30",
    //   "VerifyFP": 1,
    //   "VerifyType": 0,
    //   "RecordID": 12345
    // }

    const timestamp = new Date(rawLog.RecordTime);
    
    return {
      device_user_id: rawLog.UserID,
      scan_timestamp: timestamp,
      verification_status: this.mapVerificationStatus(rawLog.VerifyFP),
      biometric_quality: rawLog.Quality || undefined,
      device_log_id: `zkteco_${this.config.device_id}_${rawLog.RecordID}_${rawLog.RecordTime}`,
      raw_payload: rawLog
    };
  }

  private mapVerificationStatus(verifyFP: number): 'success' | 'failed' | 'unknown' {
    // ZKTeco verification codes
    switch (verifyFP) {
      case 0: return 'unknown';    // Unknown
      case 1: return 'success';    // Fingerprint verified
      case 2: return 'success';    // Card verified
      case 3: return 'success';    // Password verified
      case 4: return 'failed';     // Verification failed
      case 5: return 'success';    // Face/Iris verified
      default: return 'unknown';
    }
  }

  validateLog(log: BiometricLog): boolean {
    // Validate required fields
    if (!log.device_user_id || !log.scan_timestamp) {
      this.logger.warn(`Invalid log: missing required fields`);
      return false;
    }

    // Validate timestamp is reasonable (not in future)
    if (log.scan_timestamp > new Date()) {
      this.logger.warn(`Invalid log: timestamp in future`);
      return false;
    }

    // Validate user ID is reasonable (1-9999 for ZKTeco)
    if (log.device_user_id < 1 || log.device_user_id > 99999) {
      this.logger.warn(`Invalid user ID: ${log.device_user_id}`);
      return false;
    }

    return true;
  }

  async getStatus(): Promise<DeviceStatus> {
    try {
      const response = await this.client.getDeviceInfo();

      return {
        is_online: response.success,
        last_sync: new Date(),
        logs_pending: response.pendingLogs || 0,
        firmware_version: response.firmwareVersion || 'unknown',
        enrolled_users: response.enrolledUsers || 0,
        battery_level: response.batteryLevel,
        memory_usage: response.memoryUsage,
        error_message: response.success ? undefined : response.error
      };
    } catch (error) {
      return {
        is_online: false,
        last_sync: new Date(),
        logs_pending: 0,
        firmware_version: 'unknown',
        enrolled_users: 0,
        error_message: error.message
      };
    }
  }

  async getDeviceTime(): Promise<Date> {
    const response = await this.client.getTime();
    return new Date(response.timestamp);
  }

  async handleError(error: any): Promise<void> {
    switch (error.code) {
      case 'CONNECTION_TIMEOUT':
        this.logger.error(`Connection timeout to ZKTeco device`);
        break;
      case 'AUTHENTICATION_FAILED':
        this.logger.error(`Authentication failed for ZKTeco device`);
        break;
      case 'INVALID_RESPONSE':
        this.logger.error(`Invalid response from ZKTeco device`);
        break;
      default:
        this.logger.error(`ZKTeco error: ${error.message}`);
    }
  }

  async enrollUser(userId: number, template: any): Promise<boolean> {
    try {
      const response = await this.client.enrollFinger({
        UserID: userId,
        Template: template
      });
      return response.success;
    } catch (error) {
      this.logger.error(`Failed to enroll user ${userId}: ${error.message}`);
      return false;
    }
  }

  async deleteUser(userId: number): Promise<boolean> {
    try {
      const response = await this.client.deleteUser({ UserID: userId });
      return response.success;
    } catch (error) {
      this.logger.error(`Failed to delete user ${userId}: ${error.message}`);
      return false;
    }
  }
}
```

### 3.2 U-Attendance Adapter

```typescript
// u-attendance-adapter.ts

export class UAttendanceAdapter extends IDeviceAdapter {
  private client: UAttendanceClient;

  constructor(config: DeviceConfig, logger: Logger) {
    super(config, logger);
    this.client = new UAttendanceClient(
      config.api_url,
      config.api_key
    );
  }

  async authenticate(): Promise<boolean> {
    try {
      const token = await this.client.login();
      this.logger.info(`U-Attendance device authenticated`);
      return !!token;
    } catch (error) {
      this.logger.error(`U-Attendance authentication failed: ${error.message}`);
      throw error;
    }
  }

  async fetchLogs(options: FetchLogsOptions): Promise<any[]> {
    try {
      const response = await this.client.getAttendances({
        beginTime: options.since?.toISOString(),
        pageIndex: options.offset || 0,
        pageSize: options.limit || 1000
      });

      return response.data || [];
    } catch (error) {
      this.logger.error(`Error fetching from U-Attendance: ${error.message}`);
      throw error;
    }
  }

  parseLog(rawLog: any): BiometricLog {
    // U-Attendance log format differs
    // {
    //   "PersonID": 1001,
    //   "CheckTime": "2026-02-20T08:15:30Z",
    //   "VerifyCode": 0,
    //   "Score": 95
    // }

    return {
      device_user_id: rawLog.PersonID,
      scan_timestamp: new Date(rawLog.CheckTime),
      verification_status: rawLog.VerifyCode === 0 ? 'success' : 'failed',
      biometric_quality: rawLog.Score,
      device_log_id: `uattend_${rawLog.PersonID}_${rawLog.CheckTime}`,
      raw_payload: rawLog
    };
  }

  validateLog(log: BiometricLog): boolean {
    return !!log.device_user_id && !!log.scan_timestamp;
  }

  async getStatus(): Promise<DeviceStatus> {
    try {
      const info = await this.client.getDeviceInfo();
      return {
        is_online: true,
        last_sync: new Date(),
        logs_pending: info.pendingRecords || 0,
        firmware_version: info.firmware || 'unknown',
        enrolled_users: info.totalEmployees || 0,
        battery_level: info.batteryLevel
      };
    } catch (error) {
      return {
        is_online: false,
        last_sync: new Date(),
        logs_pending: 0,
        firmware_version: 'unknown',
        enrolled_users: 0,
        error_message: error.message
      };
    }
  }

  async getDeviceTime(): Promise<Date> {
    const info = await this.client.getDeviceInfo();
    return new Date(info.currentTime);
  }

  async handleError(error: any): Promise<void> {
    this.logger.error(`U-Attendance error: ${error.message}`);
  }
}
```

### 3.3 HID Global (Face/Iris) Adapter

```typescript
// hid-global-adapter.ts

export class HIDGlobalAdapter extends IDeviceAdapter {
  private client: HIDClient;
  private biometricType: 'face' | 'iris';

  constructor(config: DeviceConfig, logger: Logger) {
    super(config, logger);
    this.biometricType = config.device_model.includes('face') ? 'face' : 'iris';
    this.client = new HIDClient(config.api_url, config.api_key);
  }

  async authenticate(): Promise<boolean> {
    try {
      const response = await this.client.authenticate();
      return response.authenticated === true;
    } catch (error) {
      throw error;
    }
  }

  async fetchLogs(options: FetchLogsOptions): Promise<any[]> {
    try {
      const response = await this.client.queryEvents({
        startTime: options.since?.toISOString(),
        eventType: 'verification',
        limit: options.limit || 1000
      });

      return response.events || [];
    } catch (error) {
      throw error;
    }
  }

  parseLog(rawLog: any): BiometricLog {
    // HID log format:
    // {
    //   "PersonId": "EMP-1001",
    //   "Timestamp": "2026-02-20T08:15:30Z",
    //   "VerificationResult": "SUCCESS",
    //   "QualityScore": 98,
    //   "BiometricType": "FACE"
    // }

    return {
      device_user_id: this.extractNumericId(rawLog.PersonId),
      scan_timestamp: new Date(rawLog.Timestamp),
      verification_status: this.mapHIDVerificationStatus(rawLog.VerificationResult),
      biometric_quality: rawLog.QualityScore,
      device_log_id: `hid_${rawLog.PersonId}_${rawLog.Timestamp}`,
      raw_payload: rawLog
    };
  }

  private extractNumericId(personId: string): number {
    // Extract numeric ID from "EMP-1001" format
    const match = personId.match(/\d+/);
    return match ? parseInt(match[0]) : 0;
  }

  private mapHIDVerificationStatus(result: string): 'success' | 'failed' | 'unknown' {
    switch (result?.toUpperCase()) {
      case 'SUCCESS':
        return 'success';
      case 'FAILED':
      case 'REJECTED':
        return 'failed';
      default:
        return 'unknown';
    }
  }

  validateLog(log: BiometricLog): boolean {
    return log.device_user_id > 0 && !!log.scan_timestamp;
  }

  async getStatus(): Promise<DeviceStatus> {
    try {
      const status = await this.client.getStatus();
      return {
        is_online: status.connected,
        last_sync: new Date(status.lastSync),
        logs_pending: status.queuedEvents || 0,
        firmware_version: status.firmwareVersion,
        enrolled_users: status.totalEnrolled,
        battery_level: status.batteryPercent
      };
    } catch (error) {
      return {
        is_online: false,
        last_sync: new Date(),
        logs_pending: 0,
        firmware_version: 'unknown',
        enrolled_users: 0,
        error_message: error.message
      };
    }
  }

  async getDeviceTime(): Promise<Date> {
    const status = await this.client.getStatus();
    return new Date(status.deviceTime);
  }

  async handleError(error: any): Promise<void> {
    this.logger.error(`HID Global error: ${error.message}`);
  }
}
```

---

## 4. Adapter Factory & Registry

```typescript
// device-adapter-factory.ts

export type SupportedBrands = 'zkteco' | 'u-attendance' | 'hid' | 'generic';

export class DeviceAdapterFactory {
  private static adapters: Map<SupportedBrands, new (...args: any[]) => IDeviceAdapter> = new Map([
    ['zkteco', ZKTecoAdapter],
    ['u-attendance', UAttendanceAdapter],
    ['hid', HIDGlobalAdapter],
    ['generic', GenericBiometricAdapter]
  ]);

  static registerAdapter(brand: string, adapter: any): void {
    this.adapters.set(brand.toLowerCase() as SupportedBrands, adapter);
  }

  static createAdapter(
    config: DeviceConfig,
    logger: Logger
  ): IDeviceAdapter {
    const brand = config.device_brand.toLowerCase() as SupportedBrands;
    const AdapterClass = this.adapters.get(brand);

    if (!AdapterClass) {
      throw new Error(
        `Unsupported device brand: ${config.device_brand}. ` +
        `Supported brands: ${Array.from(this.adapters.keys()).join(', ')}`
      );
    }

    return new AdapterClass(config, logger);
  }

  static getSupportedBrands(): string[] {
    return Array.from(this.adapters.keys()).map(b => b.toString());
  }

  static hasBrandSupport(brand: string): boolean {
    return this.adapters.has(brand.toLowerCase() as SupportedBrands);
  }
}

// Usage
const config: DeviceConfig = {
  api_url: 'http://192.168.1.100:8000',
  api_key: 'encrypted_key',
  device_id: 'device_001',
  device_brand: 'ZKTeco',
  device_model: 'ZKT-F5',
  location: 'Main Entrance',
  polling_interval: 5
};

const adapter = DeviceAdapterFactory.createAdapter(config, logger);
await adapter.authenticate();
const logs = await adapter.fetchLogs({ limit: 1000 });
```

---

## 5. Polling Service

```typescript
// device-polling-service.ts

export class DevicePollingService {
  private devices: Map<string, DeviceConfig> = new Map();
  private adapters: Map<string, IDeviceAdapter> = new Map();
  private intervals: Map<string, NodeJS.Timer> = new Map();

  async registerDevice(config: DeviceConfig): Promise<void> {
    const key = `${config.device_id}`;
    
    // Create adapter
    const adapter = DeviceAdapterFactory.createAdapter(config, this.logger);
    
    // Authenticate
    const authenticated = await adapter.authenticate();
    if (!authenticated) {
      throw new Error(`Failed to authenticate device: ${config.device_id}`);
    }

    this.devices.set(key, config);
    this.adapters.set(key, adapter);

    // Start polling
    this.startPolling(key, config);

    this.logger.info(`Device registered and polling started: ${config.device_id}`);
  }

  private startPolling(key: string, config: DeviceConfig): void {
    // Initial sync
    this.syncDeviceLogs(key).catch(err => 
      this.logger.error(`Initial sync failed for ${key}: ${err.message}`)
    );

    // Schedule periodic polling
    const interval = setInterval(
      () => this.syncDeviceLogs(key).catch(err => 
        this.logger.error(`Polling error for ${key}: ${err.message}`)
      ),
      config.polling_interval * 60 * 1000 // Convert minutes to milliseconds
    );

    this.intervals.set(key, interval);
  }

  private async syncDeviceLogs(deviceKey: string): Promise<void> {
    const config = this.devices.get(deviceKey);
    const adapter = this.adapters.get(deviceKey);

    if (!adapter || !config) {
      return;
    }

    try {
      // Get last sync time from checkpoint
      const checkpoint = await this.getDeviceCheckpoint(config.device_id);
      
      // Fetch logs since last sync
      const rawLogs = await adapter.fetchLogs({
        since: checkpoint?.last_synced_device_time || new Date(Date.now() - 24 * 60 * 60 * 1000),
        limit: 5000
      });

      if (rawLogs.length === 0) {
        this.logger.debug(`No new logs from device ${config.device_id}`);
        return;
      }

      // Parse and validate logs
      const validLogs = rawLogs
        .map(log => adapter.parseLog(log))
        .filter(log => adapter.validateLog(log));

      this.logger.info(
        `Synced ${validLogs.length}/${rawLogs.length} logs from ${config.device_id}`
      );

      // Queue for processing
      for (const log of validLogs) {
        await this.queueLogForProcessing(config.school_id, config.device_id, log);
      }

      // Update checkpoint
      await this.updateDeviceCheckpoint(config.device_id, new Date());

      // Update device status
      const status = await adapter.getStatus();
      await this.updateDeviceStatus(config.device_id, status);

    } catch (error) {
      this.logger.error(`Sync error for device ${config.device_id}:`, error);
      
      // Handle specific errors
      if (adapter) {
        await adapter.handleError(error);
      }

      // Update device status as offline
      await this.updateDeviceStatus(deviceKey, {
        is_online: false,
        last_sync: new Date(),
        logs_pending: 0,
        firmware_version: 'unknown',
        enrolled_users: 0,
        error_message: error.message
      });
    }
  }

  async stopPolling(deviceId: string): Promise<void> {
    const key = deviceId;
    const interval = this.intervals.get(key);
    
    if (interval) {
      clearInterval(interval);
      this.intervals.delete(key);
    }

    this.devices.delete(key);
    this.adapters.delete(key);
    
    this.logger.info(`Polling stopped for device: ${deviceId}`);
  }

  async triggerManualSync(deviceId: string): Promise<number> {
    const key = deviceId;
    const config = this.devices.get(key);

    if (!config) {
      throw new Error(`Device not found: ${deviceId}`);
    }

    await this.syncDeviceLogs(key);
    const checkpoint = await this.getDeviceCheckpoint(deviceId);
    
    return checkpoint?.total_logs_synced || 0;
  }

  private async queueLogForProcessing(
    schoolId: string,
    deviceId: string,
    log: BiometricLog
  ): Promise<void> {
    await this.queue.push({
      type: 'ingest_log',
      schoolId,
      deviceId,
      log,
      retries: 0,
      maxRetries: 3
    });
  }

  private async getDeviceCheckpoint(deviceId: string): Promise<any> {
    return await this.db.query('device_sync_checkpoints')
      .where('device_id', deviceId)
      .first();
  }

  private async updateDeviceCheckpoint(
    deviceId: string,
    lastSyncTime: Date
  ): Promise<void> {
    await this.db.query('device_sync_checkpoints')
      .where('device_id', deviceId)
      .update({
        last_synced_remote_time: lastSyncTime,
        total_logs_synced: this.db.raw('total_logs_synced + 1')
      });
  }

  private async updateDeviceStatus(
    deviceId: string,
    status: DeviceStatus
  ): Promise<void> {
    await this.db.query('biometric_devices')
      .where('device_id', deviceId)
      .update({
        is_active: status.is_online,
        last_heartbeat: new Date(),
        sync_status: status.is_online ? 'online' : 'offline'
      });
  }
}
```

---

## 6. Webhook Receiver

```typescript
// device-webhook-controller.ts

export class DeviceWebhookController {
  
  @Post('/schools/:schoolId/device-logs/webhook')
  async receiveDeviceLog(
    req: Request,
    res: Response
  ): Promise<void> {
    const { schoolId } = req.params;
    const payload = req.body;

    try {
      // Verify webhook signature (if configured)
      if (!this.verifyWebhookSignature(payload, req.headers['x-signature'])) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Get device config
      const deviceConfig = await this.getDeviceConfig(
        schoolId,
        payload.device_id
      );

      if (!deviceConfig) {
        return res.status(404).json({ error: 'Device not found' });
      }

      // Create adapter
      const adapter = DeviceAdapterFactory.createAdapter(deviceConfig, this.logger);

      // Parse log
      const parsedLog = adapter.parseLog(payload);

      // Validate
      if (!adapter.validateLog(parsedLog)) {
        return res.status(400).json({ error: 'Invalid log data' });
      }

      // Queue for processing
      await this.queue.enqueue({
        type: 'ingest_log',
        schoolId,
        deviceId: deviceConfig.id,
        log: parsedLog,
        priority: 10 // Higher priority for webhooks
      });

      // Respond immediately (webhook shouldn't block)
      res.status(202).json({
        received: true,
        log_id: parsedLog.device_log_id,
        status: 'queued'
      });

    } catch (error) {
      this.logger.error(`Webhook processing error: ${error.message}`);
      res.status(500).json({ error: 'Processing failed' });
    }
  }

  private verifyWebhookSignature(
    payload: any,
    signature: string
  ): boolean {
    // HMAC-SHA256 verification
    const computed = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    return computed === signature;
  }
}
```

---

## 7. Adding a New Device Adapter

### Step-by-Step Guide

```typescript
// Step 1: Extend IDeviceAdapter
export class MyDeviceAdapter extends IDeviceAdapter {
  private client: MyDeviceClient;

  constructor(config: DeviceConfig, logger: Logger) {
    super(config, logger);
    this.client = new MyDeviceClient(config.api_url, config.api_key);
  }

  // Step 2: Implement required methods
  async authenticate(): Promise<boolean> {
    // Your authentication logic
  }

  async fetchLogs(options: FetchLogsOptions): Promise<any[]> {
    // Your log fetching logic
  }

  parseLog(rawLog: any): BiometricLog {
    // Parse device-specific format to BiometricLog
  }

  validateLog(log: BiometricLog): boolean {
    // Validate parsed log
  }

  async getStatus(): Promise<DeviceStatus> {
    // Return device status
  }

  async getDeviceTime(): Promise<Date> {
    // Get device timestamp
  }

  async handleError(error: any): Promise<void> {
    // Handle device-specific errors
  }
}

// Step 3: Register adapter
DeviceAdapterFactory.registerAdapter('mydevice', MyDeviceAdapter);

// Step 4: Configure device in UI/database
const config: DeviceConfig = {
  api_url: 'http://device.local:8000',
  api_key: 'api_key',
  device_id: 'device_001',
  device_brand: 'MyDevice',  // Must match registration
  device_model: 'Model-X',
  location: 'Main Gate',
  polling_interval: 5
};

// Step 5: Test
const adapter = DeviceAdapterFactory.createAdapter(config, logger);
await adapter.authenticate();
const logs = await adapter.fetchLogs({ limit: 10 });
logs.forEach(log => {
  const parsed = adapter.parseLog(log);
  if (adapter.validateLog(parsed)) {
    console.log('Valid log:', parsed);
  }
});
```

---

## 8. Configuration Files

### Device Mappings Config

```yaml
# devices-config.yaml

supported_devices:
  zkteco:
    brand: "ZKTeco"
    models:
      - "ZKT-F5"
      - "ZKT-F20"
      - "ZKT-EFace"
    biometric_types: ["fingerprint", "face"]
    api_timeout: 30000
    polling_interval_default: 5

  u_attendance:
    brand: "U-Attendance"
    models:
      - "UA-100"
      - "UA-200"
    biometric_types: ["fingerprint"]
    api_timeout: 20000
    polling_interval_default: 5

  hid_global:
    brand: "HID Global"
    models:
      - "EFace"
      - "EyeSwipe"
    biometric_types: ["face", "iris"]
    api_timeout: 15000
    polling_interval_default: 3

  generic:
    brand: "Generic HTTP"
    models:
      - "Custom"
    biometric_types: ["fingerprint", "face", "card"]
    api_timeout: 30000
    polling_interval_default: 10
```

---

This adapter architecture ensures:
✅ Easy integration with new device brands
✅ No tight coupling to specific devices
✅ Consistent interface for all devices
✅ Flexible parsing of different formats
✅ Scalable to support 100+ devices per school
✅ Production-ready error handling
