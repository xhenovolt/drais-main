#!/usr/bin/env node

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

async function setup() {
  const conn = await mysql.createConnection({
    host: process.env.TIDB_HOST,
    user: process.env.TIDB_USER,
    password: process.env.TIDB_PASSWORD,
    database: process.env.TIDB_DB,
    ssl: {}
  });

  console.log('Setting up admin credentials for Northgate School...\n');

  // Get school
  const [schools] = await conn.execute(
    "SELECT id FROM schools WHERE id = 12002"
  );

  if (schools.length === 0) {
    console.log('❌ School not found');
    process.exit(1);
  }

  const schoolId = schools[0].id;

  // Use bcrypt hash for "northgateschool"
  const bcryptHash = '$2a$10$NkIB/RL8tYLXx5bLPn6zIuR7EHvMQvAVBPqyqVvzVGcVBkKGl4SZy';

  // Check if user exists
  const [existingUsers] = await conn.execute(
    "SELECT id FROM users WHERE school_id = ? AND email IN ('info@northgateschool.ug', 'admin@northgateschool.ug')",
    [schoolId]
  );

  if (existingUsers.length > 0) {
    console.log('✅ Admin user already exists for Northgate School');
    console.log(`   Email: info@northgateschool.ug`);
    console.log(`   Password: northgateschool`);
  } else {
    // Create admin user
    await conn.execute(
      `INSERT INTO users (school_id, first_name, last_name, email, password_hash, role, status, is_active, is_verified) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [schoolId, 'Northgate', 'Admin', 'info@northgateschool.ug', bcryptHash, 'admin', 'active', 1, 1]
    );
    
    console.log('✅ Admin user created for Northgate School');
    console.log(`   Email: info@northgateschool.ug`);
    console.log(`   Password: northgateschool`);
  }

  await conn.end();
  console.log('\n✓ Setup complete');
}

setup().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});
