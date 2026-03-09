import mysql from 'mysql2/promise';

const getTiDBConfig = () => ({
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER || '2Trc8kJebpKLb1Z.root',
  password: process.env.TIDB_PASSWORD || 'QMNAOiP9J1rANv4Z',
  database: process.env.TIDB_DB || 'drais',
  ssl: { rejectUnauthorized: false }, // Required for TiDB Cloud
});

async function createTestUser() {
  const config = getTiDBConfig();
  const connection = await mysql.createConnection({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔍 Checking if test user already exists...');
    
    // Check if user exists
    const [existingUser] = await connection.execute(
      'SELECT id, email FROM users WHERE email = ?',
      ['test@drais.local']
    );

    if (existingUser && existingUser.length > 0) {
      console.log('⚠️  Test user already exists:', existingUser[0]);
      return;
    }

    console.log('✅ Creating test user...');

    // Insert test user
    const passwordHash = '$2b$12$lV2G5KfJwrhKk.l66quOGu3HkevmB8xALcRyxnd41ouAmT7X8V14m';
    const [result] = await connection.execute(
      `INSERT INTO users (school_id, first_name, last_name, email, password_hash, is_active, is_verified) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        1,                                                  // school_id
        'Test',                                             // first_name
        'User',                                             // last_name
        'test@drais.local',                                 // email
        passwordHash,                                       // password_hash
        true,                                               // is_active
        true                                                // is_verified
      ]
    );

    console.log('✅ Test user created successfully!');
    console.log('\n📋 Test User Credentials:');
    console.log('   Email: test@drais.local');
    console.log('   Password: test@123');
    console.log('   User ID:', result.insertId);
    console.log('\n🧪 Next steps:');
    console.log('   1. Go to http://localhost:3000/login');
    console.log('   2. Enter test@drais.local and test@123');
    console.log('   3. You should be logged in and redirected to /dashboard');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await connection.end();
  }
}

createTestUser();
