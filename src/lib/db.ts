import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let activeDatabase: 'tidb' | 'mysql' | null = null;
let initializationPromise: Promise<void> | null = null;

// Determine which database configuration to use
const getTiDBConfig = () => ({
  host: process.env.TIDB_HOST || 'gateway01.eu-central-1.prod.aws.tidbcloud.com',
  port: parseInt(process.env.TIDB_PORT || '4000', 10),
  user: process.env.TIDB_USER || '2qzYvPUSbNa3RNc.root',
  password: process.env.TIDB_PASSWORD || 'Gn4OSg1m8sSMSRMq',
  database: process.env.TIDB_DB || 'test',
  ssl: { rejectUnauthorized: false }, // Required for TiDB Cloud
});

const getLocalMySQLConfig = () => ({
  host: process.env.MYSQL_HOST || process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.MYSQL_PORT || process.env.DB_PORT || '3306', 10),
  user: process.env.MYSQL_USER || process.env.DB_USER || 'root',
  password: process.env.MYSQL_PASSWORD || process.env.DB_PASS || '',
  database: process.env.MYSQL_DB || process.env.DB_NAME || 'ibunbaz_drais',
});

// Initialize database connection - test TiDB first, fall back to MySQL
async function initializeDatabase() {
  if (activeDatabase !== null) {
    return; // Already initialized
  }

  console.log('[Database] Initializing database connection...');
  
  const databaseMode = process.env.DATABASE_MODE || 'auto';
  
  // If DATABASE_MODE is explicitly set to 'mysql', use MySQL directly
  if (databaseMode === 'mysql') {
    console.log('[Database] Using Local MySQL (DATABASE_MODE=mysql)...');
    const mysqlConfig = getLocalMySQLConfig();
    try {
      const testConn = await mysql.createConnection({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        connectTimeout: 5000,
      });
      await testConn.query('SELECT 1');
      await testConn.end();
      console.log('[Database] ✅ Connected to Local MySQL');
      activeDatabase = 'mysql';
      return;
    } catch (mysqlError) {
      console.error('[Database] ❌ Local MySQL connection failed:', mysqlError instanceof Error ? mysqlError.message : String(mysqlError));
      throw new Error('Failed to connect to Local MySQL');
    }
  }
  
  // If DATABASE_MODE is 'tidb', use TiDB directly
  if (databaseMode === 'tidb') {
    console.log('[Database] Using TiDB Cloud (DATABASE_MODE=tidb)...');
    const tidbConfig = getTiDBConfig();
    try {
      const testConn = await mysql.createConnection({
        host: tidbConfig.host,
        port: tidbConfig.port,
        user: tidbConfig.user,
        password: tidbConfig.password,
        database: tidbConfig.database,
        ssl: { rejectUnauthorized: false },
        connectTimeout: 5000,
      });
      await testConn.query('SELECT 1');
      await testConn.end();
      console.log('[Database] ✅ Connected to TiDB Cloud');
      activeDatabase = 'tidb';
      return;
    } catch (error) {
      console.error('[Database] ❌ TiDB Cloud connection failed:', error instanceof Error ? error.message : String(error));
      throw new Error('Failed to connect to TiDB Cloud');
    }
  }
  
  // DATABASE_MODE is 'auto' - try TiDB first, fall back to MySQL
  console.log('[Database] Auto-detecting database (attempting TiDB first)...');
  
  // Try TiDB first
  const tidbConfig = getTiDBConfig();
  try {
    console.log('[Database] Testing TiDB Cloud connection...');
    const testConn = await mysql.createConnection({
      host: tidbConfig.host,
      port: tidbConfig.port,
      user: tidbConfig.user,
      password: tidbConfig.password,
      database: tidbConfig.database,
      ssl: { rejectUnauthorized: false },
      connectTimeout: 5000,
    });
    await testConn.query('SELECT 1');
    await testConn.end();
    console.log('[Database] ✅ Using TiDB Cloud as primary database');
    activeDatabase = 'tidb';
  } catch (error) {
    console.warn('[Database] ⚠️  TiDB Cloud connection failed:', error instanceof Error ? error.message : String(error));
    console.log('[Database] Attempting fallback to Local MySQL...');
    
    // Fall back to local MySQL
    const mysqlConfig = getLocalMySQLConfig();
    try {
      const testConn = await mysql.createConnection({
        host: mysqlConfig.host,
        port: mysqlConfig.port,
        user: mysqlConfig.user,
        password: mysqlConfig.password,
        database: mysqlConfig.database,
        connectTimeout: 5000,
      });
      await testConn.query('SELECT 1');
      await testConn.end();
      console.log('[Database] ✅ Using Local MySQL as fallback database');
      activeDatabase = 'mysql';
    } catch (mysqlError) {
      console.error('[Database] ❌ Both databases failed:', mysqlError instanceof Error ? mysqlError.message : String(mysqlError));
      activeDatabase = 'tidb'; // Default to TiDB config even if both fail
      throw new Error('Failed to connect to both TiDB Cloud and Local MySQL');
    }
  }
}

// Ensure initialization is done before creating pool
async function ensureInitialized() {
  if (!initializationPromise) {
    initializationPromise = initializeDatabase();
  }
  await initializationPromise;
}

export async function getPool() {
  if (pool) return pool;
  
  await ensureInitialized();
  
  const config = activeDatabase === 'tidb' ? getTiDBConfig() : getLocalMySQLConfig();
  
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    timezone: 'Z',
    supportBigNumbers: true,
    bigNumberStrings: true,
    ...(activeDatabase === 'tidb' && { ssl: { rejectUnauthorized: false } }),
  });

  return pool;
}

export async function query(sql: string, params: unknown[] = []) {
  const p = await getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function getConnection() {
  try {
    await ensureInitialized();
    const config = activeDatabase === 'tidb' ? getTiDBConfig() : getLocalMySQLConfig();
    const conn = await mysql.createConnection({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      supportBigNumbers: true,
      bigNumberStrings: true,
      ...(activeDatabase === 'tidb' && { ssl: { rejectUnauthorized: false } }),
    });
    return conn;
  } catch (error) {
    console.error('[Database] Connection error:', error);
    throw new Error('Failed to connect to the database. Please check your database configuration.');
  }
}

export async function getActiveDatabase() {
  await ensureInitialized();
  return activeDatabase;
}

export { getTiDBConfig, getLocalMySQLConfig };

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const p = await getPool();
  const conn = await p.getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    await conn.rollback();
    throw e;
  } finally {
    conn.release();
  }
}
