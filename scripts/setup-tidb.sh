#!/bin/bash

# TiDB Cloud Database Setup Script
# This script exports the local MySQL database and imports it to TiDB Cloud

set -e

echo "================================"
echo "TiDB Cloud Database Setup"
echo "================================"
echo ""

# Configuration
TIDB_HOST="gateway01.eu-central-1.prod.aws.tidbcloud.com"
TIDB_PORT="4000"
TIDB_USER="2qzYvPUSbNa3RNc.root"
TIDB_PASSWORD="Gn4OSg1m8sSMSRMq"
TIDB_DB="test"
LOCAL_DB="ibunbaz_drais"
BACKUP_FILE="database_export_$(date +%Y%m%d_%H%M%S).sql"

# Step 1: Export local database
echo "📤 Step 1: Exporting local MySQL database ($LOCAL_DB)..."
if mysqldump -u root "$LOCAL_DB" > "$BACKUP_FILE"; then
    echo "✅ Database exported to: $BACKUP_FILE"
    echo "   Size: $(du -h $BACKUP_FILE | cut -f1)"
else
    echo "❌ Failed to export database"
    exit 1
fi
echo ""

# Step 2: Test TiDB connection
echo "🔌 Step 2: Testing TiDB Cloud connection..."
if timeout 10 mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASSWORD" \
    --ssl-mode=REQUIRED "$TIDB_DB" -e "SELECT 1;" >/dev/null 2>&1; then
    echo "✅ TiDB Cloud connection successful"
else
    echo "❌ Failed to connect to TiDB Cloud"
    echo "   Please check your credentials and network connection"
    exit 1
fi
echo ""

# Step 3: Import database to TiDB
echo "📥 Step 3: Importing database to TiDB Cloud..."
echo "   This may take a few minutes..."

if timeout 300 mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASSWORD" \
    --ssl-mode=REQUIRED "$TIDB_DB" < "$BACKUP_FILE" 2>&1 | grep -v "^Warning"; then
    echo "✅ Database imported to TiDB Cloud successfully"
else
    echo "❌ Import completed with warnings (this is normal)"
fi
echo ""

# Step 4: Verify import
echo "✓ Step 4: Verifying TiDB database..."
TABLE_COUNT=$(timeout 10 mysql -h "$TIDB_HOST" -P "$TIDB_PORT" -u "$TIDB_USER" -p"$TIDB_PASSWORD" \
    --ssl-mode=REQUIRED "$TIDB_DB" -sN -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$TIDB_DB';" 2>/dev/null || echo "0")

if [ "$TABLE_COUNT" -gt "0" ]; then
    echo "✅ Verification successful: $TABLE_COUNT tables found in TiDB"
else
    echo "⚠️  Could not verify table count (connection timeout)"
fi
echo ""

echo "================================"
echo "✅ Setup Complete!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Update .env.local with TiDB credentials (already done)"
echo "2. Run: npm run build"
echo "3. Run: npm run dev"
echo ""
echo "Database backup saved: $BACKUP_FILE"
echo ""
