#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

async function main(){
  dotenv.config({ path: process.env.DOTENV_CONFIG_PATH || '.env' });
  const { buildSnapshotPrintHtml } = await import('../src/lib/snapshots/build-print-html');
  const snaps = ['snapshots/210010.pretty.json','snapshots/210012.json','snapshots/150001.json'];
  for(const p of snaps){
    try{
      const snapshot = JSON.parse(fs.readFileSync(path.resolve(p),'utf8'));
      const res = await buildSnapshotPrintHtml({ snapshot, schoolId: Number(snapshot.meta.schoolId || 0), templateId: 'drce-emergency-secular' });
      console.log(p, 'ok:', res.ok, 'renderer:', res.renderer, 'bytes:', res.bytes || 0);
      if(res.warnings) console.log('warnings:', JSON.stringify(res.warnings));
    }catch(e){
      console.error('ERROR for', p, e && e.stack ? e.stack : e);
    }
  }
}

main().catch(e=>{ console.error(e); process.exit(1); });
