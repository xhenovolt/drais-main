#!/usr/bin/env node
/**
 * Diagnostic: write user uid=21 with PIN as binary uint32LE(21),
 * fire CMD_STARTENROLL, and print what getUsers() returns after.
 *
 * Run:  node scripts/test-enroll-binary-pin.js
 * Then watch logs for the ATTLOG punch — USERID should be "21" not "\u0015"
 */

'use strict';

const ZKLib = require('node-zklib');
const { COMMANDS } = require('node-zklib/constants');

const DEVICE_IP   = '192.168.1.197';
const DEVICE_PORT = 4370;
const SLOT        = 21;
const FINGER      = 0;

async function main() {
  const zk = new ZKLib(DEVICE_IP, DEVICE_PORT, 8000, 5200);

  console.log(`Connecting to ${DEVICE_IP}:${DEVICE_PORT} …`);
  await zk.createSocket();
  console.log('Connected.');

  // ── Read current users BEFORE write ───────────────────────────────────────
  await zk.zklibTcp.enableDevice();
  const before = await zk.getUsers();
  const users = (before?.data || []).map(u => ({
    uid:    parseInt(String(u.uid), 10),
    name:   String(u.name || '').trim(),
    userId: u.userId,           // raw value — may be string or binary
  }));

  const existing = users.find(u => u.uid === SLOT);
  console.log(`\nSlot ${SLOT} BEFORE:`, existing ?? '(empty)');
  console.log('All users:', users.map(u => `uid=${u.uid} name="${u.name}" userId=${JSON.stringify(u.userId)}`));

  // ── Build 72-byte user record with PIN as binary uint32LE ─────────────────
  // Layout (ZK 72-byte):
  //   0-1   uid         uint16LE
  //   2     role        uint8          (0 = normal user)
  //   3-10  password    ASCII 8 bytes  (zeroed)
  //   11-34 name        ASCII 24 bytes
  //   35-38 cardno      uint32LE       (0)
  //   39-47 unknown     zeroed
  //   48-51 userId/PIN  uint32LE  ← write integer here, NOT ascii string
  //   52-71 zeroed
  const name = 'TEST SLOT21';
  const userBuf = Buffer.alloc(72, 0);

  userBuf.writeUInt16LE(SLOT, 0);          // uid
  userBuf.writeUInt8(0, 2);               // role = normal
  Buffer.from(name, 'ascii').copy(userBuf, 11, 0, 23); // name
  userBuf.writeUInt32LE(SLOT, 48);        // PIN as binary uint32LE ← THE FIX

  console.log(`\nWriting user: uid=${SLOT} name="${name}" PIN(uint32LE)=${SLOT}`);
  console.log('Buffer hex (bytes 45-55):', userBuf.slice(45, 56).toString('hex'));

  await zk.zklibTcp.disableDevice();

  // Write user record
  await zk.zklibTcp.executeCmd(COMMANDS.CMD_USER_WRQ, userBuf);
  console.log('CMD_USER_WRQ sent.');

  // Fire enroll command for this slot
  const enrollPayload = Buffer.alloc(3);
  enrollPayload.writeUInt16LE(SLOT, 0);
  enrollPayload.writeUInt8(FINGER, 2);
  await zk.zklibTcp.executeCmd(COMMANDS.CMD_STARTENROLL, enrollPayload);
  console.log(`CMD_STARTENROLL sent for slot=${SLOT} finger=${FINGER}`);

  await zk.zklibTcp.enableDevice();

  // ── Read users AFTER write ─────────────────────────────────────────────────
  const after = await zk.getUsers();
  const usersAfter = (after?.data || []).map(u => ({
    uid:    parseInt(String(u.uid), 10),
    name:   String(u.name || '').trim(),
    userId: u.userId,
  }));
  const written = usersAfter.find(u => u.uid === SLOT);
  console.log(`\nSlot ${SLOT} AFTER write:`);
  console.log('  raw userId field:', JSON.stringify(written?.userId));
  console.log('  full record:', written);

  console.log('\n✓ Done. Scan a finger on the K40 now.');
  console.log('  Expected ATTLOG USERID = "21"  (not "\\u0015" or binary garbage)');
  console.log('  Watch Vercel logs for PUNCH_SAVED event to confirm.\n');

  await zk.disconnect();
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
