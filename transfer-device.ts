import { query } from './src/lib/db';
import { acquireDevice, releaseDevice, TransferStateError } from './src/lib/devices/transfer-service';

const sn = 'GED7254601154';
const targetSchool = 12011;
const actor = {
  userId: 1,
  schoolId: 12011,
  ip: '127.0.0.1',
  userAgent: 'transfer-script',
  fromSuperAdmin: true,
};

async function run() {
  const dev = await query('SELECT sn, school_id, status FROM devices WHERE sn = ? LIMIT 1', [sn]);
  console.log('before', JSON.stringify(dev, null, 2));
  if (!dev[0]) {
    throw new Error('Device not found');
  }

  if (dev[0].status !== 'released') {
    console.log('releasing device first');
    try {
      const impact = await releaseDevice(sn, actor, 'Auto release to transfer back to JIPRA');
      console.log('released impact', JSON.stringify(impact, null, 2));
    } catch (err) {
      if (err instanceof TransferStateError) {
        console.log('release state error', err.message);
      } else {
        throw err;
      }
    }
  }

  const acquired = await acquireDevice(sn, targetSchool, actor, 'Auto acquire back to JIPRA');
  console.log('acquired', JSON.stringify(acquired, null, 2));
  const after = await query('SELECT sn, school_id, status FROM devices WHERE sn = ? LIMIT 1', [sn]);
  console.log('after', JSON.stringify(after, null, 2));
}

run().catch((err) => {
  console.error('ERROR', err);
  process.exit(1);
});
