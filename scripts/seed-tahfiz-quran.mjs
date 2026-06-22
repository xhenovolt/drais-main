#!/usr/bin/env node
/**
 * Seed Qur'an reference data from the pinned authoritative Tanzil metadata
 * (docs/tahfiz/quran-data.tanzil.xml, CC-BY © Tanzil.info). Idempotent
 * (INSERT ... ON DUPLICATE KEY UPDATE). Derives hizb (60) from quarters (240),
 * and computes start_page for juz/hizb/quarter + start/end page + juz_start for
 * each surah. Run: node scripts/seed-tahfiz-quran.mjs
 */
import { createConnection } from 'mysql2/promise';
import { readFile } from 'node:fs/promises';

const env = await readFile('.env.local', 'utf8');
for (const l of env.split('\n')) { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }

const xml = await readFile('docs/tahfiz/quran-data.tanzil.xml', 'utf8');
const attrs = (tag) => [...xml.matchAll(new RegExp(`<${tag}\\s+([^/>]+)/?>`, 'g'))].map(mm => {
  const o = {}; for (const a of mm[1].matchAll(/(\w+)="([^"]*)"/g)) o[a[1]] = a[2]; return o;
});

const suras    = attrs('sura').filter(s => s.index);       // 114
const juzs     = attrs('juz').filter(j => j.index);        // 30
const quarters = attrs('quarter').filter(q => q.index);    // 240
const pages    = attrs('page').filter(p => p.index);       // 604
if (suras.length !== 114 || juzs.length !== 30 || quarters.length !== 240 || pages.length !== 604) {
  console.error(`Unexpected counts: suras=${suras.length} juz=${juzs.length} quarters=${quarters.length} pages=${pages.length}`); process.exit(1);
}

// pages sorted by index; find the page number containing (sura,aya)
const pageList = pages.map(p => ({ page: +p.index, sura: +p.sura, aya: +p.aya })).sort((a, b) => a.page - b.page);
const cmp = (s1, a1, s2, a2) => s1 !== s2 ? s1 - s2 : a1 - a2;
function pageFor(sura, aya) {
  let found = 1;
  for (const p of pageList) { if (cmp(p.sura, p.aya, sura, aya) <= 0) found = p.page; else break; }
  return found;
}
const juzList = juzs.map(j => ({ juz: +j.index, sura: +j.sura, aya: +j.aya })).sort((a, b) => a.juz - b.juz);
function juzFor(sura, aya) {
  let found = 1;
  for (const j of juzList) { if (cmp(j.sura, j.aya, sura, aya) <= 0) found = j.juz; else break; }
  return found;
}

const c = await createConnection({ host: process.env.TIDB_HOST, port: +(process.env.TIDB_PORT||4000), user: process.env.TIDB_USER, password: process.env.TIDB_PASSWORD, database: process.env.TIDB_DB||'drais', ssl: { rejectUnauthorized: false } });

// 1) surahs
const surahStartPage = {};
for (const s of suras) surahStartPage[+s.index] = pageFor(+s.index, 1);
for (const s of suras) {
  const n = +s.index;
  const startPage = surahStartPage[n];
  const endPage = n < 114 ? surahStartPage[n + 1] : 604;
  const rev = s.type === 'Medinan' ? 'Medinan' : 'Meccan';
  await c.query(
    `INSERT INTO tahfiz_quran_surahs (number,name_ar,name_translit,name_en,ayah_count,revelation_type,juz_start,start_page,end_page)
       VALUES (?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE name_ar=VALUES(name_ar), name_translit=VALUES(name_translit), name_en=VALUES(name_en),
       ayah_count=VALUES(ayah_count), revelation_type=VALUES(revelation_type), juz_start=VALUES(juz_start),
       start_page=VALUES(start_page), end_page=VALUES(end_page)`,
    [n, s.name, s.tname, s.ename, +s.ayas, rev, juzFor(n, 1), startPage, endPage],
  );
}

// 2) juz
for (const j of juzs) {
  await c.query(
    `INSERT INTO tahfiz_quran_juz (juz_number,start_surah,start_ayah,start_page) VALUES (?,?,?,?)
     ON DUPLICATE KEY UPDATE start_surah=VALUES(start_surah), start_ayah=VALUES(start_ayah), start_page=VALUES(start_page)`,
    [+j.index, +j.sura, +j.aya, pageFor(+j.sura, +j.aya)],
  );
}

// 3) quarters (240 rubʿ) + derive hizb (60)
const hizbStart = {}; // hizb -> {sura,aya}
for (const q of quarters) {
  const qn = +q.index;
  const hizb = Math.ceil(qn / 4);
  const juz  = Math.ceil(qn / 8);
  await c.query(
    `INSERT INTO tahfiz_quran_quarters (quarter_number,hizb_number,juz_number,start_surah,start_ayah,start_page) VALUES (?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE hizb_number=VALUES(hizb_number), juz_number=VALUES(juz_number), start_surah=VALUES(start_surah), start_ayah=VALUES(start_ayah), start_page=VALUES(start_page)`,
    [qn, hizb, juz, +q.sura, +q.aya, pageFor(+q.sura, +q.aya)],
  );
  if ((qn - 1) % 4 === 0) hizbStart[hizb] = { sura: +q.sura, aya: +q.aya };
}

// 4) hizb (60)
for (let h = 1; h <= 60; h++) {
  const st = hizbStart[h];
  await c.query(
    `INSERT INTO tahfiz_quran_hizb (hizb_number,juz_number,start_surah,start_ayah,start_page) VALUES (?,?,?,?,?)
     ON DUPLICATE KEY UPDATE juz_number=VALUES(juz_number), start_surah=VALUES(start_surah), start_ayah=VALUES(start_ayah), start_page=VALUES(start_page)`,
    [h, Math.ceil(h / 2), st.sura, st.aya, pageFor(st.sura, st.aya)],
  );
}

// 5) pages (604)
for (const p of pages) {
  await c.query(
    `INSERT INTO tahfiz_quran_pages (page_number,start_surah,start_ayah) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE start_surah=VALUES(start_surah), start_ayah=VALUES(start_ayah)`,
    [+p.index, +p.sura, +p.aya],
  );
}

// 6) register the Qur'an as a global book
await c.query(
  `INSERT INTO tahfiz_global_books (code,title_ar,title_en,structure_type,total_units,unit_label,source_note,version)
     VALUES ('quran','القرآن الكريم','The Noble Qur''an','quran',114,'surah','Tanzil.net metadata (CC-BY)','tanzil-1.0')
   ON DUPLICATE KEY UPDATE title_ar=VALUES(title_ar), title_en=VALUES(title_en), total_units=VALUES(total_units),
     unit_label=VALUES(unit_label), source_note=VALUES(source_note), version=VALUES(version), updated_at=NOW()`,
);

// verify
const counts = {};
for (const t of ['tahfiz_quran_surahs','tahfiz_quran_juz','tahfiz_quran_hizb','tahfiz_quran_quarters','tahfiz_quran_pages','tahfiz_global_books']) {
  const [r] = await c.query(`SELECT COUNT(*) n FROM ${t}`); counts[t] = r[0].n;
}
const [tot] = await c.query('SELECT SUM(ayah_count) s FROM tahfiz_quran_surahs');
const [spot] = await c.query("SELECT number,name_translit,ayah_count,start_page,end_page,juz_start FROM tahfiz_quran_surahs WHERE number IN (1,2,36,114) ORDER BY number");
console.log('counts:', JSON.stringify(counts));
console.log('total ayahs (expect 6236):', tot[0].s);
console.log('spot check:', JSON.stringify(spot));
await c.end();
console.log('Seed complete.');
