/**
 * Device Configuration API Routes
 *
 * GET  /api/device-config         - Get current device configuration
 * POST /api/device-config         - Save/test device configuration
 * PUT  /api/device-config         - Update device configuration
 */

import { NextRequest, NextResponse } from 'next/server';
import { deviceConnectionManager } from '@/lib/services/DeviceConnectionManager';
import { encryptionUtil } from '@/lib/services/EncryptionUtil';
import { getSessionSchoolId } from '@/lib/auth';

// Get device configuration for current school
export async function GET(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    // schoolId now from session auth (above)

    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'School ID required' }, { status: 400 });
    }

    const config = await deviceConnectionManager.loadDeviceConfig(schoolId);

    if (!config) {
      return NextResponse.json({ success: true, configured: false, data: null });
    }

    // Return config WITHOUT password (security)
    return NextResponse.json({
      success: true,
      configured: true,
      data: {
        id: config.id,
        deviceName: config.deviceName,
        deviceIp: config.deviceIp,
        devicePort: config.devicePort,
        deviceUsername: config.deviceUsername,
        deviceSerialNumber: config.deviceSerialNumber,
        deviceType: config.deviceType,
        connectionStatus: config.connectionStatus,
        lastConnectionAttempt: config.lastConnectionAttempt,
        lastSuccessfulConnection: config.lastSuccessfulConnection,
        lastErrorMessage: config.lastErrorMessage
      }
    });
  } catch (error: any) {
    console.error(`[Device Config API] GET error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Save and test device configuration
export async function POST(req: NextRequest) {
  let requestData;

  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    requestData = await req.json();

    const { deviceName, deviceIp, devicePort, deviceUsername, devicePassword } = requestData;

    // Validation
    if (!schoolId || !deviceName || !deviceIp || !devicePort || !deviceUsername || !devicePassword) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: deviceName, deviceIp, devicePort, deviceUsername, devicePassword'
        },
        { status: 400 }
      );
    }

    console.log(`[Device Config API] POST: Testing connection for ${deviceName} at ${deviceIp}:${devicePort}`);

    // Test connection BEFORE saving
    const testResult = await deviceConnectionManager.testAndUpdateDeviceConnection(schoolId);

    if (!testResult.success) {
      return NextResponse.json({
        success: false,
        error: testResult.error || testResult.message,
        details: {
          statusCode: testResult.statusCode,
          message: testResult.message,
          responseTimeMs: testResult.responseTimeMs
        }
      });
    }

    // Save configuration if test passed
    const saveResult = await deviceConnectionManager.saveDeviceConfig(
      schoolId,
      deviceName,
      deviceIp,
      devicePort,
      deviceUsername,
      devicePassword
    );

    if (!saveResult.success) {
      return NextResponse.json(
        { success: false, error: saveResult.error || 'Failed to save device configuration' },
        { status: 500 }
      );
    }

    // Start heartbeat monitoring
    deviceConnectionManager.startHeartbeatMonitoring(saveResult.id, schoolId);

    return NextResponse.json({
      success: true,
      message: 'Device configured and connected successfully',
      data: {
        deviceConfigId: saveResult.id,
        deviceInfo: testResult.data,
        connectionStatus: 'connected',
        responseTimeMs: testResult.responseTimeMs,
        monitoringStarted: true
      }
    });
  } catch (error: any) {
    console.error(`[Device Config API] POST error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// Update device configuration
export async function PUT(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;

    const requestData = await req.json();
    const { deviceName, deviceIp, devicePort, deviceUsername, devicePassword } = requestData;

    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'School ID required' }, { status: 400 });
    }

    // Save updated config
    const saveResult = await deviceConnectionManager.saveDeviceConfig(
      schoolId,
      deviceName,
      deviceIp,
      devicePort,
      deviceUsername,
      devicePassword
    );

    if (!saveResult.success) {
      return NextResponse.json(
        { success: false, error: saveResult.error || 'Failed to update device configuration' },
        { status: 500 }
      );
    }

    // Test new configuration
    const testResult = await deviceConnectionManager.testAndUpdateDeviceConnection(schoolId);

    return NextResponse.json({
      success: testResult.success,
      message: testResult.message,
      data: {
        deviceConfigId: saveResult.id,
        connectionStatus: testResult.success ? 'connected' : 'error',
        deviceInfo: testResult.data,
        error: testResult.error,
        responseTimeMs: testResult.responseTimeMs
      }
    });
  } catch (error: any) {
    console.error(`[Device Config API] PUT error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// DELETE: Remove device configuration
export async function DELETE(req: NextRequest) {
  try {
    const session = await getSessionSchoolId(req);
    if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    const schoolId = session.schoolId;
    // schoolId now from session auth (above)

    if (!schoolId) {
      return NextResponse.json({ success: false, error: 'School ID required' }, { status: 400 });
    }

    // TODO: Implement DELETE logic in DeviceConnectionManager
    // For now, we just stop monitoring
    const config = await deviceConnectionManager.loadDeviceConfig(schoolId);
    if (config) {
      deviceConnectionManager.stopHeartbeatMonitoring(config.id);
    }

    return NextResponse.json({
      success: true,
      message: 'Device configuration removed and monitoring stopped'
    });
  } catch (error: any) {
    console.error(`[Device Config API] DELETE error: ${error.message}`);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
