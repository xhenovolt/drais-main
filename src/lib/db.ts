import mysql from 'mysql2/promise';

let pool: mysql.Pool | null = null;
let activeDatabase: 'tidb' | 'mysql' = 'tidb';

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

// Attempt to use TiDB first, fall back to local MySQL if TiDB fails
async function getActiveConfig() {
  // If we already determined the active database, return its config
  if (activeDatabase === 'mysql') {
    return getLocalMySQLConfig();
  }

  // Try TiDB first
  const tidbConfig = getTiDBConfig();
  try {
    const testConn = await mysql.createConnection({
      host: tidbConfig.host,
      port: tidbConfig.port,
      user: tidbConfig.user,
      password: tidbConfig.password,
      database: tidbConfig.database,
    });
    await testConn.end();
    console.log('[Database] Connected to TiDB Cloud ✅');
    activeDatabase = 'tidb';
    return tidbConfig;
  } catch (error) {
    console.warn('[Database] TiDB connection failed, falling back to local MySQL', error);
    activeDatabase = 'mysql';
    return getLocalMySQLConfig();
  }
}

export function getPool() {
  if (pool) return pool;
  
  // Create pool with the determined active database
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
    // TiDB specific settings
    supportBigNumbers: true,
    bigNumberStrings: true,
    ...(activeDatabase === 'tidb' && { ssl: { rejectUnauthorized: false } }),
  });

  return pool;
}

export async function query(sql: string, params: unknown[] = []) {
  const p = getPool();
  const [rows] = await p.execute(sql, params);
  return rows;
}

export async function getConnection() {
  try {
    const config = await getActiveConfig();
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
    console.log(`[Database] Connected using ${activeDatabase === 'tidb' ? 'TiDB Cloud' : 'Local MySQL'}`);
    return conn;
  } catch (error) {
    console.error('[Database] Connection error:', error);
    throw new Error('Failed to connect to the database. Please check your database configuration.');
  }
}

export function getActiveDatabase() {
  return activeDatabase;
}

export { getTiDBConfig, getLocalMySQLConfig };

export async function withTransaction<T>(fn: (conn: mysql.PoolConnection) => Promise<T>): Promise<T> {
  const p = getPool();
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
