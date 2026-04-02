#!/usr/bin/env node
/**
 * Heartbeat Simulation Test
 * ─────────────────────────
 * Simulates a ZKTeco device heartbeat against the live server
 * to verify that DATA UPDATE USERINFO commands are correctly
 * queued and delivered.
 *
 * Usage: node scripts/test-sync-heartbeat.mjs
 */

const BASE = process.env.BASE_URL || 'https://sims.drais.pro';
const DEVICE_SN = process.env.DEVICE_SN || 'GED7254601154';

async function main() {
  console.log(`\n🔌 Heartbeat Simulation Test`);
  console.log(`   Server:  ${BASE}`);
  console.log(`   Device:  ${DEVICE_SN}\n`);

  // Step 1: Send heartbeat (GET /iclock/cdata?SN=...)
  console.log('─── Step 1: Sending heartbeat GET ───');
  const heartbeatUrl = `${BASE}/iclock/cdata?SN=${DEVICE_SN}&options=all&pushver=2.4.1&language=83`;
  console.log(`   URL: ${heartbeatUrl}`);

  const response = await fetch(heartbeatUrl, {
    headers: {
      'User-Agent': 'ZKTeco/3.0 (Linux; K40-Test-Agent)',
    },
  });

  const body = await response.text();
  console.log(`   Status:  ${response.status}`);
  console.log(`   Body:    ${body.substring(0, 200)}`);
  console.log(`   Content: ${response.headers.get('content-type')}`);

  if (body === 'OK') {
    console.log('\n✅ No pending commands — device is up to date.');
    console.log('   (If you just ran sync-identities, commands may have already been delivered.)');
    console.log('   Tip: Queue commands first, then re-run this test.');
  } else if (body.startsWith('C:')) {
    const parts = body.match(/^C:(\d+):(.+)$/s);
    if (parts) {
      const commandId = parts[1];
      const command = parts[2];
      console.log(`\n✅ Command delivered!`);
      console.log(`   Command ID:  ${commandId}`);
      console.log(`   Command:     ${command}`);

      // Verify it's a DATA UPDATE USERINFO command
      if (command.includes('DATA UPDATE USERINFO') && command.includes('PIN=')) {
        console.log(`   Type:        DATA UPDATE USERINFO ✅`);
        const pinMatch = command.match(/PIN=(\d+)/);
        const nameMatch = command.match(/Name=([^\t]+)/);
        if (pinMatch) console.log(`   PIN:         ${pinMatch[1]}`);
        if (nameMatch) console.log(`   Name:        ${nameMatch[1]}`);
      } else {
        console.log(`   Type:        Other command`);
      }
    }
  } else {
    console.log(`\n⚠️  Unexpected response: ${body}`);
  }

  // Step 2: Send additional heartbeats to drain more commands
  console.log('\n─── Step 2: Sending 3 more heartbeats to check queue depth ───');
  let deliveredCount = body.startsWith('C:') ? 1 : 0;
  for (let i = 0; i < 3; i++) {
    const r = await fetch(heartbeatUrl, {
      headers: { 'User-Agent': 'ZKTeco/3.0 (K40-Test-Agent)' },
    });
    const b = await r.text();
    if (b.startsWith('C:')) {
      deliveredCount++;
      const pin = b.match(/PIN=(\d+)/)?.[1] || '?';
      const name = b.match(/Name=([^\t]+)/)?.[1] || '?';
      console.log(`   Heartbeat ${i + 1}: PIN=${pin} Name=${name}`);
    } else {
      console.log(`   Heartbeat ${i + 1}: ${b} (queue empty)`);
      break;
    }
  }

  console.log(`\n📊 Summary: ${deliveredCount} command(s) delivered in this test run.`);
  console.log('   Each real heartbeat from the device will pick up 1 command at a time.');
  console.log('   With 60s heartbeat interval, 500 users takes ~8.3 hours.\n');
}

main().catch(err => {
  console.error('❌ Test failed:', err.message);
  process.exit(1);
});
