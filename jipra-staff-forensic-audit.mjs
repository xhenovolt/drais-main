#!/usr/bin/env node
/**
 * JIPRA STAFF FORENSIC RECOVERY - PHASE 0 AUDIT
 * ================================================
 * 
 * Comprehensive audit of all deleted, soft-deleted, and missing JIPRA staff.
 * Identifies every legitimate staff member that can be recovered.
 * 
 * PROTOCOL:
 * - Do NOT invent staff
 * - Do NOT create duplicates
 * - Find all legitimate deleted records
 * - Preserve historical integrity
 * - Document every finding
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

/**
 * PHASE 0: FORENSIC AUDIT
 * Find all data sources that might contain JIPRA staff
 */

async function auditPhase0() {
  console.log('\n' + '='.repeat(70));
  console.log('PHASE 0: FORENSIC AUDIT');
  console.log('='.repeat(70));

  const audit = {
    timestamp: new Date().toISOString(),
    jipraSchoolId: null,
    staffOverview: {},
    deletedStaff: [],
    softDeletedStaff: [],
    orphanedAllocations: [],
    auditLogReferences: [],
    inconsistencies: [],
    recoveryPlan: [],
  };

  try {
    // 1. Find JIPRA school ID
    console.log('\n[1] Finding JIPRA school_id...');
    const schools = await query(`
      SELECT id, name, short_code FROM schools 
      WHERE name LIKE ? OR short_code LIKE ? 
      LIMIT 10
    `, ['%JIPRA%', '%JIPRA%']);

    let jipraId = null;
    if (schools.length > 0) {
      console.log('Found schools matching "JIPRA":');
      schools.forEach(s => {
        console.log(`  - ID: ${s.id}, Name: ${s.name}, Code: ${s.short_code}`);
        if (s.short_code === 'JIPRA' || s.name.includes('JIPRA')) {
          jipraId = s.id;
        }
      });
    } else {
      console.log('⚠ No schools found with "JIPRA" in name or code');
      console.log('  Checking hardcoded ID 12004...');
      const hardcodedCheck = await query(`SELECT id, name FROM schools WHERE id = 12004`);
      if (hardcodedCheck.length > 0) {
        console.log(`  ✓ Found school at ID 12004: ${hardcodedCheck[0].name}`);
        jipraId = 12004;
      }
    }

    if (!jipraId) {
      console.warn('✗ Could not identify JIPRA school_id. Aborting.');
      return audit;
    }

    audit.jipraSchoolId = jipraId;
    console.log(`\n✓ JIPRA school_id = ${jipraId}`);

    // 2. Schema check - identify which staff tables exist and have soft_delete support
    console.log('\n[2] Schema audit - identifying staff tables...');
    const infoSchema = await query(`
      SELECT TABLE_NAME, GROUP_CONCAT(COLUMN_NAME) as columns
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? 
      AND (TABLE_NAME LIKE '%staff%' OR TABLE_NAME LIKE '%people%' OR TABLE_NAME LIKE '%user%' OR TABLE_NAME LIKE '%teacher%' OR TABLE_NAME LIKE '%employee%')
      GROUP BY TABLE_NAME
    `, [DB_CONFIG.database]);

    const staffTables = {};
    infoSchema.forEach(row => {
      const cols = row.columns.split(',');
      staffTables[row.TABLE_NAME] = {
        columns: cols,
        hasSoftDelete: cols.includes('deleted_at') || cols.includes('is_deleted') || cols.includes('deleted'),
      };
    });

    console.log('Staff-related tables found:');
    Object.entries(staffTables).forEach(([name, info]) => {
      console.log(`  - ${name} (soft_delete: ${info.hasSoftDelete ? 'YES' : 'NO'})`);
    });

    // 3. Count active staff per table
    console.log('\n[3] Active JIPRA staff count per table...');
    
    for (const [table, info] of Object.entries(staffTables)) {
      let countSql = `SELECT COUNT(*) as cnt FROM ${table} WHERE school_id = ?`;
      let softDeleteSql = null;

      if (info.hasSoftDelete) {
        countSql += ` AND (deleted_at IS NULL OR deleted = 0 OR is_deleted = 0)`;
        softDeleteSql = `SELECT COUNT(*) as cnt FROM ${table} WHERE school_id = ? AND (deleted_at IS NOT NULL OR deleted = 1 OR is_deleted = 1)`;
      }

      try {
        const [activeCount] = await query(countSql, [jipraId]);
        audit.staffOverview[table] = { active: activeCount.cnt, softDeleted: 0 };
        console.log(`  ${table}: ${activeCount.cnt} active`);

        if (softDeleteSql) {
          const [softCount] = await query(softDeleteSql, [jipraId]);
          audit.staffOverview[table].softDeleted = softCount.cnt;
          if (softCount.cnt > 0) {
            console.log(`    → ${softCount.cnt} soft-deleted`);
          }
        }
      } catch (err) {
        console.log(`  ⚠ ${table}: Error counting (table may be empty or schema mismatch)`);
      }
    }

    // 4. Query for hard-deleted staff via audit logs
    console.log('\n[4] Searching audit logs for deleted staff...');
    const auditLogs = await query(`
      SELECT entity_type, entity_id, action, changes_json, created_at, actor_user_id
      FROM audit_log
      WHERE school_id = ? AND action IN ('delete', 'delete_staff', 'remove_staff')
      ORDER BY created_at DESC
      LIMIT 100
    `, [jipraId]);

    console.log(`  Found ${auditLogs.length} deletion audit events`);
    audit.auditLogReferences = auditLogs;

    // 5. Query for orphaned allocations (staff_id references to non-existent staff)
    console.log('\n[5] Checking for orphaned allocations...');
    
    const allocationTables = [
      'subject_allocations',
      'class_allocations',
      'timetable_allocations',
      'report_card_initials',
      'attendance_records'
    ];

    for (const allocTable of allocationTables) {
      try {
        // Check if table exists and has staff_id
        const columnCheck = await query(`
          SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
          WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME IN ('staff_id', 'teacher_id')
        `, [DB_CONFIG.database, allocTable]);

        if (columnCheck.length > 0) {
          const staffCol = columnCheck[0].COLUMN_NAME;
          
          // Find orphaned references
          const orphaned = await query(`
            SELECT DISTINCT a.${staffCol}, a.* 
            FROM ${allocTable} a
            LEFT JOIN people p ON a.${staffCol} = p.id
            WHERE a.${staffCol} IS NOT NULL 
            AND p.id IS NULL
            AND a.school_id = ?
            LIMIT 50
          `, [jipraId]);

          if (orphaned.length > 0) {
            console.log(`  ⚠ ${allocTable}: ${orphaned.length} orphaned references`);
            audit.orphanedAllocations.push({
              table: allocTable,
              count: orphaned.length,
              samples: orphaned.slice(0, 5)
            });
          }
        }
      } catch (err) {
        // Table may not exist
      }
    }

    // 6. Query for soft-deleted staff with active allocations (inconsistency)
    console.log('\n[6] Finding soft-deleted staff with active allocations...');
    try {
      const inconsistent = await query(`
        SELECT DISTINCT p.id, p.full_name, p.email, sa.id as allocation_id, 'subject_allocation' as type
        FROM people p
        JOIN subject_allocations sa ON p.id = sa.staff_id
        WHERE p.school_id = ? AND p.deleted_at IS NOT NULL
        AND sa.school_id = ? AND sa.deleted_at IS NULL
        UNION
        SELECT DISTINCT p.id, p.full_name, p.email, ca.id as allocation_id, 'class_allocation' as type
        FROM people p
        JOIN class_allocations ca ON p.id = ca.staff_id
        WHERE p.school_id = ? AND p.deleted_at IS NOT NULL
        AND ca.school_id = ? AND ca.deleted_at IS NULL
      `, [jipraId, jipraId, jipraId, jipraId]);

      if (inconsistent.length > 0) {
        console.log(`  Found ${inconsistent.length} soft-deleted staff with active allocations`);
        audit.inconsistencies = inconsistent;
      }
    } catch (err) {
      console.log(`  ⚠ Could not check consistency (tables may be empty)`);
    }

    // 7. Build recovery plan summary
    console.log('\n[7] Building recovery plan...');
    
    const totalSoftDeleted = Object.values(audit.staffOverview).reduce((sum, t) => sum + (t.softDeleted || 0), 0);
    audit.recoveryPlan = {
      softDeletedStaffToRestore: totalSoftDeleted,
      orphanedAllocationsToRepair: audit.orphanedAllocations.length,
      auditEventsToAnalyze: auditLogs.length,
      consistencyIssues: audit.inconsistencies.length,
    };

    console.log('\n' + '='.repeat(70));
    console.log('PHASE 0 SUMMARY');
    console.log('='.repeat(70));
    console.log(`JIPRA School ID: ${jipraId}`);
    console.log(`Soft-deleted staff to potentially restore: ${totalSoftDeleted}`);
    console.log(`Orphaned allocations: ${audit.orphanedAllocations.length}`);
    console.log(`Audit log deletion events: ${auditLogs.length}`);
    console.log(`Consistency issues detected: ${audit.inconsistencies.length}`);

    // 8. Save audit report
    const reportPath = path.join(__dirname, 'JIPRA_STAFF_FORENSIC_PHASE0_REPORT.json');
    fs.writeFileSync(reportPath, JSON.stringify(audit, null, 2));
    console.log(`\n✓ Audit report saved to: ${reportPath}`);

    return audit;

  } catch (err) {
    console.error('✗ Audit error:', err);
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
    console.log('\nNext steps:');
    console.log('1. Review JIPRA_STAFF_FORENSIC_PHASE0_REPORT.json');
    console.log('2. Run PHASE 1: Duplicate Detection');
    console.log('3. Run PHASE 2: Staff Restoration');
    console.log('4. Run PHASE 3: Relationship Repair');
    console.log('5. Run PHASE 4: Consistency Validation');
    console.log('6. Run PHASE 5: JIPRA Verification');
    console.log('7. Commit and push changes\n');

  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

main();
