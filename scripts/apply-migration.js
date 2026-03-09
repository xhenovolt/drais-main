const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
    port: 4000,
    user: '2Trc8kJebpKLb1Z.root',
    password: 'QMNAOiP9J1rANv4Z',
    database: 'drais',
    ssl: { rejectUnauthorized: false },
    connectTimeout: 15000
  });

  const statements = [
    // 1. device_user_mappings
    `CREATE TABLE IF NOT EXISTS device_user_mappings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      device_id BIGINT NOT NULL,
      student_id BIGINT NOT NULL,
      device_user_id VARCHAR(100) DEFAULT NULL,
      sync_status ENUM('synced','pending','failed') DEFAULT 'pending',
      last_synced_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_dum_school (school_id),
      INDEX idx_dum_student (student_id),
      INDEX idx_dum_device (device_id),
      UNIQUE KEY uq_device_student (device_id, student_id)
    )`,

    // 2. tahfiz_records
    `CREATE TABLE IF NOT EXISTS tahfiz_records (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      student_id BIGINT NOT NULL,
      plan_id BIGINT NULL,
      portion_id BIGINT NULL,
      group_id BIGINT NULL,
      book_id BIGINT NULL,
      teacher_id BIGINT NULL,
      date DATE NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'tilawa',
      portion_text VARCHAR(255) NULL,
      rating VARCHAR(30) DEFAULT 'fair',
      score DECIMAL(5,2) NULL,
      notes TEXT NULL,
      status VARCHAR(20) DEFAULT 'completed',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tr_school (school_id),
      INDEX idx_tr_student (student_id),
      INDEX idx_tr_plan (plan_id),
      INDEX idx_tr_group (group_id),
      INDEX idx_tr_date (date)
    )`,

    // 3. tahfiz_group_members
    `CREATE TABLE IF NOT EXISTS tahfiz_group_members (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      group_id BIGINT NOT NULL,
      student_id BIGINT NOT NULL,
      joined_date DATE DEFAULT NULL,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tgm_group (group_id),
      INDEX idx_tgm_student (student_id),
      UNIQUE KEY uq_group_student (group_id, student_id)
    )`,

    // 4. tahfiz_portions
    `CREATE TABLE IF NOT EXISTS tahfiz_portions (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      plan_id BIGINT NOT NULL,
      student_id BIGINT NOT NULL,
      teacher_id BIGINT NULL,
      book_id BIGINT NULL,
      portion_text VARCHAR(255) NOT NULL,
      portion_unit VARCHAR(50) DEFAULT 'verse',
      date DATE NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'tilawa',
      rating VARCHAR(30) DEFAULT NULL,
      score DECIMAL(5,2) NULL,
      notes TEXT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_tp_plan (plan_id),
      INDEX idx_tp_student (student_id),
      INDEX idx_tp_date (date)
    )`,

    // 5. student_history
    `CREATE TABLE IF NOT EXISTS student_history (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      student_id BIGINT NOT NULL,
      academic_year_id BIGINT NULL,
      term_id BIGINT NULL,
      class_id BIGINT NULL,
      stream_id BIGINT NULL,
      action VARCHAR(50) NOT NULL,
      details TEXT NULL,
      performed_by BIGINT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sh_student (student_id),
      INDEX idx_sh_school (school_id)
    )`,

    // 6. settings
    `CREATE TABLE IF NOT EXISTS settings (
      id BIGINT AUTO_INCREMENT PRIMARY KEY,
      school_id BIGINT NOT NULL DEFAULT 1,
      setting_key VARCHAR(100) NOT NULL,
      setting_value TEXT NULL,
      setting_type VARCHAR(20) DEFAULT 'string',
      category VARCHAR(50) DEFAULT 'general',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_school_setting (school_id, setting_key)
    )`,

    // 7. Add status column to terms
    `ALTER TABLE terms ADD COLUMN status VARCHAR(20) DEFAULT 'active'`,

    // 8. Sync is_active to status
    `UPDATE terms SET status = CASE WHEN is_active = 1 THEN 'active' ELSE 'inactive' END`,

    // 9-17. Add columns to schools
    `ALTER TABLE schools ADD COLUMN motto VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN district VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN website VARCHAR(255) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN founded_year INT DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN country VARCHAR(100) DEFAULT 'Uganda'`,
    `ALTER TABLE schools ADD COLUMN region VARCHAR(100) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN principal_name VARCHAR(200) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN principal_phone VARCHAR(30) DEFAULT NULL`,
    `ALTER TABLE schools ADD COLUMN registration_number VARCHAR(100) DEFAULT NULL`,
  ];

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    try {
      await conn.query(stmt);
      const match = stmt.match(/(CREATE TABLE|ALTER TABLE|UPDATE|INSERT|SELECT)\s+(?:IF NOT EXISTS\s+)?(\w+)/i);
      console.log(`[${i+1}/${statements.length}] OK: ${match ? match[1] + ' ' + match[2] : 'done'}`);
    } catch(e) {
      if (e.message.includes('Duplicate column name') || e.message.includes('already exists')) {
        console.log(`[${i+1}/${statements.length}] SKIP: ${e.message.substring(0, 80)}`);
      } else {
        console.error(`[${i+1}/${statements.length}] ERR: ${e.message.substring(0, 120)}`);
      }
    }
  }

  // VERIFY
  console.log('\n=== VERIFICATION ===');
  const tables = ['device_user_mappings', 'tahfiz_records', 'tahfiz_group_members', 'tahfiz_portions', 'student_history', 'settings'];
  for (const t of tables) {
    try {
      await conn.query(`SELECT 1 FROM ${t} LIMIT 1`);
      console.log(`  ${t}: EXISTS`);
    } catch(e) {
      console.error(`  ${t}: MISSING`);
    }
  }

  try {
    const [r] = await conn.query('SELECT id, name, status FROM terms LIMIT 2');
    console.log('  terms.status:', r.map(x => x.status));
  } catch(e) {
    console.error('  terms.status: FAIL -', e.message.substring(0, 60));
  }

  try {
    const [r] = await conn.query('SELECT id, name, motto, district, website FROM schools LIMIT 1');
    console.log('  schools new cols:', JSON.stringify(r[0]));
  } catch(e) {
    console.error('  schools new cols: FAIL -', e.message.substring(0, 60));
  }

  await conn.end();
  console.log('\nMigration complete.');
}

main().catch(e => console.error('FATAL:', e.message));
