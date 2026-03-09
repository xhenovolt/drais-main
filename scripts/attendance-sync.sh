#!/bin/bash

# Attendance Module - Automated Sync Script
# 
# This script fetches logs from all configured devices and processes them
# Can be run via cron job or scheduled task
#
# Usage:
# - Manual run: bash scripts/attendance-sync.sh
# - Cron job: Add to crontab -e:
#   */5 * * * * cd /path/to/project && bash scripts/attendance-sync.sh >> logs/attendance-sync.log 2>&1

set -e

# Configuration
API_BASE_URL="${API_BASE_URL:-http://localhost:3000}"
SCHOOL_ID="${SCHOOL_ID:-1}"
LOG_FILE="${LOG_FILE:-logs/attendance-sync.log}"
TIMEOUT="${TIMEOUT:-30}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Create log directory if it doesn't exist
mkdir -p "$(dirname "$LOG_FILE")"

log() {
    echo "[$(date +'%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}" | tee -a "$LOG_FILE"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS: $1${NC}" | tee -a "$LOG_FILE"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}" | tee -a "$LOG_FILE"
}

# Main sync function
main() {
    log "=========================================="
    log "Starting Attendance Sync"
    log "=========================================="
    
    # Step 1: Fetch logs from all devices
    log "Step 1: Fetching logs from all devices..."
    
    FETCH_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/api/attendance/devices/fetch-logs" \
        -H "Content-Type: application/json" \
        -d "{\"device_id\": null, \"force_refresh\": false}" \
        --max-time "$TIMEOUT" \
        2>&1 || echo '{"success": false, "error": "Connection timeout"}')
    
    # Check if fetch was successful
    if echo "$FETCH_RESPONSE" | grep -q '"success":true'; then
        # Extract stats
        LOGS_COUNT=$(echo "$FETCH_RESPONSE" | grep -o '"logs_count":[0-9]*' | cut -d: -f2)
        STORED_COUNT=$(echo "$FETCH_RESPONSE" | grep -o '"stored_count":[0-9]*' | cut -d: -f2)
        log_success "Fetched $LOGS_COUNT logs, stored $STORED_COUNT new logs"
    else
        ERROR_MSG=$(echo "$FETCH_RESPONSE" | grep -o '"error":"[^"]*' | cut -d: -f2)
        log_warning "Failed to fetch logs: $ERROR_MSG (continuing to process anyways)"
    fi
    
    # Step 2: Process pending logs
    log "Step 2: Processing pending logs..."
    
    PROCESS_RESPONSE=$(curl -s -X POST "${API_BASE_URL}/api/attendance/devices/process-logs" \
        -H "Content-Type: application/json" \
        -d "{\"school_id\": $SCHOOL_ID, \"device_id\": null, \"limit\": 500}" \
        --max-time "$TIMEOUT" \
        2>&1 || echo '{"success": false, "error": "Connection timeout"}')
    
    if echo "$PROCESS_RESPONSE" | grep -q '"success":true'; then
        PROCESSED=$(echo "$PROCESS_RESPONSE" | grep -o '"processed":[0-9]*' | cut -d: -f2)
        MATCHED=$(echo "$PROCESS_RESPONSE" | grep -o '"matched":[0-9]*' | cut -d: -f2)
        log_success "Processed $PROCESSED logs, matched $MATCHED with students/staff"
    else
        ERROR_MSG=$(echo "$PROCESS_RESPONSE" | grep -o '"error":"[^"]*' | cut -d: -f2)
        log_error "Failed to process logs: $ERROR_MSG"
    fi
    
    # Step 3: Get current status
    log "Step 3: Fetching analytics..."
    
    ANALYTICS_RESPONSE=$(curl -s -X GET "${API_BASE_URL}/api/attendance/devices/analytics?school_id=${SCHOOL_ID}&days=1" \
        --max-time "$TIMEOUT" \
        2>&1 || echo '{"success": false}')
    
    if echo "$ANALYTICS_RESPONSE" | grep -q '"success":true'; then
        PRESENT=$(echo "$ANALYTICS_RESPONSE" | grep -o '"present_today":[0-9]*' | cut -d: -f2)
        ABSENT=$(echo "$ANALYTICS_RESPONSE" | grep -o '"absent_today":[0-9]*' | cut -d: -f2)
        LATE=$(echo "$ANALYTICS_RESPONSE" | grep -o '"late_today":[0-9]*' | cut -d: -f2)
        log_success "Today's Status: Present=$PRESENT, Absent=$ABSENT, Late=$LATE"
    else
        log_warning "Could not fetch analytics"
    fi
    
    log "=========================================="
    log "Attendance Sync Completed"
    log "=========================================="
}

# Run main function
main

exit 0
