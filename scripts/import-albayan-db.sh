#!/bin/bash

# Database Import Script
# This script flushes the current database and imports the Albayan database

set -e

ALBAYAN_DB_FILE="database/drais_school_Albayan_2025.sql"
CURRENT_DB_NAME="drais_school"
MYSQL_USER="root"
MYSQL_PASSWORD=""
MYSQL_HOST="localhost"

echo "=== DRAIS Database Import Script ==="
echo "Source: $ALBAYAN_DB_FILE"
echo "Target Database: $CURRENT_DB_NAME"
echo ""

# Check if source file exists
if [ ! -f "$ALBAYAN_DB_FILE" ]; then
    echo "ERROR: Source database file not found: $ALBAYAN_DB_FILE"
    exit 1
fi

echo "✓ Source database file found"
echo ""

# Confirm before proceeding
read -p "Are you sure you want to FLUSH and REPLACE the current database? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Operation cancelled."
    exit 0
fi

echo ""
echo "=== Step 1: Backing up current database (optional) ==="
echo "Skipping backup (user discretion advised)"
echo ""

echo "=== Step 2: Flushing current database ==="
if [ -n "$MYSQL_PASSWORD" ]; then
    mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" -e "DROP DATABASE IF EXISTS $CURRENT_DB_NAME;" 2>/dev/null
else
    mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" -e "DROP DATABASE IF EXISTS $CURRENT_DB_NAME;" 2>/dev/null
fi
echo "✓ Current database flushed"
echo ""

echo "=== Step 3: Creating new database ==="
if [ -n "$MYSQL_PASSWORD" ]; then
    mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" -e "CREATE DATABASE $CURRENT_DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;" 2>/dev/null
else
    mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" -e "CREATE DATABASE $CURRENT_DB_NAME CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;" 2>/dev/null
fi
echo "✓ Database created"
echo ""

echo "=== Step 4: Importing Albayan database ==="
if [ -n "$MYSQL_PASSWORD" ]; then
    mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" "$CURRENT_DB_NAME" < "$ALBAYAN_DB_FILE" 2>&1
else
    mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" "$CURRENT_DB_NAME" < "$ALBAYAN_DB_FILE" 2>&1
fi

if [ $? -eq 0 ]; then
    echo "✓ Database imported successfully"
else
    echo "✗ Error importing database"
    exit 1
fi
echo ""

echo "=== Step 5: Verifying import ==="
# Count imported tables
if [ -n "$MYSQL_PASSWORD" ]; then
    TABLE_COUNT=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$CURRENT_DB_NAME';" 2>/dev/null)
else
    TABLE_COUNT=$(mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$CURRENT_DB_NAME';" 2>/dev/null)
fi
echo "✓ Imported $TABLE_COUNT tables"
echo ""

# Verify school name
echo "=== Step 6: Verifying school name ==="
if [ -n "$MYSQL_PASSWORD" ]; then
    SCHOOL_NAME=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" -N -e "SELECT name FROM $CURRENT_DB_NAME.schools WHERE id=1 LIMIT 1;" 2>/dev/null)
else
    SCHOOL_NAME=$(mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" -N -e "SELECT name FROM $CURRENT_DB_NAME.schools WHERE id=1 LIMIT 1;" 2>/dev/null)
fi
echo "✓ School name: $SCHOOL_NAME"
echo ""

echo "=== Import Complete ==="
echo "The Albayan database has been successfully imported."
echo "School name verified: $SCHOOL_NAME"
