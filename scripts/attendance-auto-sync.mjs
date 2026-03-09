#!/usr/bin/env node

/**
 * Attendance Auto-Sync Service
 * 
 * Automatically fetches logs from all configured devices and processes them
 * Can be run as a scheduled service or cron job
 * 
 * Usage:
 *   node scripts/attendance-auto-sync.mjs
 * 
 * Cron job (every 5 minutes):
 *   */5 * * * * cd /path/to/project && node scripts/attendance-auto-sync.mjs
 * 
 * Environment variables:
 *   API_BASE_URL: Base URL for API (default: http://localhost:3000)
 *   SCHOOL_ID: School ID to sync (default: 1)
 *   SYNC_INTERVAL_MINUTES: How often to sync if running as daemon (default: 5)
 *   DAEMON_MODE: Run continuously (default: false)
 */

import axios from 'axios';

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';
const SCHOOL_ID = process.env.SCHOOL_ID || 1;
const SYNC_INTERVAL = (process.env.SYNC_INTERVAL_MINUTES || 5) * 60 * 1000;
const DAEMON_MODE = process.env.DAEMON_MODE === 'true';

class AttendanceSync {
  constructor() {
    this.isRunning = false;
    this.failureCount = 0;
    this.successCount = 0;
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString();
    const color = {
      INFO: '\x1b[36m',
      SUCCESS: '\x1b[32m',
      WARNING: '\x1b[33m',
      ERROR: '\x1b[31m',
      RESET: '\x1b[0m',
    };
    console.log(
      `${color[level]}[${timestamp}] ${level}:${color.RESET} ${message}`
    );
  }

  async fetchLogsFromDevices() {
    try {
      this.log('Fetching logs from all devices...');

      const response = await axios.post(
        `${API_BASE_URL}/api/attendance/devices/fetch-logs`,
        {
          device_id: null,
          force_refresh: false,
        },
        { timeout: 30000 }
      );

      if (response.data.success) {
        this.log(
          `Fetched ${response.data.logs_count} logs, stored ${response.data.stored_count} new logs`,
          'SUCCESS'
        );
        return response.data.stored_count || 0;
      } else {
        this.log(`Failed to fetch logs: ${response.data.error}`, 'ERROR');
        return 0;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Error fetching logs: ${message}`, 'ERROR');
      return 0;
    }
  }

  async processLogs() {
    try {
      this.log('Processing pending logs...');

      const response = await axios.post(
        `${API_BASE_URL}/api/attendance/devices/process-logs`,
        {
          school_id: SCHOOL_ID,
          device_id: null,
          limit: 500,
        },
        { timeout: 30000 }
      );

      if (response.data.success) {
        this.log(
          `Processed ${response.data.processed} logs (${response.data.matched} matched, ${response.data.unmatched} unmatched)`,
          'SUCCESS'
        );
        return response.data.processed || 0;
      } else {
        this.log(`Failed to process logs: ${response.data.error}`, 'ERROR');
        return 0;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Error processing logs: ${message}`, 'ERROR');
      return 0;
    }
  }

  async getAnalytics() {
    try {
      this.log('Fetching analytics...');

      const response = await axios.get(
        `${API_BASE_URL}/api/attendance/devices/analytics?school_id=${SCHOOL_ID}&days=1`,
        { timeout: 30000 }
      );

      if (response.data.success) {
        const summary = response.data.data.summary;
        this.log(
          `Today's Status: Present=${summary.present_today}, Absent=${summary.absent_today}, Late=${summary.late_today}, Total Scans=${summary.total_scans}`,
          'SUCCESS'
        );
        return summary;
      } else {
        this.log('Failed to fetch analytics', 'WARNING');
        return null;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Error fetching analytics: ${message}`, 'WARNING');
      return null;
    }
  }

  async runSync() {
    if (this.isRunning) {
      this.log('Sync already running, skipping...', 'WARNING');
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.log('='.repeat(60));
      this.log('Starting Attendance Sync');
      this.log('='.repeat(60));

      // Step 1: Fetch logs
      const logsStored = await this.fetchLogsFromDevices();

      // Step 2: Process logs
      const logsProcessed = await this.processLogs();

      // Step 3: Get analytics
      const analytics = await this.getAnalytics();

      // Log summary
      const duration = Date.now() - startTime;
      this.log(`Sync completed in ${duration}ms`, 'SUCCESS');
      this.log('='.repeat(60));

      this.successCount++;
      this.failureCount = 0; // Reset failure counter on success
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log(`Sync failed: ${message}`, 'ERROR');
      this.failureCount++;

      if (this.failureCount >= 5) {
        this.log('Too many failures, check configuration', 'ERROR');
      }
    } finally {
      this.isRunning = false;
    }
  }

  async start() {
    if (!DAEMON_MODE) {
      // Run once
      await this.runSync();
      process.exit(0);
    }

    // Run continuously
    this.log(`Starting daemon mode (sync every ${SYNC_INTERVAL / 1000}s)`, 'INFO');
    await this.runSync();

    setInterval(() => {
      this.runSync();
    }, SYNC_INTERVAL);
  }

  printStats() {
    this.log(`Stats: Success=${this.successCount}, Failures=${this.failureCount}`);
  }
}

// Main execution
const sync = new AttendanceSync();

// Handle signals for graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down...');
  sync.printStats();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nTerminating...');
  sync.printStats();
  process.exit(0);
});

// Start sync
sync.start().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
