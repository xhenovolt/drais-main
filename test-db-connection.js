#!/usr/bin/env node

/**
 * Test database connection - verifies TiDB Cloud is prioritized over local MySQL
 */

require('dotenv').config({ path: '.env.local' });

const mysql = require('mysql2/promise');

const tidbConfig = {
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER || '2Trc8kJebpKLb1Z.root',
  password: process.env.TIDB_PASSWORD || 'QMNAOiP9J1rANv4Z',
  database: process.env.TIDB_DB || 'drais',
  ssl: { rejectUnauthorized: false },
};

const mysqlConfig = {
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASS || '',
  database: process.env.MYSQL_DB || process.env.DB_NAME || 'ibunbaz_drais',
};

async function testConnection() {
  console.log('[Database Test] Starting connection test...\n');
  
  // Test TiDB
  console.log('[TiDB Cloud]');
  console.log(`  Host: ${tidbConfig.host}:${tidbConfig.port}`);
  console.log(`  User: ${tidbConfig.user}`);
  console.log(`  Database: ${tidbConfig.database}`);
  
  try {
    console.log('  Testing connection...');
    const tidbConn = await mysql.createConnection({
      ...tidbConfig,
      connectionTimeout: 5000,
    });
    const [result] = await tidbConn.query('SELECT 1 as test');
    await tidbConn.end();
    console.log('  ✅ SUCCESS - Connected to TiDB Cloud!\n');
    console.log('🎯 SYSTEM WILL USE: TiDB Cloud (Primary)\n');
    return 'tidb';
  } catch (error) {
    console.log(`  ❌ FAILED - ${error.message}\n`);
  }
  
  // Test local MySQL
  console.log('[Local MySQL Fallback]');
  console.log(`  Host: ${mysqlConfig.host}:${mysqlConfig.port}`);
  console.log(`  User: ${mysqlConfig.user}`);
  console.log(`  Database: ${mysqlConfig.database}`);
  
  try {
    console.log('  Testing connection...');
    const mysqlConn = await mysql.createConnection({
      ...mysqlConfig,
      connectionTimeout: 5000,
    });
    const [result] = await mysqlConn.query('SELECT 1 as test');
    await mysqlConn.end();
    console.log('  ✅ SUCCESS - Connected to Local MySQL!\n');
    console.log('🎯 SYSTEM WILL USE: Local MySQL (Fallback)\n');
    return 'mysql';
  } catch (error) {
    console.log(`  ❌ FAILED - ${error.message}\n`);
  }
  
  console.log('❌ Both databases are unavailable!');
  return null;
}

testConnection()
  .then((result) => {
    if (result === 'tidb') {
      console.log('✨ System is configured correctly for TiDB Cloud!');
      process.exit(0);
    } else if (result === 'mysql') {
      console.log('⚠️  Local MySQL is being used as fallback.');
      process.exit(0);
    } else {
      console.log('❌ No database connection available!');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('Error:', err);
    process.exit(1);
  });
