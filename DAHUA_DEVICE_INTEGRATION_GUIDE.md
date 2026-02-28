# Dahua Device Integration - Complete Implementation Guide

## Overview

A production-grade Dahua fingerprint access control device integration system has been implemented for the DRAIS platform. The system handles:

- **Real device connectivity** - Actual HTTP requests to Dahua CGI endpoints (not simulated)
- **Encrypted credential storage** - AES-256-GCM encryption for device passwords
- **Automated health monitoring** - 30-second heartbeat checks with automatic offline detection
- **Real-time access logging** - Fetches and stores actual device events
- **Connection history tracking** - Complete audit trail of all connection attempts
- **Modern modal UI** - Two-tab interface for configuration and log viewing

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│         Frontend Component                   │
│   DeviceConnectionModal.tsx                  │
│  ┌────────────────────────────────────────┐  │
│  │ Tab 1: Device Connection               │  │
│  │ - Configure IP, Port, Username/Pwd     │  │
│  │ - Test Connection (real HTTP)          │  │
│  │ - Save & Auto-Monitor                  │  │
│  ├────────────────────────────────────────┤  │
│  │ Tab 2: Device Logs                     │  │
│  │ - Real access events from device       │  │
│  │ - Auto-refresh toggle (15-60 sec)      │  │
│  │ - Manual refresh button                │  │
│  └────────────────────────────────────────┘  │
└─────────────────────────────────────────────┘
           fetch/POST/PUT/GET
           ↓
┌─────────────────────────────────────────────┐
│         API Routes (Next.js)                 │
│  /api/device-config       [GET/POST/PUT]    │
│  /api/device-logs         [GET/POST]        │
│  /api/device-connection-history [GET]       │
└─────────────────────────────────────────────┘
           execute()
           ↓
┌─────────────────────────────────────────────┐
│    DeviceConnectionManager                   │
│  - Manages device config lifecycle          │
│  - Coordinates with services                │
│  - Starts/stops heartbeat monitoring        │
│  - Records connection history               │
└─────────────────────────────────────────────┘
           │
           ├──→ DahuaDeviceService          │
           │   (testConnection, fetchLogs)   │
           │   Makes real HTTP requests      │
           │                                 │
           └──→ EncryptionUtil              │
               (encrypt/decrypt passwords)   │
           │
           ↓
┌─────────────────────────────────────────────┐
│      MySQL Database                          │
│  - device_configs                    [encrypted pwd]│
│  - device_access_logs               [real events]  │
│  - device_connection_history        [audit trail]  │
└─────────────────────────────────────────────┘
           ↓
┌─────────────────────────────────────────────┐
│    Dahua Device (HTTP CGI API)              │
│  /cgi-bin/magicBox.cgi?action=getSystemInfo│
│  /cgi-bin/recordFinder.cgi                  │
│  (Requires Basic Auth)                      │
└─────────────────────────────────────────────┘
```

## File Structure

### Service Layer
- **`src/lib/services/DahuaDeviceService.ts`** (470 lines)
  - Real HTTP requests to device CGI endpoints
  - Methods: `testConnection()`, `fetchAccessLogs()`
  - Error classification: 401 (auth), 404 (API disabled), timeout, unreachable
  - Response parsing: System info, access logs

- **`src/lib/services/EncryptionUtil.ts`** (140+ lines)
  - AES-256-GCM authenticated encryption
  - Methods: `encrypt()`, `decrypt()`, `generateKey()`
  - 32-byte key from `DEVICE_ENCRYPTION_KEY` environment variable

- **`src/lib/services/DeviceConnectionManager.ts`** (350+ lines)
  - Manages device config lifecycle
  - Methods: `saveDeviceConfig()`, `loadDeviceConfig()`, `testAndUpdateDeviceConnection()`
  - Heartbeat monitoring: `startHeartbeatMonitoring()`, `stopHeartbeatMonitoring()`
  - Connection history tracking

### API Routes
- **`src/app/api/device-config/route.ts`**
  - GET: Retrieve device configuration (password excluded)
  - POST: Save & test device configuration
  - PUT: Update device configuration
  - DELETE: Remove device config and stop monitoring

- **`src/app/api/device-logs/route.ts`**
  - GET: Fetch device access logs (100 logs default, paginated)
  - POST: Manually sync logs from device

- **`src/app/api/device-connection-history/route.ts`**
  - GET: Fetch connection attempt history with stats

### Frontend Components
- **`src/components/device/DeviceConnectionModal.tsx`** (500+ lines)
  - Two-tab modal interface
  - Tab 1: Configure and test device connection
  - Tab 2: View real-time access logs with auto-refresh
  - Real-time status indicators (Green/Red/Yellow)
  - Proper error and success messaging

### Database Schema
- **`database/dahua_device_integration.sql`**
  - `device_configs`: Encrypted device credentials and status
  - `device_access_logs`: Real events from device
  - `device_connection_history`: All connection attempts with response times

## Setup Instructions

### 1. Environment Configuration

Add to `.env.local`:

```bash
# Generate a 32-byte hex key (64 characters)
DEVICE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# To generate a random key, run:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Database Verification

```bash
# Verify all device tables were created
mysql -u root ibunbaz_drais -e "SHOW TABLES LIKE 'device_%';"

# Should output:
# device_access_logs
# device_configs
# device_connection_history
# device_sync_checkpoints
# device_sync_logs
# device_users
```

### 3. Integration into UI

Add the modal to your admin or settings page:

```tsx
import DeviceConnectionModal from '@/components/device/DeviceConnectionModal';
import { useState } from 'react';

export default function AdminPage() {
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);

  return (
    <div>
      <button onClick={() => setDeviceModalOpen(true)}>
        Configure Biometric Device
      </button>

      <DeviceConnectionModal 
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        schoolId={1}  // Get from actual school context
      />
    </div>
  );
}
```

## API Endpoints Reference

### GET /api/device-config
Retrieve current device configuration for a school.

**Query Parameters:**
- `schoolId` (required): School ID

**Response:**
```json
{
  "success": true,
  "configured": true,
  "data": {
    "id": 1,
    "deviceName": "Main Gate Biometric",
    "deviceIp": "192.168.1.100",
    "devicePort": 80,
    "deviceUsername": "admin",
    "deviceSerialNumber": "ABC123XYZ",
    "deviceType": "DHI-ASI series",
    "connectionStatus": "connected",
    "lastConnectionAttempt": "2024-01-15T10:30:00Z",
    "lastSuccessfulConnection": "2024-01-15T10:30:00Z",
    "lastErrorMessage": null
  }
}
```

### POST /api/device-config
Save device configuration and test connection.

**Request Body:**
```json
{
  "schoolId": 1,
  "deviceName": "Main Gate Biometric",
  "deviceIp": "192.168.1.100",
  "devicePort": 80,
  "deviceUsername": "admin",
  "devicePassword": "password123"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Device configured and connected successfully",
  "data": {
    "deviceConfigId": 1,
    "connectionStatus": "connected",
    "responseTimeMs": 145,
    "monitoringStarted": true,
    "deviceInfo": {
      "deviceType": "DHI-ASI Access Control Device",
      "serialNumber": "ABC123XYZ",
      "firmwareVersion": "v2.1.0"
    }
  }
}
```

**Response (Failure):**
```json
{
  "success": false,
  "error": "Connection test failed: Authentication Failed",
  "details": {
    "statusCode": 401,
    "message": "Authentication Failed",
    "responseTimeMs": 50
  }
}
```

### GET /api/device-logs
Fetch device access logs.

**Query Parameters:**
- `schoolId` (required): School ID
- `limit` (optional): Max records (default: 100)
- `offset` (optional): Pagination offset (default: 0)
- `accessResult` (optional): Filter by 'granted' or 'denied'

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": 1,
        "timestamp": "2024-01-15T10:15:00Z",
        "userId": "STU001",
        "cardNumber": "12345678",
        "personName": "John Doe",
        "accessResult": "granted",
        "eventType": "9031",
        "deviceName": "Main Gate Biometric",
        "deviceSerial": "ABC123XYZ"
      }
    ],
    "pagination": {
      "total": 1000,
      "limit": 100,
      "offset": 0,
      "hasNextPage": true
    }
  }
}
```

### GET /api/device-connection-history
Fetch connection attempt history.

**Query Parameters:**
- `schoolId` (required): School ID
- `limit` (optional): Max records (default: 50)
- `offset` (optional): Pagination offset (default: 0)
- `status` (optional): Filter by status (success, failed, timeout, unauthorized, unreachable, api_error)

**Response:**
```json
{
  "success": true,
  "data": {
    "attempts": [
      {
        "id": 1,
        "attemptType": "test",
        "status": "success",
        "httpStatusCode": 200,
        "errorMessage": null,
        "responseTimeMs": 145,
        "ip": "192.168.1.100",
        "port": 80,
        "timestamp": "2024-01-15T10:30:00Z",
        "deviceName": "Main Gate Biometric",
        "deviceSerial": "ABC123XYZ"
      }
    ],
    "stats": {
      "totalAttempts": 50,
      "successfulAttempts": 48,
      "successRate": "96.00%"
    },
    "pagination": {
      "total": 50,
      "limit": 50,
      "offset": 0,
      "hasNextPage": false
    }
  }
}
```

## Connection Flow

### Device Configuration & Testing

1. **User Configuration:**
   - Opens DeviceConnectionModal
   - Enters device IP, Port, Username, Password
   - Clicks "Test Connection"

2. **Backend Testing:**
   - DeviceConnectionManager calls DahuaDeviceService.testConnection()
   - Service makes real HTTP GET to `/cgi-bin/magicBox.cgi?action=getSystemInfo`
   - Uses Basic Auth with provided credentials
   - 5-second timeout
   - Returns device info or error

3. **Storage:**
   - If test succeeds: Password encrypted (AES-256-GCM)
   - Configuration saved to device_configs table
   - Connection history entry recorded
   - 30-second heartbeat monitoring starts

### Heartbeat Monitoring (Every 30 seconds)

1. **Automatic Check:**
   - DeviceConnectionManager.startHeartbeatMonitoring()
   - Calls testConnection() every 30 seconds
   - Updates connection_status in device_configs

2. **Status Updates:**
   - Success: status = 'connected'
   - Failure (3x consecutive): status = 'error'
   - Recovery: status = 'connected' again

3. **History Tracking:**
   - Every check recorded in device_connection_history
   - HTTP status code, response time, error message stored
   - Success rate calculated from history

### Access Log Retrieval

1. **Manual Refresh:**
   - User clicks "Refresh Now" in Device Logs tab
   - Frontend POST to `/api/device-logs`
   - Backend calls DahuaDeviceService.fetchAccessLogs()

2. **Auto-Refresh:**
   - If auto-refresh toggle enabled
   - Frontend fetches logs every 15-60 seconds (configurable)
   - New logs appended to existing list

3. **Real Device Events:**
   - Fetches from /cgi-bin/recordFinder.cgi
   - Parses device response (JSON or CSV)
   - Stores in device_access_logs table
   - Displays in table with Granted/Denied badge

## Security Features

### 1. Credential Encryption
- **Algorithm:** AES-256-GCM (authenticated encryption)
- **Storage:** device_configs.device_password_encrypted
- **Never Exposed:** Frontend never receives device password
- **Rotation:** Passwords re-encrypted if DEVICE_ENCRYPTION_KEY changes

### 2. Authentication
- **Method:** HTTP Basic Auth (Base64 encoded)
- **Transport:** HTTPS recommended for production
- **Device Support:** Dahua DHI-ASI series devices

### 3. Error Handling
- **401 Unauthorized:** Wrong credential
- **404 Not Found:** API endpoint disabled on device
- **Timeout:** Device unreachable or hung
- **ECONNREFUSED:** Device offline
- **ENOTFOUND:** IP address doesn't resolve

### 4. Audit Trail
- **All attempts logged:** Success, failure, error type
- **Response times tracked:** Performance monitoring
- **Error messages stored:** Debugging assistance
- **User access logs:** Complete event history from device

## Production Deployment Checklist

- [ ] DEVICE_ENCRYPTION_KEY set in production environment
- [ ] MySQL backup configured for device_* tables
- [ ] HTTPS enabled for device communication
- [ ] Device credentials verified (test connection)
- [ ] Heartbeat monitoring verified (check device_connection_history)
- [ ] Backup device IP configured (if available)
- [ ] Admin user trained on device modal usage
- [ ] Access log retention policy implemented
- [ ] Monitoring alerts configured for connection failures
- [ ] Regular credential rotation schedule established

## Monitoring & Debugging

### Check Connection Status
```sql
SELECT id, device_name, connection_status, last_connection_attempt, last_error_message 
FROM device_configs;
```

### View Recent Connection Attempts
```sql
SELECT * FROM device_connection_history 
ORDER BY created_at DESC 
LIMIT 20;
```

### Analyze Success Rate
```sql
SELECT 
  COUNT(*) as total_attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
  ROUND(SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) * 100 / COUNT(*), 2) as success_rate,
  AVG(response_time_ms) as avg_response_ms
FROM device_connection_history;
```

### Recent Device Events
```sql
SELECT event_timestamp, person_name, access_result, device_event_type 
FROM device_access_logs 
ORDER BY event_timestamp DESC 
LIMIT 50;
```

## Troubleshooting

### Connection Test Fails with "Device Not Reachable"
- Verify device IP address is correct
- Check network connectivity to device
- Confirm device is powered on
- Check firewall rules allowing connection to device port

### "Authentication Failed" Error
- Verify username/password are correct
- Check device credentials haven't changed
- Ensure user has admin access on device
- Verify Basic Auth is enabled on device

### "API Not Available" Error (404)
- Device firmware may not support /cgi-bin/magicBox.cgi
- Check device firmware version
- Verify device supports HTTP CGI API

### Heartbeat Monitoring Not Starting
- Check DeviceConnectionManager.startHeartbeatMonitoring() was called
- Verify no errors in application logs
- Check connection test succeeded before monitoring starts

### No Access Logs Displaying
- Device may not have events
- Confirm /cgi-bin/recordFinder.cgi is available on device
- Check device event log isn't full
- Verify date/time on device is correct

## Future Enhancements

- [ ] Multiple device support (one school, multiple devices)
- [ ] Automatic offline alerts (email/SMS)
- [ ] Advanced log filtering (date range, user, access result)
- [ ] Device firmware update support
- [ ] Real-time event streaming (WebSocket)
- [ ] Access control rules (blacklist/whitelist)
- [ ] Integration with attendance system (mark attendance on card swipe)
- [ ] Device status dashboard widget
- [ ] Backup/restore device configuration
- [ ] Device synchronization between schools

## Support & Documentation

- **Device Manual:** Consult Dahua DHI-ASI device documentation
- **CGI API Docs:** Available from device web interface (admin login)
- **Error Codes:** Check device logs for specific event codes
- **Encryption:** See EncryptionUtil.ts for key management details

