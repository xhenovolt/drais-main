#!/usr/bin/env node
/**
 * JIPRA STAFF FORENSIC RECOVERY - COMPREHENSIVE PHASE 0
 * ================================================
 * 
 * Fixed version using correct schema
 */

import mysql from 'mysql2/promise';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '.env.local') });

const DB_CONFIG = {
  host: process.env.TIDB_HOST || 'localhost',
  port: process.env.TIDB_PORT || 4000,
  user: process.env.TIDB_USER || 'root',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_DB || 'drais',
  ssl: {},
};

let conn = null;

async function connect() {
  try {
    conn = await mysql.createConnection(DB_CONFIG);
    console.log('✓ Connected to database:', DB_CONFIG.database);
    return conn;
  } catch (err) {
    console.error('✗ Connection failed:', err.message);
    process.exit(1);
  }
}

async function query(sql, params = []) {
  if (!conn) throw new Error('Database not connected');
  try {
    const [rows] = await conn.execute(sql, params);
    return rows;
  } catch (err) {
    console.error(`✗ Query error:`, err.message);
    throw err;
  }
}

async function auditPhase0() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 0: FORENSIC AUDIT - JIPRA STAFF RECOVERY');
  console.log('='.repeat(70));

  const audit = {
    timestamp: new Date().toISOString(),
    jipraSchoolId: 12004,
    activePeopleStaff: [],
    softDeletedPeopleStaff: [],
    staffWithAllocations: [],
    orphanedAllocations: [],
    inconsistencies: [],
    recommendations: [],
  };

  try {
    console.log('\n[1] Active JIPRA staff from people table...');
    const activePeople = await query(`
      SELECT 
        id, 
        CONCAT(first_name, ' ', last_name) as full_name,
        email, 
        phone,
        national_id,
        created_at,
        deleted_at
      FROM people 
      WHERE school_id = 12004 AND deleted_at IS NULL
      ORDER BY id DESC
    `);
    
    console.log(`  Found ${activePeople.length} active people records`);
    audit.activePeopleStaff = activePeople;

    console.log('\n[2] Soft-deleted JIPRA staff from people table...');
    const softDeletedPeople = await query(`
      SELECT 
        id,
        CONCAT(first_name, ' ', last_name) as full_name,
        email,
        phone,
        national_id,
        created_at,
        deleted_at,
        deleted_by,
        delete_reason,
        restored_at
      FROM people 
      WHERE school_id = 12004 AND deleted_at IS NOT NULL
      ORDER BY deleted_at DESC
    `);

    console.log(`  Found ${softDeletedPeople.length} soft-deleted people records`);
    audit.softDeletedPeopleStaff = softDeletedPeople;
    
    if (softDeletedPeople.length > 0) {
      console.log(`  ⚠ IMPORTANT: ${softDeletedPeople.length} deleted staff to potentially recover`);
      softDeletedPeople.forEach(p => {
        console.log(`    - ${p.full_name} (${p.email}) deleted at ${p.deleted_at}`);
      });
    }

    console.log('\n[3] Staff table entries for JIPRA...');
    const activeStaff = await query(`
      SELECT 
        s.id,
        s.person_id,
        p.first_name,
        p.last_name,
        s.staff_no,
        s.position,
        s.employment_type,
        s.status,
        s.hire_date,
        s.created_at,
        s.deleted_at
      FROM staff s
      LEFT JOIN people p ON s.person_id = p.id
      WHERE s.school_id = 12004 AND s.deleted_at IS NULL
    `);

    console.log(`  Found ${activeStaff.length} active staff records`);
    audit.staffWithAllocations = activeStaff;

    const softDeletedStaff = await query(`
      SELECT 
        s.id,
        s.person_id,
        p.first_name,
        p.last_name,
        s.staff_no,
        s.position,
        s.employment_type,
        s.status,
        s.deleted_at,
        s.deleted_by,
        s.delete_reason
      FROM staff s
      LEFT JOIN people p ON s.person_id = p.id
      WHERE s.school_id = 12004 AND s.deleted_at IS NOT NULL
    `);

    console.log(`  Found ${softDeletedStaff.length} soft-deleted staff records`);
    if (softDeletedStaff.length > 0) {
      softDeletedStaff.forEach(s => {
        console.log(`    - Staff ID ${s.id}: ${s.first_name} ${s.last_name} (${s.staff_no})`);
      });
    }

    console.log('\n[4] Checking for allocations (timetable, subject, class references)...');
    
    // Check for timetable allocations
    try {
      const [tableInfo] = await conn.execute(`
        SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
        WHERE TABLE_SCHEMA = ? AND TABLE_NAME LIKE '%timetable%'
      `, [DB_CONFIG.database]);
      
      console.log(`  Found ${tableInfo.length} timetable-related tables`);
    } catch (err) {
      console.log('  ⚠ Could not check timetable tables');
    }

    // Check class allocations
    try {
      const classAlloc = await query(`
        SELECT COUNT(*) as cnt FROM class_teachers WHERE school_id = 12004
      `);
      console.log(`  Class teacher allocations: ${classAlloc[0].cnt}`);
    } catch (err) {
      console.log('  ⚠ Could not check class allocations');
    }

    console.log('\n[5] Checking for orphaned references...');
    
    // Check device/biometric mappings
    const deviceMappings = await query(`
      SELECT COUNT(*) as cnt FROM device_user_mappings 
      WHERE school_id = 12004
    `);
    console.log(`  Device user mappings: ${deviceMappings[0].cnt}`);

    console.log('\n[6] Summary and recommendations...');
    console.log('='.repeat(70));
    console.log(`JIPRA School ID: 12004`);
    console.log(`Active people: ${activePeople.length}`);
    console.log(`Soft-deleted people: ${softDeletedPeople.length}`);
    console.log(`Active staff: ${activeStaff.length}`);
    console.log(`Soft-deleted staff: ${softDeletedStaff.length}`);
    
    if (softDeletedPeople.length > 0 || softDeletedStaff.length > 0) {
      audit.recommendations.push(`✓ Recovery possible: ${softDeletedPeople.length + softDeletedStaff.length} soft-deleted records can be restored`);
    } else {
      audit.recommendations.push('⚠ No soft-deleted records found. All deleted staff appear to be hard-deleted.');
    }

    // Save report
    const reportPath = path.join(__dirname, 'JIPRA_STAFF_FORENSIC_PHASE0_DETAILED.json');
    fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
    console.log(`\n✓ Detailed audit report saved to: ${reportPath}`);

    return audit;

  } catch (err) {
    console.error('✗ Audit error:', err.message);
    console.error('Stack:', err.stack);
    throw err;
  }
}

/**
 * Main execution
 */
async function main() {
  try {
    await connect();
    const auditResults = await auditPhase0();
    
    console.log('\n' + '='.repeat(70));
    console.log('PHASE 0 COMPLETE');
    console.log('='.repeat(70));
    console.log('\nRecommendations:');
    auditResults.recommendations.forEach(rec => console.log(`  ${rec}`));

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
