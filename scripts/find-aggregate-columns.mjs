#!/usr/bin/env node
import dotenv from 'dotenv';
import { query } from '../src/lib/db';

dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });

async function main(){
  const names = ['division','total_score','aggregate','aggregates','division_name'];
  const rows = await query(`
    SELECT TABLE_NAME,COLUMN_NAME
    FROM information_schema.COLUMNS
    WHERE COLUMN_NAME IN (${names.map(n=>`'${n}'`).join(',')})
    AND TABLE_SCHEMA = DATABASE()
  `);
  console.log(rows);
}

main().catch(e=>{ console.error(e); process.exit(1); });
