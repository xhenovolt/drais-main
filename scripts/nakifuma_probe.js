const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const mysql = require('mysql2/promise');
const env = dotenv.parse(fs.readFileSync(path.join('c:/xhenvolt/drais-main', '.env.local'), 'utf8'));

(async () => {
  const conn = await mysql.createConnection({
    host: env.TIDB_HOST,
    port: Number(env.TIDB_PORT),
    user: env.TIDB_USER,
    password: env.TIDB_PASSWORD,
    database: env.TIDB_DB,
    charset: 'utf8mb4',
    ssl: { rejectUnauthorized: false },
    multipleStatements: false,
  });

  const [schoolCols] = await conn.execute('SHOW COLUMNS FROM schools');
  console.log('SCHOOLS COLUMNS:');
  console.log(JSON.stringify(schoolCols, null, 2));

  const [schools] = await conn.execute('SELECT * FROM schools ORDER BY id LIMIT 50');
  console.log('\nSchools rows:');
  console.log(JSON.stringify(schools, null, 2));

  const [studentRows] = await conn.execute('SELECT * FROM students ORDER BY id LIMIT 20');
  console.log('\nSample student rows:');
  console.log(JSON.stringify(studentRows, null, 2));

  const [tables] = await conn.execute('SHOW TABLES');
  const names = tables.map(r => Object.values(r)[0]);
  console.log('\nKey tables present:', names.filter(n => /(student|class|contact|school|person|enroll)/i.test(n)).slice(0, 80));

  const [classes] = await conn.execute('SELECT id, name, code, class_level, level FROM classes WHERE school_id = ? AND deleted_at IS NULL ORDER BY id', [12020]);
  console.log('\nNakifuma classes:');
  console.log(JSON.stringify(classes, null, 2));

  const [fields] = await conn.execute('SELECT id, code, label, data_type, is_active FROM custom_fields WHERE school_id = ? AND entity_type = \'student\' ORDER BY id', [12020]);
  console.log('\nNakifuma student custom fields:');
  console.log(JSON.stringify(fields, null, 2));

  await conn.end();
})();
