# Dahua Device Integration - Testing & Verification Guide

## Pre-Flight Checklist

Before testing, verify the following:

- [ ] Node.js and npm installed
- [ ] MySQL running with ibunbaz_drais database
- [ ] Development environment configured
- [ ] Source code compiled successfully
- [ ] All files created (see verification commands below)

## Step 1: Verify All Files Are Created

### Backend Services
```bash
# Check service layer files exist
ls -la src/lib/services/DahuaDeviceService.ts
ls -la src/lib/services/EncryptionUtil.ts
ls -la src/lib/services/DeviceConnectionManager.ts

# Expected: All files exist, ~470, ~140, and ~350 lines respectively
wc -l src/lib/services/*.ts
```

### API Routes
```bash
# Check API endpoints exist
ls -la src/app/api/device-config/route.ts
ls -la src/app/api/device-logs/route.ts
ls -la src/app/api/device-connection-history/route.ts

# Expected: All three files exist
```

### Frontend Component
```bash
# Check modal component exists
ls -la src/components/device/DeviceConnectionModal.tsx

# Expected: File exists, ~500+ lines
wc -l src/components/device/DeviceConnectionModal.tsx
```

### Database Schema
```bash
# Check database file exists
ls -la database/dahua_device_integration.sql

# Expected: File exists, ~80+ lines
wc -l database/dahua_device_integration.sql
```

### Documentation
```bash
# Check all documentation files exist
ls -la DAHUA_*.md

# Expected: 4 markdown files
# - DAHUA_COMPLETION_REPORT.md
# - DAHUA_DEVICE_INTEGRATION_GUIDE.md
# - DAHUA_DEVICE_QUICK_REFERENCE.md
# - DAHUA_IMPLEMENTATION_SUMMARY.md
```

## Step 2: Verify Build Succeeds

```bash
# Clean and rebuild
rm -rf .next
npm run build

# Expected output:
# ✓ Compiled successfully in ~20-30 seconds
# ✓ No critical TypeScript errors
# ✓ Production build created
```

## Step 3: Verify Database Schema

```bash
# Connect to MySQL
mysql -u root

# Select database
USE ibunbaz_drais;

# Check device tables exist
SHOW TABLES LIKE 'device_%';

# Expected output:
# +------------------------------------+
# | Tables_in_ibunbaz_drais (device_%) |
# +------------------------------------+
# | device_access_logs                 |
# | device_configs                     |
# | device_connection_history          |
# | device_sync_checkpoints            |
# | device_sync_logs                   |
# | device_users                       |
# +------------------------------------+
```

## Step 4: Setup Environment Variables

```bash
# Open .env.local
nano .env.local

# Generate encryption key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output

# Add to .env.local:
DEVICE_ENCRYPTION_KEY=<paste-generated-key>

# Verify it's set
grep DEVICE_ENCRYPTION_KEY .env.local

# Expected: One line with 64-character hex string
```

## Step 5: Start Development Server

```bash
# Start development server
npm run dev

# Expected output:
# > DRAIS@0.0.0036 dev
# > next dev
# 
# ▲ Next.js 15.5.0
# - Environments: .env.local
# - Experiments (use with caution):
#   · optimizePackageImports
# 
# ✓ Ready in 1234ms
# 
# ➜  Local:        http://localhost:3001
# ➜  Environments: .env.local

# Note: Server runs on port 3001 (port 3000 in use)
```

## Step 6: Test API Endpoints

### Test Device Config GET (No Device Configured)

```bash
# In another terminal
curl "http://localhost:3001/api/device-config?schoolId=1" \
  -H "Content-Type: application/json"

# Expected response:
# {
#   "success": true,
#   "configured": false,
#   "data": null
# }
```

### Test Encryption Utility (Standalone)

```bash
# Create a test script
cat > test-encryption.js << 'EOF'
const { encryptionUtil } = require('./src/lib/services/EncryptionUtil.ts');

const plaintext = "test_password_123";
console.log("Original:", plaintext);

const encrypted = encryptionUtil.encrypt(plaintext);
console.log("Encrypted length:", encrypted.length);
console.log("Encrypted (first 50 chars):", encrypted.substring(0, 50) + "...");

const decrypted = encryptionUtil.decrypt(encrypted);
console.log("Decrypted:", decrypted);
console.log("Match:", plaintext === decrypted);
EOF

# Run test (requires ts-node or compilation)
npm run build
node -e "const e = require('./.next/server/lib/services/EncryptionUtil').encryptionUtil; const p = 'test'; const enc = e.encrypt(p); console.log('Original:', p); console.log('Encrypted:', enc.substring(0,50)+'...'); console.log('Decrypted:', e.decrypt(enc)); console.log('Match:', p === e.decrypt(enc));"
```

## Step 7: Test API Endpoint (with Mock Device)

### Create Mock Device Response Server

```bash
# Create mock server on port 8888
cat > mock-device.js << 'EOF'
const http = require('http');

const server = http.createServer((req, res) => {
  // Set Basic Auth header requirement
  const auth = Buffer.from('admin:admin').toString('base64');
  const clientAuth = (req.headers.authorization || '').split(' ')[1];

  if (clientAuth !== auth) {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Unauthorized');
    return;
  }

  // Mock getSystemInfo endpoint
  if (req.url === '/cgi-bin/magicBox.cgi?action=getSystemInfo') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('DeviceType=DHI-ASI-1602A\nSerialNumber=ABC123XYZ\nFirmwareVersion=v2.1.0\n');
    return;
  }

  // Mock recordFinder endpoint
  if (req.url === '/cgi-bin/recordFinder.cgi') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { timestamp: new Date().toISOString(), personName: 'John Doe', cardNumber: '12345', accessResult: 'Granted' },
      { timestamp: new Date().toISOString(), personName: 'Jane Smith', cardNumber: '67890', accessResult: 'Denied' }
    ]));
    return;
  }

  res.writeHead(404);
  res.end('Not Found');
});

server.listen(8888, () => {
  console.log('Mock Dahua device running on http://localhost:8888');
  console.log('Credentials: admin / admin');
  console.log('Endpoints:');
  console.log('  /cgi-bin/magicBox.cgi?action=getSystemInfo');
  console.log('  /cgi-bin/recordFinder.cgi');
});
EOF

# Run mock server in another terminal
node mock-device.js
```

### Test Configuration POST Endpoint

```bash
# Test device config (assuming mock device on localhost:8888)
curl -X POST "http://localhost:3001/api/device-config" \
  -H "Content-Type: application/json" \
  -d '{
    "schoolId": 1,
    "deviceName": "Test Device",
    "deviceIp": "127.0.0.1",
    "devicePort": 8888,
    "deviceUsername": "admin",
    "devicePassword": "admin"
  }' | jq

# Expected response (success):
# {
#   "success": true,
#   "message": "Device configured and connected successfully",
#   "data": {
#     "deviceConfigId": 1,
#     "connectionStatus": "connected",
#     "responseTimeMs": 145,
#     "monitoringStarted": true,
#     "deviceInfo": {
#       "deviceType": "DHI-ASI-1602A",
#       "serialNumber": "ABC123XYZ",
#       "firmwareVersion": "v2.1.0"
#     }
#   }
# }
```

### Test Get Configuration

```bash
# Retrieve saved configuration
curl "http://localhost:3001/api/device-config?schoolId=1" \
  -H "Content-Type: application/json" | jq

# Expected response:
# {
#   "success": true,
#   "configured": true,
#   "data": {
#     "id": 1,
#     "deviceName": "Test Device",
#     "deviceIp": "127.0.0.1",
#     "devicePort": 8888,
#     "deviceUsername": "admin",
#     "connectionStatus": "connected",
#     "lastConnectionAttempt": "2024-02-28T15:30:00Z"
#   }
# }
```

### Test Device Logs Endpoint

```bash
# Fetch device logs
curl "http://localhost:3001/api/device-logs?schoolId=1&limit=50" \
  -H "Content-Type: application/json" | jq

# Expected response:
# {
#   "success": true,
#   "data": {
#     "logs": [ ... ],
#     "pagination": {
#       "total": 100,
#       "limit": 50,
#       "offset": 0,
#       "hasNextPage": true
#     }
#   }
# }
```

### Test Connection History

```bash
# Check connection history
curl "http://localhost:3001/api/device-connection-history?schoolId=1" \
  -H "Content-Type: application/json" | jq

# Expected response:
# {
#   "success": true,
#   "data": {
#     "attempts": [ ... ],
#     "stats": {
#       "totalAttempts": 1,
#       "successfulAttempts": 1,
#       "successRate": "100.00%"
#     }
#   }
# }
```

## Step 8: Test Database Records

### Check Device Config Was Saved

```bash
mysql -u root ibunbaz_drais -e "
SELECT id, device_name, device_ip, connection_status, last_connection_attempt 
FROM device_configs;
"

# Expected output:
# +----+-------------+-------------+-------------------+------------------------+
# | id | device_name | device_ip   | connection_status | last_connection_attempt|
# +----+-------------+-------------+-------------------+------------------------+
# | 1  | Test Device | 127.0.0.1   | connected         | 2024-02-28 15:30:00    |
# +----+-------------+-------------+-------------------+------------------------+
```

### Check Password Was Encrypted

```bash
mysql -u root ibunbaz_drais -e "
SELECT id, device_name, LENGTH(device_password_encrypted) as pwd_length 
FROM device_configs;
"

# Expected output:
# - device_password_encrypted should be hex string, not plain text
# - Length should be ~100+ characters (IV+AuthTag+Ciphertext)
```

### Check Connection History

```bash
mysql -u root ibunbaz_drais -e "
SELECT id, connection_attempt_type, status, http_status_code, response_time_ms, created_at 
FROM device_connection_history 
ORDER BY created_at DESC 
LIMIT 5;
"

# Expected output:
# - At least one 'test' attempt with 'success' status
# - HTTP status code should be 200
# - Response time should be > 0ms
```

## Step 9: Verify Heartbeat Monitoring

### Check Monitoring Started

```bash
# Wait 60 seconds to observe heartbeat
# Monitor connection history for new entries

while true; do
  clear
  echo "Checking for heartbeat monitoring..."
  mysql -u root ibunbaz_drais -e "
    SELECT created_at, status, response_time_ms 
    FROM device_connection_history 
    ORDER BY created_at DESC 
    LIMIT 5;
  "
  echo ""
  echo "Last updated: $(date)"
  sleep 10
done

# Expected: New entries should appear every ~30 seconds
```

## Step 10: Test Frontend Modal

### Add Modal to Test Page

```tsx
// Create temporary test page: src/app/test-device/page.tsx
'use client';

import DeviceConnectionModal from '@/components/device/DeviceConnectionModal';
import { useState } from 'react';

export default function TestDevicePage() {
  const [modalOpen, setModalOpen] = useState(true);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Device Connection Test</h1>
      <button 
        onClick={() => setModalOpen(true)}
        className="px-4 py-2 bg-blue-600 text-white rounded"
      >
        Open Device Modal
      </button>

      <DeviceConnectionModal 
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        schoolId={1}
      />
    </div>
  );
}
```

### Test in Browser

```bash
# Open http://localhost:3001/test-device
# You should see:
# - Modal with Device Connection tab selected
# - Form fields: Device Name, Device IP, Device Port, Username, Password
# - Test Connection button
# - Save & Connect button
# - Device Logs tab

# Test steps:
# 1. Enter device IP: 127.0.0.1
# 2. Enter port: 8888
# 3. Enter username: admin
# 4. Enter password: admin
# 5. Click "Test Connection"
# 6. Should show success message with device info
# 7. Click "Save & Connect"
# 8. Should confirm configuration saved
# 9. Click "Device Logs" tab
# 10. Should show mock access logs
# 11. Test auto-refresh toggle
```

## Step 11: Error Testing

### Test With Wrong Credentials

```bash
curl -X POST "http://localhost:3001/api/device-config" \
  -H "Content-Type: application/json" \
  -d '{
    "schoolId": 2,
    "deviceName": "Test Device",
    "deviceIp": "127.0.0.1",
    "devicePort": 8888,
    "deviceUsername": "wrong",
    "devicePassword": "credentials"
  }' | jq

# Expected response (401 error):
# {
#   "success": false,
#   "error": "Connection test failed: Authentication Failed"
# }

# Check error was recorded
mysql -u root ibunbaz_drais -e "
SELECT status, error_message FROM device_connection_history 
WHERE status = 'unauthorized' 
ORDER BY created_at DESC LIMIT 1;
"
```

### Test With Unreachable Device

```bash
curl -X POST "http://localhost:3001/api/device-config" \
  -H "Content-Type: application/json" \
  -d '{
    "schoolId": 3,
    "deviceName": "Unreachable",
    "deviceIp": "10.255.255.1",
    "devicePort": 80,
    "deviceUsername": "admin",
    "devicePassword": "admin"
  }' | jq

# Expected response (timeout/unreachable):
# {
#   "success": false,
#   "error": "Connection test failed: Device Not Reachable"
# }
```

## Cleanup After Testing

```bash
# Stop development server
# Ctrl+C in terminal running `npm run dev`

# Stop mock device
# Ctrl+C in terminal running mock-device.js

# Remove test page
rm -f src/app/test-device/page.tsx

# Clear test data from database (optional)
mysql -u root ibunbaz_drais -e "
DELETE FROM device_connection_history;
DELETE FROM device_access_logs;
DELETE FROM device_configs;
"
```

## Troubleshooting

### Issue: Build Failed
```bash
# Clear Next.js cache
rm -rf .next

# Rebuild
npm run build

# Check for TypeScript errors
npx tsc --noEmit
```

### Issue: Database Tables Not Found
```bash
# Re-import schema
mysql -u root ibunbaz_drais < database/dahua_device_integration.sql

# Verify
mysql -u root ibunbaz_drais -e "SHOW TABLES LIKE 'device_%';"
```

### Issue: Encryption Key Error
```bash
# Check environment variable
echo $DEVICE_ENCRYPTION_KEY

# Regenerate key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Update .env.local
# Restart dev server
```

### Issue: API Returns 404
```bash
# Check routes exist
ls -la src/app/api/device-config/route.ts
ls -la src/app/api/device-logs/route.ts
ls -la src/app/api/device-connection-history/route.ts

# Rebuild and restart
rm -rf .next
npm run build
npm run dev
```

## Success Indicators

✅ All files present (11 created files)  
✅ Build completes successfully  
✅ Database tables exist  
✅ Environment variable set  
✅ API endpoints respond without errors  
✅ Device config saved to database  
✅ Password encrypted (not plain text)  
✅ Connection history recorded  
✅ Heartbeat monitoring runs every 30 seconds  
✅ Frontend modal displays and functions  
✅ Real HTTP requests made to device  
✅ Error messages are specific and helpful  

## Next Steps

After successful testing:

1. **Deploy to Production**
   - Set DEVICE_ENCRYPTION_KEY in production environment
   - Configure HTTPS
   - Run database backups

2. **Integrate into Admin Interface**
   - Add modal call to admin/settings page
   - Add device status widget to dashboard
   - Configure email alerts for offline devices

3. **Configure Actual Device**
   - Obtain device IP address
   - Obtain device credentials
   - Test connection with actual hardware
   - Verify access logs appear in UI

4. **Monitor & Maintain**
   - Check connection_history for issues
   - Archive old access logs
   - Rotate encryption key periodically
   - Update device credentials annually

---

**Testing Complete!** Your Dahua device integration system is ready for production use.

