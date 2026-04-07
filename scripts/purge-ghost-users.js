#!/usr/bin/env node
/**
 * Delete ghost/orphan users from the K40 device.
 *
 * "Ghosts" = device users with:
 *   - empty name, AND/OR
 *   - userId that is a non-printable binary byte (< 0x20 or > 0x7e)
 *
 * Run:  node scripts/purge-ghost-users.js
 *       node scripts/purge-ghost-users.js --dry-run   ← don't actually delete
 */

'use strict';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

const DEVICE_IP   = '192.168.1.197';
const DEVICE_PORT = 4370;
const DRY_RUN     = process.argv.includes('--dry-run');

function isGhostUserId(userId) {
  if (!userId || userId.length === 0) return true;
  // If ANY character is a non-printable control char → binary integer was written
  for (let i = 0; i < userId.length; i++) {
    const code = userId.charCodeAt(i);
    if (code < 0x20 || code > 0x7e) return true;
  }
  return false;
}

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
  }));

  console.log(`Total users on device: ${users.length}`);

  const ghosts = users.filter(u =>
    isGhostUserId(u.userId) || u.name === ''
  );
  const healthy = users.filter(u =>
    !isGhostUserId(u.userId) && u.name !== ''
  );

  console.log('\n✓ Healthy users (will NOT touch):');
  healthy.forEach(u =>
    console.log(`  uid=${u.uid}  userId="${u.userId}"  name="${u.name}"`)
  );

  console.log('\n✗ Ghost/orphan users to delete:');
  if (ghosts.length === 0) {
    console.log('  (none — device is clean)');
  } else {
    ghosts.forEach(u =>
      console.log(`  uid=${u.uid}  userId=${JSON.stringify(u.userId)}  name="${u.name}"`)
    );
  }

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No changes made. Re-run without --dry-run to delete.');
    await zk.disconnect();
    return;
  }

  if (ghosts.length === 0) {
    await zk.disconnect();
    return;
  }

  console.log(`\nDeleting ${ghosts.length} ghost(s)…`);
  await zk.zklibTcp.disableDevice();

  for (const ghost of ghosts) {
    // CMD_DELETE_USER payload: 2-byte uid LE
    const payload = Buffer.alloc(2);
    payload.writeUInt16LE(ghost.uid, 0);
    try {
      await zk.zklibTcp.executeCmd(COMMANDS.CMD_DELETE_USER, payload);
      console.log(`  Deleted uid=${ghost.uid} userId=${JSON.stringify(ghost.userId)} name="${ghost.name}"`);
    } catch (err) {
      console.error(`  ERROR deleting uid=${ghost.uid}:`, err.message);
    }
  }

  await zk.zklibTcp.enableDevice();

  // Verify
  const after = await zk.getUsers();
  const remaining = (after?.data || []).map(u => ({
    uid: parseInt(String(u.uid), 10),
    name: String(u.name || '').trim(),
    userId: u.userId ?? '',
  }));

  console.log(`\nDevice now has ${remaining.length} user(s):`);
  remaining.forEach(u =>
    console.log(`  uid=${u.uid}  userId="${u.userId}"  name="${u.name}"`)
  );

  await zk.disconnect();
  console.log('\nDone.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
