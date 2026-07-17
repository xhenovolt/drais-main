#!/usr/bin/env node
/**
 * JIPRA Emergency Attendance Recovery — Phase 0 diagnostic
 * Connects directly to the K40 Pro over local TCP and reports device
 * identity/status BEFORE any data is pulled or written.
 */
const ZKLib = require('node-zklib');

const IP = '192.168.1.197';
const PORT = 4370;

(async () => {
  const zk = new ZKLib(IP, PORT, 10000, 5200);
  const report = { ip: IP, port: PORT, reachableTcp: false };
  try {
    await zk.createSocket();
    report.reachableTcp = true;

    try { report.info = await zk.getInfo(); } catch (e) { report.infoError = e.message; }
    try { report.serialNumber = await zk.getSerialNumber(); } catch (e) { report.serialNumberError = e.message; }
    try { report.firmware = await zk.getFirmware(); } catch (e) { report.firmwareError = e.message; }
    try { report.platform = await zk.getPlatform(); } catch (e) { report.platformError = e.message; }
    try { report.deviceName = await zk.getDeviceName(); } catch (e) { report.deviceNameError = e.message; }
    try {
      const t = await zk.getTime();
      report.deviceTime = t;
    } catch (e) { report.deviceTimeError = e.message; }
    try {
      const users = await zk.getUsers();
      report.userCount = (users.data || []).length;
    } catch (e) { report.userCountError = e.message; }

    console.log(JSON.stringify(report, null, 2));
  } catch (err) {
    report.error = err.message || String(err);
    console.log(JSON.stringify(report, null, 2));
  } finally {
    try { await zk.disconnect(); } catch {}
  }
})();
