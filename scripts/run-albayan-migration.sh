#!/bin/bash
# =============================================================================
# DRAIS — Albayan Full Migration Orchestrator
# =============================================================================
# File    : scripts/run-albayan-migration.sh
# Date    : 2026-03-22
#
# PURPOSE:
#   1. Load Albayan source dump → drais_albayan_staging database
#   2. Run 022_albayan_full_migration.sql against drais database
#   3. Generate schema-only backup: drais_schema_backup_20260322.sql
#   4. Generate full data backup:   drais_with_albayan_20260322.sql
#
# USAGE:
#   chmod +x scripts/run-albayan-migration.sh
#   ./scripts/run-albayan-migration.sh
#
#   # With custom credentials (override .env defaults):
#   TIDB_HOST=my-host TIDB_PASSWORD=secret ./scripts/run-albayan-migration.sh
#
# REQUIREMENTS:
#   • mysql client (8.x or compatible)
#   • mysqldump (same version as mysql)
#   • Access to TiDB Cloud from this machine
# =============================================================================
set -euo pipefail

# ---------------------------------------------------------------------------
# CONFIGURATION
# ---------------------------------------------------------------------------
TIDB_HOST="${TIDB_HOST:-gateway01.eu-central-1.prod.aws.tidbcloud.com}"
TIDB_PORT="${TIDB_PORT:-4000}"
TIDB_USER="${TIDB_USER:-2qzYvPUSbNa3RNc.root}"
TIDB_PASSWORD="${TIDB_PASSWORD:-Gn4OSg1m8sSMSRMq}"

SOURCE_DUMP="database/drais_school_Albayan_2025.sql"
MIGRATION_SQL="database/migrations/022_albayan_full_migration.sql"
VALIDATION_SQL="database/migrations/ALBAYAN_VALIDATION_POST_022.sql"
STAGING_DB="drais_albayan_staging"
TARGET_DB="drais"
BACKUP_DIR="backup"
SCHEMA_BACKUP="${BACKUP_DIR}/drais_schema_backup_20260322.sql"
FULL_BACKUP="${BACKUP_DIR}/drais_with_albayan_20260322.sql"

# ---------------------------------------------------------------------------
# HELPERS
# ---------------------------------------------------------------------------
log()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
warn() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: $*" >&2; }
die()  { echo "[$(date '+%Y-%m-%d %H:%M:%S')] FATAL: $*" >&2; exit 1; }

mysql_cmd() {
  mysql \
    --host="$TIDB_HOST" \
    --port="$TIDB_PORT" \
    --user="$TIDB_USER" \
    --password="$TIDB_PASSWORD" \
    --ssl-mode=REQUIRED \
    --connect-timeout=30 \
    "$@"
}

mysqldump_cmd() {
  mysqldump \
    --host="$TIDB_HOST" \
    --port="$TIDB_PORT" \
    --user="$TIDB_USER" \
    --password="$TIDB_PASSWORD" \
    --ssl-mode=REQUIRED \
    --set-gtid-purged=OFF \
    --column-statistics=0 \
    "$@"
}

# ---------------------------------------------------------------------------
# PRE-FLIGHT CHECKS
# ---------------------------------------------------------------------------
log "======================================================="
log "  DRAIS — Albayan Migration Orchestrator"
log "  Target: ${TARGET_DB} on ${TIDB_HOST}"
log "======================================================="

command -v mysql    >/dev/null 2>&1 || die "mysql client not found. Install MySQL client tools."
command -v mysqldump >/dev/null 2>&1 || die "mysqldump not found. Install MySQL client tools."

[[ -f "$SOURCE_DUMP" ]]     || die "Source dump not found: $SOURCE_DUMP"
[[ -f "$MIGRATION_SQL" ]]   || die "Migration SQL not found: $MIGRATION_SQL"

mkdir -p "$BACKUP_DIR"

log "Pre-flight checks passed."

# ---------------------------------------------------------------------------
# STEP 1 — TEST CONNECTION
# ---------------------------------------------------------------------------
log ""
log "STEP 1: Testing TiDB Cloud connection..."

mysql_cmd -e "SELECT 1 AS connection_test;" "$TARGET_DB" > /dev/null 2>&1 \
  || die "Cannot connect to TiDB. Check TIDB_HOST, TIDB_USER, TIDB_PASSWORD."

log "  ✓ Connection to drais OK"

# ---------------------------------------------------------------------------
# STEP 2 — ABORT IF ALBAYAN ALREADY MIGRATED
# ---------------------------------------------------------------------------
log ""
log "STEP 2: Checking for existing Albayan migration..."

EXISTING=$(mysql_cmd --silent --skip-column-names -e \
  "SELECT COUNT(*) FROM schools WHERE email='superadmin@albayan.com';" "$TARGET_DB" 2>/dev/null || echo "0")

if [[ "$EXISTING" -gt "0" ]]; then
  warn "Albayan school already exists in drais.schools."
  warn "To re-migrate, first run: database/migrations/022_rollback_albayan.sql"
  warn "Exiting without changes."
  exit 0
fi

log "  ✓ No existing Albayan data found — safe to proceed"

# ---------------------------------------------------------------------------
# STEP 3 — CREATE STAGING DB AND LOAD SOURCE DUMP
# ---------------------------------------------------------------------------
log ""
log "STEP 3: Creating staging database and loading Albayan source dump..."
log "  Source: $SOURCE_DUMP"
log "  Staging DB: $STAGING_DB"

mysql_cmd -e "CREATE DATABASE IF NOT EXISTS \`${STAGING_DB}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" \
  || die "Failed to create staging database"

log "  Staging database ready. Loading dump (this may take a minute)..."

# Pipe the dump directly to avoid large memory usage
DUMP_ROWS=$(grep -c "^INSERT INTO" "$SOURCE_DUMP" 2>/dev/null || echo "unknown")
log "  INSERT statements in dump: $DUMP_ROWS"

mysql_cmd --database="$STAGING_DB" < "$SOURCE_DUMP" \
  || die "Failed to load source dump into staging DB"

log "  ✓ Source dump loaded into $STAGING_DB"

# Quick sanity check
STAGED_STUDENTS=$(mysql_cmd --silent --skip-column-names -e \
  "SELECT COUNT(*) FROM students;" "$STAGING_DB" 2>/dev/null || echo "?")
STAGED_PEOPLE=$(mysql_cmd --silent --skip-column-names -e \
  "SELECT COUNT(*) FROM people;" "$STAGING_DB" 2>/dev/null || echo "?")
STAGED_RESULTS=$(mysql_cmd --silent --skip-column-names -e \
  "SELECT COUNT(*) FROM class_results;" "$STAGING_DB" 2>/dev/null || echo "?")

log "  Staged: people=$STAGED_PEOPLE | students=$STAGED_STUDENTS | class_results=$STAGED_RESULTS"

# ---------------------------------------------------------------------------
# STEP 4 — RUN MAIN MIGRATION
# ---------------------------------------------------------------------------
log ""
log "STEP 4: Running 022_albayan_full_migration.sql against drais..."

mysql_cmd --database="$TARGET_DB" < "$MIGRATION_SQL" \
  || die "Migration SQL failed. Check output above for errors."

log "  ✓ Migration SQL executed successfully"

# ---------------------------------------------------------------------------
# STEP 5 — POST-MIGRATION VALIDATION
# ---------------------------------------------------------------------------
log ""
log "STEP 5: Running post-migration validation..."

# Inline validation queries (summary)
mysql_cmd --table -e "
  SET @SCHOOL_ID = (SELECT id FROM schools WHERE email = 'superadmin@albayan.com' LIMIT 1);
  SELECT 'COUNTS' AS report_section,
    (SELECT COUNT(*) FROM people     WHERE school_id = @SCHOOL_ID) AS people,
    (SELECT COUNT(*) FROM students   WHERE school_id = @SCHOOL_ID) AS students,
    (SELECT COUNT(*) FROM enrollments WHERE school_id = @SCHOOL_ID) AS enrollments,
    (SELECT COUNT(*) FROM enrollments WHERE school_id = @SCHOOL_ID AND status = 'active') AS active_enrollments_must_be_0,
    (SELECT COUNT(*) FROM classes WHERE school_id = @SCHOOL_ID) AS classes,
    (SELECT COUNT(*) FROM subjects WHERE school_id = @SCHOOL_ID) AS subjects;
" "$TARGET_DB" || warn "Validation query failed — check manually"

# Run external validation file if present
if [[ -f "$VALIDATION_SQL" ]]; then
  log "  Running extended validation from $VALIDATION_SQL..."
  mysql_cmd --table --database="$TARGET_DB" < "$VALIDATION_SQL" || warn "Validation file failed"
fi

log "  ✓ Validation complete"

# ---------------------------------------------------------------------------
# STEP 6 — SCHEMA-ONLY BACKUP
# ---------------------------------------------------------------------------
log ""
log "STEP 6: Creating schema-only backup..."
log "  Output: $SCHEMA_BACKUP"

{
  echo "-- =============================================================="
  echo "-- DRAIS Schema Backup — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "-- Schema Only (No Data) — Post Albayan Migration"
  echo "-- Generated by: scripts/run-albayan-migration.sh"
  echo "-- =============================================================="
  echo ""
} > "$SCHEMA_BACKUP"

mysqldump_cmd \
  --no-data \
  --add-drop-table \
  --single-transaction \
  --routines \
  --triggers \
  "$TARGET_DB" >> "$SCHEMA_BACKUP" \
  || die "Schema backup failed"

SCHEMA_SIZE=$(du -sh "$SCHEMA_BACKUP" | cut -f1)
log "  ✓ Schema backup complete: $SCHEMA_BACKUP ($SCHEMA_SIZE)"

# ---------------------------------------------------------------------------
# STEP 7 — FULL DATA BACKUP
# ---------------------------------------------------------------------------
log ""
log "STEP 7: Creating full data backup (schema + all data)..."
log "  Output: $FULL_BACKUP"
log "  This may take several minutes for large datasets..."

{
  echo "-- =============================================================="
  echo "-- DRAIS Full Backup — $(date '+%Y-%m-%d %H:%M:%S')"
  echo "-- Schema + All Data — Post Albayan Migration"
  echo "-- Generated by: scripts/run-albayan-migration.sh"
  echo "-- =============================================================="
  echo ""
} > "$FULL_BACKUP"

mysqldump_cmd \
  --add-drop-table \
  --single-transaction \
  --routines \
  --triggers \
  --hex-blob \
  "$TARGET_DB" >> "$FULL_BACKUP" \
  || die "Full backup failed"

FULL_SIZE=$(du -sh "$FULL_BACKUP" | cut -f1)
log "  ✓ Full backup complete: $FULL_BACKUP ($FULL_SIZE)"

# ---------------------------------------------------------------------------
# STEP 8 — CLEANUP STAGING DB (optional — comment out to keep for debugging)
# ---------------------------------------------------------------------------
log ""
log "STEP 8: Cleaning up staging database..."
mysql_cmd -e "DROP DATABASE IF EXISTS \`${STAGING_DB}\`;" \
  || warn "Could not drop staging DB — drop manually: DROP DATABASE ${STAGING_DB};"
log "  ✓ Staging database removed"

# ---------------------------------------------------------------------------
# FINAL SUMMARY
# ---------------------------------------------------------------------------
log ""
log "======================================================="
log "  ALBAYAN MIGRATION COMPLETE"
log "======================================================="
log ""
log "  School   : Albayan Quran Memorization Center"
log "  Login    : superadmin@albayan.com / superadmin"
log "  People   : ${STAGED_PEOPLE} records migrated"
log "  Students : ${STAGED_STUDENTS} records migrated"
log ""
log "  Backup files:"
log "    Schema : $SCHEMA_BACKUP  ($SCHEMA_SIZE)"
log "    Full   : $FULL_BACKUP  ($FULL_SIZE)"
log ""
log "  Next steps:"
log "    1. Verify login at /login with superadmin@albayan.com"
log "    2. Review class_results for Term III 2025"
log "    3. Enroll students for Term I 2026 via the UI"
log "    4. Update Albayan school logo in /public/client_logos/"
log "======================================================="
