# Dahua Device Integration - Quick Reference & Examples

## Quick Start - 5 Minute Setup

### 1. Add Environment Variable
```bash
# In .env.local
DEVICE_ENCRYPTION_KEY=0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef

# Or generate a random key:
# node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Add Modal to Admin Page
```tsx
import DeviceConnectionModal from '@/components/device/DeviceConnectionModal';
import { useState } from 'react';

export default function AdminPage() {
  const [deviceModalOpen, setDeviceModalOpen] = useState(false);
  const schoolId = 1; // Get from auth context

  return (
    <div className="p-6">
      <button 
        onClick={() => setDeviceModalOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        ⚙️ Configure Biometric Device
      </button>

      <DeviceConnectionModal 
        isOpen={deviceModalOpen}
        onClose={() => setDeviceModalOpen(false)}
        schoolId={schoolId}
      />
    </div>
  );
}
```

### 3. Restart Development Server
```bash
npm run dev
# Server runs on http://localhost:3001 (port 3000 may be in use)
```

## Core Components

### DahuaDeviceService

**Testing Device Connection:**
```typescript
import { dahuaService } from '@/lib/services/DahuaDeviceService';

const response = await dahuaService.testConnection({
  ip: '192.168.1.100',
  port: 80,
  username: 'admin',
  password: 'password123'
});

if (response.success) {
  console.log('Device info:', response.data);
  // { deviceType: 'DHI-ASI..', serialNumber: '...', firmwareVersion: '...' }
} else {
  console.error('Connection failed:', response.error);
  // 'Authentication Failed' | 'Device Not Reachable' | 'API Not Available'
}
```

**Fetching Access Logs:**
```typescript
const logs = await dahuaService.fetchAccessLogs({
  ip: '192.168.1.100',
  port: 80,
  username: 'admin',
  password: 'password123'
}, new Date(Date.now() - 24*3600*1000)); // Last 24 hours

logs.forEach(log => {
  console.log(`${log.timestamp}: ${log.personName} - ${log.accessResult}`);
});
```

### EncryptionUtil

**Encrypt a Password:**
```typescript
import { encryptionUtil } from '@/lib/services/EncryptionUtil';

const password = 'device_password_123';
const encrypted = encryptionUtil.encrypt(password);
// Returns: IV(32 chars) + AuthTag(32 chars) + Ciphertext(variable)

// Store in database
await connection.execute(
  'UPDATE device_configs SET device_password_encrypted = ? WHERE id = ?',
  [encrypted, deviceId]
);
```

**Decrypt a Password:**
```typescript
// Retrieve from database
const [rows] = await connection.execute(
  'SELECT device_password_encrypted FROM device_configs WHERE id = ?',
  [deviceId]
);

const encrypted = rows[0].device_password_encrypted;
const decrypted = encryptionUtil.decrypt(encrypted);
// Returns: 'device_password_123'
```

### DeviceConnectionManager

**Save Device Configuration:**
```typescript
import { deviceConnectionManager } from '@/lib/services/DeviceConnectionManager';

const result = await deviceConnectionManager.saveDeviceConfig(
  schoolId: 1,
  deviceName: 'Main Gate',
  ip: '192.168.1.100',
  port: 80,
  username: 'admin',
  password: 'password123'
);

if (result.success) {
  console.log('Device saved:', result.id);
  // Device credentials encrypted and stored
  // Heartbeat monitoring started
}
```

**Start Heartbeat Monitoring:**
```typescript
// Automatically called after successful config save
deviceConnectionManager.startHeartbeatMonitoring(deviceConfigId, schoolId);

// Every 30 seconds:
// 1. Calls testConnection()
// 2. Updates device_connection_history
// 3. Updates device_configs.connection_status
// 4. Detects offline devices within 90 seconds (3 consecutive failures)
```

## API Usage Examples

### Configure Device (Frontend)
```typescript
// frontend/components/DeviceConfig.tsx
const configureDevice = async () => {
  const response = await fetch('/api/device-config', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      schoolId: 1,
      deviceName: 'Main Gate Biometric',
      deviceIp: '192.168.1.100',
      devicePort: 80,
      deviceUsername: 'admin',
      devicePassword: 'password123'
    })
  });

  const data = await response.json();
  if (data.success) {
    // Device configured and monitoring started
    console.log('Device connected:', data.data.deviceInfo);
  } else {
    // Show error
    console.error('Failed:', data.error);
  }
};
```

### Fetch Device Logs (Frontend)
```typescript
const fetchLogs = async () => {
  const response = await fetch(
    '/api/device-logs?schoolId=1&limit=50&offset=0&accessResult=granted'
  );
  const { data } = await response.json();
  
  // Display logs
  data.logs.forEach(log => {
    console.log(`[${log.timestamp}] ${log.personName} -> ${log.accessResult}`);
  });
};
```

### View Connection History (Frontend)
```typescript
const getConnectionStats = async () => {
  const response = await fetch('/api/device-connection-history?schoolId=1&limit=100');
  const { data } = await response.json();
  
  console.log(`Success Rate: ${data.stats.successRate}`);
  console.log(`Avg Response Time: ${data.stats.totalAttempts ? 
    (data.attempts.reduce((sum, a) => sum + (a.responseTimeMs || 0), 0) / data.stats.totalAttempts).toFixed(0) 
    : 0}ms`);
};
```

## Database Queries

### Check Current Connection Status
```sql
SELECT 
  device_name,
  connection_status,
  last_connection_attempt,
  last_error_message
FROM device_configs
WHERE school_id = 1;
```

### Get Recent Access Events
```sql
SELECT 
  event_timestamp,
  person_name,
  card_number,
  access_result,
  device_event_type
FROM device_access_logs
WHERE device_config_id = 1
ORDER BY event_timestamp DESC
LIMIT 50;
```

### Analyze Connection Reliability
```sql
SELECT 
  DATE_FORMAT(created_at, '%Y-%m-%d %H:00') as hour,
  COUNT(*) as attempts,
  SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successes,
  ROUND(AVG(response_time_ms), 2) as avg_response_ms,
  GROUP_CONCAT(DISTINCT status) as status_types
FROM device_connection_history
WHERE device_config_id = 1
  AND created_at > DATE_SUB(NOW(), INTERVAL 24 HOUR)
GROUP BY hour
ORDER BY hour DESC;
```

### Find Authentication Failures
```sql
SELECT 
  created_at,
  http_status_code,
  error_message,
  response_time_ms
FROM device_connection_history
WHERE device_config_id = 1
  AND status = 'unauthorized'
ORDER BY created_at DESC
LIMIT 10;
```

## Error Handling Examples

### Graceful Error Recovery
```typescript
async function ensureDeviceConnected(schoolId: number) {
  const config = await deviceConnectionManager.loadDeviceConfig(schoolId);
  
  if (!config) {
    throw new Error('Device not configured');
  }

  if (config.connectionStatus === 'error') {
    // Attempt reconnection
    const result = await deviceConnectionManager.testAndUpdateDeviceConnection(schoolId);
    if (!result.success) {
      throw new Error(`Device offline: ${result.error}`);
    }
  }

  return config;
}
```

### Automatic Retry on Timeout
```typescript
async function fetchLogsWithRetry(deviceId: number, maxRetries = 3) {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const config = await deviceConnectionManager.loadDeviceConfig(schoolId);
      const logs = await dahuaService.fetchAccessLogs(config);
      return logs;
    } catch (error) {
      lastError = error as Error;
      if (error.message.includes('timeout')) {
        // Wait 2 seconds before retry
        await new Promise(r => setTimeout(r, 2000));
      }
    }
  }

  throw lastError;
}
```

## Testing in Development

### Test Device Connection
```bash
# Start development server
npm run dev

# Open browser to admin page
http://localhost:3001/admin

# Click "Configure Biometric Device"
# Enter test device credentials:
# IP: 192.168.1.100
# Port: 80
# Username: admin
# Password: admin
# Click "Test Connection"
```

### Check Server Logs
```bash
# Watch for connection messages
[Device Manager] POST: Testing connection...
[Dahua Service] Testing connection to 192.168.1.100:80
[Dahua Service] GET /cgi-bin/magicBox.cgi?action=getSystemInfo
[Dahua Service] Response: 200 OK (145ms)
```

### Verify Database Storage
```bash
mysql -u root ibunbaz_drais

# Check device configuration
SELECT id, device_name, device_ip, connection_status 
FROM device_configs;

# Check connection history
SELECT * FROM device_connection_history 
ORDER BY created_at DESC LIMIT 5;

# Check access logs
SELECT * FROM device_access_logs 
ORDER BY event_timestamp DESC LIMIT 5;
```

## Common Issues & Solutions

### Issue: "Device Not Reachable" Error
```
Solution:
1. Verify IP address: ping 192.168.1.100
2. Check network connectivity: tracert 192.168.1.100
3. Verify device port (usually 80 or 443)
4. Ensure device is powered on
5. Check firewall rules
```

### Issue: "Authentication Failed" (401)
```
Solution:
1. Verify credentials in device web interface
2. Check credential format (no special characters)
3. Ensure user has admin privileges
4. Reset device admin password
5. Check if HTTP Basic Auth is enabled
```

### Issue: Access Logs Not Showing
```
Solution:
1. Check /cgi-bin/recordFinder.cgi is supported
2. Verify device has recorded events
3. Check device date/time is correct
4. Look for events in device log viewer first
5. Check database: SELECT COUNT(*) FROM device_access_logs;
```

### Issue: Heartbeat Monitoring Not Running
```
Solution:
1. Check startHeartbeatMonitoring() was called
2. Verify no JavaScript errors in console
3. Check database for connection history entries
4. Verify DEVICE_ENCRYPTION_KEY is set
5. Check server logs for errors
```

## Performance Optimization

### Reduce API Calls
```typescript
// Don't refresh logs every second
// Recommended: 15-60 seconds interval in auto-refresh

// Use pagination
/api/device-logs?limit=50&offset=0  // Fetch 50 per page
/api/device-logs?limit=50&offset=50 // Next page
```

### Database Indexing
```sql
-- Verify indexes are in place for fast queries
SHOW INDEX FROM device_connection_history;
SHOW INDEX FROM device_access_logs;

-- Indexes should exist on:
-- - device_config_id
-- - event_timestamp (for logs)
-- - created_at (for history)
-- - status (for filtering)
```

### Archive Old Data
```sql
-- Archive logs older than 90 days (optional)
DELETE FROM device_access_logs
WHERE event_timestamp < DATE_SUB(NOW(), INTERVAL 90 DAY);

-- Keep 180 days of connection history
DELETE FROM device_connection_history
WHERE created_at < DATE_SUB(NOW(), INTERVAL 180 DAY);
```

## Integration with Attendance System

### Mark Attendance on Card Swipe (Future)
```typescript
// When access granted event received
async function handleAccessGranted(log: DahuaAccessLog) {
  // 1. Find student by card number
  const student = await findStudentByCardNumber(log.cardNumber);
  
  if (student) {
    // 2. Mark attendance
    await markStudentPresent(student.id, new Date(log.timestamp));
    
    // 3. Log event
    console.log(`Student ${student.name} marked present`);
  }
}
```

## Generate Encryption Key

```bash
# Generate a secure random key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Output: 5f8a3b2c1e7d9f4a6b8c2d5e9f1a3b4c5f8a3b2c1e7d9f4a6b8c2d5e9f1a3b

# Add to .env.local
echo "DEVICE_ENCRYPTION_KEY=5f8a3b2c1e7d9f4a6b8c2d5e9f1a3b4c5f8a3b2c1e7d9f4a6b8c2d5e9f1a3b" >> .env.local
```

## Next Steps

1. ✅ Backend services implemented
2. ✅ API endpoints created
3. ✅ Database schema deployed
4. ✅ Frontend modal component built
5. ⏳ Add modal to admin/settings page
6. ⏳ Test with actual Dahua device
7. ⏳ Deploy to production
8. ⏳ Configure automated backups for device_* tables
9. ⏳ Set up monitoring alerts for connection failures
10. ⏳ Implement access control rules (optional)

