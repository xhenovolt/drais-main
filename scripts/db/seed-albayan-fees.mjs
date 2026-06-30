#!/usr/bin/env node
/**
 * Seed Albayan's (school_id 8002) fee structure THROUGH the rules engine
 * (fee_items + fee_eligibility_rules) — not hardcoded one-offs. Idempotent:
 * keyed on (school_id, fee_items.code); re-running updates items and replaces
 * their rules cleanly.
 *
 *   node --env-file=.env.local scripts/db/seed-albayan-fees.mjs            # online TiDB
 *   node --env-file=.env.local scripts/db/seed-albayan-fees.mjs --local    # local MySQL
 *
 * Class targeting uses explicit class_ids resolved BY NAME (Albayan classes
 * have no class_level). Fees attach to the NATIONAL-curriculum (secular) class
 * of each learner — theology/tahfiz-only enrollments are intentionally excluded
 * so a learner with both secular + theology enrollments is billed once.
 */
import mysql from 'mysql2/promise';
import { loadEnv, onlineConfig, localConfig } from './_shared.mjs';

loadEnv();
const S = 8002;
const useLocal = process.argv.includes('--local');

// Classify a class NAME into a fee band. Theology/tahfiz/Arabic → OTHER (no national fees).
function band(name) {
  const n = String(name || '').toLowerCase();
  if (/primary seven|\bp7\b/.test(n)) return 'P7';
  if (/primary six|\bp6\b/.test(n))   return 'P6';
  if (/primary five|\bp5\b/.test(n))  return 'P5';
  if (/primary four|\bp4\b/.test(n))  return 'P4';
  if (/primary three|\bp3\b/.test(n)) return 'P3';
  if (/primary two|\bp2\b/.test(n))   return 'P2';
  if (/primary one|\bp1\b/.test(n))   return 'P1';
  if (/baby class|middle class|top class|nursery/.test(n)) return 'NUR';
  if (/senior/.test(n)) return 'SEC';
  return 'OTHER';
}

// Fee catalogue → engine rows. `bands` selects classes; `newEntrant`/`gender`
// add conditions. channel: any|school_code|cash. clearance: optional|before_entry|partial_allowed|bursar_approval.
const NAT = ['NUR', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'SEC']; // all national-curriculum bands
const FEES = [
  // Tuition
  { code: 'TUITION_P67',    name: 'Tuition / School Fees (P6 & P7 candidates, boarding)', category: 'tuition',     amount: 700000, frequency: 'termly', mandatory: 1, channel: 'school_code', clearance: 'partial_allowed', bands: ['P6', 'P7'] },
  { code: 'TUITION_NUR_P5', name: 'Tuition / School Fees (Nursery–P5)',                    category: 'tuition',     amount: 300000, frequency: 'termly', mandatory: 1, channel: 'school_code', clearance: 'partial_allowed', bands: ['NUR', 'P1', 'P2', 'P3', 'P4', 'P5'] },
  // One-time / annual / termly
  { code: 'ADMISSION',      name: 'Admission Fee',          category: 'other',       amount: 30000, frequency: 'once',      mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT, newEntrant: 1 },
  { code: 'DEVELOPMENT',    name: 'Development Fee',        category: 'development', amount: 30000, frequency: 'annually',  mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'SCHOOL_BUS',     name: 'School Bus',             category: 'transport',   amount: 30000, frequency: 'annually',  mandatory: 0, optional: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'DAAWA',          name: 'Daawa Fee',             category: 'activity',    amount: 10000, frequency: 'termly',    mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'VISITATION',     name: 'Visitation Card',       category: 'other',       amount: 5000,  frequency: 'once',      mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'MEDICAL',        name: 'Medical Fee',           category: 'medical',     amount: 10000, frequency: 'termly',    mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'TEXTBOOKS',      name: 'School Text Books',     category: 'library',     amount: 30000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'COMPUTER',       name: 'Computer Fee (P3–P6)',  category: 'activity',    amount: 30000, frequency: 'termly',    mandatory: 1, channel: 'any', clearance: 'optional', bands: ['P3', 'P4', 'P5', 'P6'] },
  { code: 'YASSARNA',       name: 'Yassarnā (3 pieces)',   category: 'other',       amount: 10000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'QURAN',          name: "Qur'an",                category: 'other',       amount: 10000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'QURAN_SEATER',   name: "Qur'an Seater",         category: 'other',       amount: 10000, frequency: 'annually',  mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'REAM',           name: 'Ream',                  category: 'other',       amount: 25000, frequency: 'termly',    mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'CUPS_PLATES',    name: 'Cups and Plates',       category: 'feeding',     amount: 5000,  frequency: 'termly',    mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'SPORTS',         name: 'Sports Fee',            category: 'activity',    amount: 5000,  frequency: 'termly',    mandatory: 1, channel: 'any', clearance: 'optional', bands: NAT },
  { code: 'BOOK_COVERS',    name: 'Book Covers',           category: 'other',       amount: 10000, frequency: 'termly',    mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  // Uniform / requirements (bought at school, mandatory — Albayan accepts no other wear)
  { code: 'UNIFORM',        name: 'School Uniform Package (uniform + sweater + sports wear + labelling)', category: 'uniform', amount: 167000, frequency: 'once', mandatory: 1, channel: 'cash', clearance: 'before_entry', bands: NAT },
  { code: 'SOCKS',          name: 'Two Pairs of Socks',    category: 'uniform',     amount: 20000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT },
  { code: 'VEIL',           name: 'Veil (girls)',          category: 'uniform',     amount: 20000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT, gender: 'female' },
  { code: 'CAP',            name: 'Cap (boys)',            category: 'uniform',     amount: 20000, frequency: 'once',      mandatory: 1, channel: 'cash', clearance: 'optional', bands: NAT, gender: 'male' },
  // Assessment (termly)
  { code: 'ASSESS_P67',     name: 'Assessment Fee (P6 & P7)',  category: 'examination', amount: 40000, frequency: 'termly', mandatory: 1, channel: 'any', clearance: 'optional', bands: ['P6', 'P7'] },
  { code: 'ASSESS_P35',     name: 'Assessment Fee (P3–P5)',    category: 'examination', amount: 30000, frequency: 'termly', mandatory: 1, channel: 'any', clearance: 'optional', bands: ['P3', 'P4', 'P5'] },
  { code: 'ASSESS_P12',     name: 'Assessment Fee (P1 & P2)',  category: 'examination', amount: 20000, frequency: 'termly', mandatory: 1, channel: 'any', clearance: 'optional', bands: ['P1', 'P2'] },
  { code: 'ASSESS_NUR',     name: 'Assessment Fee (Nursery)',  category: 'examination', amount: 15000, frequency: 'termly', mandatory: 1, channel: 'any', clearance: 'optional', bands: ['NUR'] },
];

async function main() {
  const cfg = useLocal ? localConfig(true) : onlineConfig();
  cfg.database = useLocal ? (process.env.LOCAL_MYSQL_DATABASE || 'drais') : (process.env.TIDB_DB || 'drais');
  const conn = await mysql.createConnection(cfg);
  console.log(`[seed-fees] ${useLocal ? 'LOCAL' : 'ONLINE'} ${cfg.host}/${cfg.database} — school ${S}`);

  // Resolve band → class_ids by name.
  const [classes] = await conn.query('SELECT id, name FROM classes WHERE school_id = ? AND deleted_at IS NULL', [S]);
  const byBand = {};
  for (const c of classes) { const b = band(c.name); (byBand[b] ||= []).push(Number(c.id)); }
  console.log('[seed-fees] class bands:', Object.fromEntries(Object.entries(byBand).map(([k, v]) => [k, v.length])));

  let items = 0, rules = 0;
  for (const f of FEES) {
    // Upsert fee_item by (school_id, code).
    const [ex] = await conn.query('SELECT id FROM fee_items WHERE school_id = ? AND code = ? LIMIT 1', [S, f.code]);
    let itemId;
    if (ex.length) {
      itemId = ex[0].id;
      await conn.query(
        `UPDATE fee_items SET name=?, category=?, default_amount=?, currency='UGX', frequency=?, mandatory=?, optional=?, is_active=1, payment_channel=?, clearance=? WHERE id=? AND school_id=?`,
        [f.name, f.category, f.amount, f.frequency, f.mandatory ?? 1, f.optional ?? 0, f.channel, f.clearance, itemId, S],
      );
    } else {
      const [r] = await conn.query(
        `INSERT INTO fee_items (school_id, name, code, category, default_amount, currency, frequency, mandatory, optional, is_active, payment_channel, clearance)
         VALUES (?, ?, ?, ?, ?, 'UGX', ?, ?, ?, 1, ?, ?)`,
        [S, f.name, f.code, f.category, f.amount, f.frequency, f.mandatory ?? 1, f.optional ?? 0, f.channel, f.clearance],
      );
      itemId = r.insertId;
    }
    items++;

    // Replace rules for this item.
    await conn.query('DELETE FROM fee_eligibility_rules WHERE school_id = ? AND fee_item_id = ?', [S, itemId]);
    const classIds = (f.bands || []).flatMap((b) => byBand[b] || []);
    await conn.query(
      `INSERT INTO fee_eligibility_rules (school_id, fee_item_id, name, applies_to, class_ids, gender, is_new_entrant, amount, priority, is_active)
       VALUES (?, ?, ?, 'segment', ?, ?, ?, ?, 100, 1)`,
      [S, itemId, f.name, classIds.length ? JSON.stringify(classIds) : null, f.gender ?? null,
       f.newEntrant == null ? null : (f.newEntrant ? 1 : 0), f.amount],
    );
    rules++;
  }

  console.log(`\n✅ Seeded ${items} fee items + ${rules} rules for Albayan (${useLocal ? 'LOCAL' : 'ONLINE'}).`);
  await conn.end();
}

main().catch((e) => { console.error('[seed-fees] FAILED:', e.message); process.exit(1); });
