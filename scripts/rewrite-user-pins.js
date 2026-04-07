#!/usr/bin/env node
/**
 * Re-write ALL existing device users so their PIN (bytes 48-51) is stored
 * as binary uint32LE instead of ASCII text.
 *
 * Existing users have PIN = "1", "14", "21" etc. as ASCII — the device
 * internally reads this as little-endian int so ATTLOG comes back as binary
 * garbage unless we rewrite them.
 *
 * Run:  node scripts/rewrite-user-pins.js --dry-run
 *       node scripts/rewrite-user-pins.js
 */

'use strict';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

const DEVICE_IP   = '192.168.1.197';
const DEVICE_PORT = 4370;
const DRY_RUN     = process.argv.includes('--dry-run');

async function main() {
  console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}Connecting to ${DEVICE_IP}:${DEVICE_PORT} …`);
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 8000, 5200);
  await zk.createSocket();
  console.log('Connected.\n');

  await zk.zklibTcp.enableDevice();
  const result = await zk.getUsers();
  const users = (result?.data || []).map(u => ({
    uid:    parseInt(String(u.uid), 10),
    name:   String(u.name || '').trim(),
    userId: u.userId ?? '',
  })).filter(u => !isNaN(u.uid) && u.uid >= 1);

  console.log(`Users on device (${users.length}):`);
  users.forEach(u => console.log(`  uid=${u.uid}  userId=${JSON.stringify(u.userId)}  name="${u.name}"`));
  console.log('');

  if (DRY_RUN) {
    console.log('[DRY RUN] Would rewrite all users with PIN = writeUInt32LE(uid, 48)');
    users.forEach(u =>
      console.log(`  uid=${u.uid} → PIN bytes 48-51 = ${u.uid.toString(16).padStart(8,'0')} (LE)`)
    );
    await zk.disconnect();
    return;
  }

  console.log('Re-writing users with correct binary PIN…');
  await zk.zklibTcp.disableDevice();

  for (const u of users) {
    const name = u.name.replace(/[^\x20-\x7E]/g, '').slice(0, 23).trim() || `U${u.uid}`;
    const buf = Buffer.alloc(72, 0);
    buf.writeUInt16LE(u.uid, 0);            // uid
    buf.writeUInt8(0, 2);                   // role
    Buffer.from(name, 'ascii').copy(buf, 11, 0, 23); // name
    buf.writeUInt32LE(u.uid, 48);           // PIN as binary uint32LE ← correct

    try {
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, buf);
      console.log(`  ✓ uid=${u.uid}  name="${name}"  PIN(uint32LE)=${u.uid}`);
    } catch (err) {
      console.error(`  ✗ uid=${u.uid}  ERROR: ${err.message}`);
    }
  }

  await zk.zklibTcp.enableDevice();

  // Verify what device now reports
  const after = await zk.getUsers();
  const verified = (after?.data || []).map(u => ({
    uid:    parseInt(String(u.uid), 10),
    name:   String(u.name || '').trim(),
    userId: u.userId ?? '',
  }));
  console.log(`\nVerification — device now reports:`);
  verified.forEach(u =>
    console.log(`  uid=${u.uid}  userId=${JSON.stringify(u.userId)}  name="${u.name}"`)
  );

  await zk.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
