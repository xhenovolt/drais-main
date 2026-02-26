#!/bin/bash

# Schema Validator Script
# This script compares the Albayan database schema with the current database

set -e

ALBAYAN_DB_FILE="database/drais_school_Albayan_2025.sql"
CURRENT_DB_NAME="drais_school"
MYSQL_USER="root"
MYSQL_PASSWORD=""
MYSQL_HOST="localhost"

echo "=== DRAIS Database Schema Validator ==="
echo ""

# Extract all table names from Albayan database
echo "Extracting table names from Albayan database..."
ALBAYAN_TABLES=$(grep "CREATE TABLE \`" "$ALBAYAN_DB_FILE" | awk -F'\`' '{print $2}' | sort)
ALBAYAN_TABLE_COUNT=$(echo "$ALBAYAN_TABLES" | wc -l)
echo "Found $ALBAYAN_TABLE_COUNT tables in Albayan database"
echo ""

# Get current database tables
echo "Getting current database tables..."
if [ -n "$MYSQL_PASSWORD" ]; then
    CURRENT_TABLES=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASSWORD" -h "$MYSQL_HOST" -N -e "SHOW TABLES FROM $CURRENT_DB_NAME;" 2>/dev/null | sort)
else
    CURRENT_TABLES=$(mysql -u "$MYSQL_USER" -h "$MYSQL_HOST" -N -e "SHOW TABLES FROM $CURRENT_DB_NAME;" 2>/dev/null | sort)
fi
CURRENT_TABLE_COUNT=$(echo "$CURRENT_TABLES" | wc -l)
echo "Found $CURRENT_TABLE_COUNT tables in current database"
echo ""

# Compare tables
echo "=== Table Comparison ==="
MISSING_TABLES=""
for table in $ALBAYAN_TABLES; do
    if echo "$CURRENT_TABLES" | grep -q "^${table}$"; then
        echo "✓ $table exists"
    else
        echo "✗ $table MISSING"
        MISSING_TABLES="$MISSING_TABLES $table"
    fi
done

echo ""
echo "=== Summary ==="
if [ -n "$MISSING_TABLES" ]; then
    echo "Missing tables:$MISSING_TABLES"
    echo ""
    echo "Action required: Run the database import to add missing tables"
else
    echo "All tables from Albayan schema are present in current database"
fi

echo ""
echo "Schema validation complete!"
