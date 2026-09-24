const fs = require('fs');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const path = require('path');
const env = dotenv.parse(fs.readFileSync(path.join('c:/xhenvolt/drais-main', '.env.local'), 'utf8'));
(async () => {
  const conn = await mysql.createConnection({
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DB,
    charset: 'utf8mb4',
  });

  console.log('SCHOOLS:');
  const [schools] = await conn.execute('SELECT id, name, code, created_at FROM schools WHERE LOWER(name) LIKE ? OR LOWER(code) LIKE ? ORDER BY id LIMIT 50', ['%nakifuma%', '%nakifuma%']);
  console.log(JSON.stringify(schools, null, 2));

  console.log('\nVALID TABLES:');
  const [tables] = await conn.execute("SHOW TABLES LIKE '%school%' OR SHOW TABLES LIKE '%student%' OR SHOW TABLES LIKE '%class%' OR SHOW TABLES LIKE '%contact%'" );
  console.log(JSON.stringify(tables, null, 2));

  await conn.end();
})();
