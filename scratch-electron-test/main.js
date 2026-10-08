const fs = require('fs');
const LOG = 'C:\Users\ashic\AppData\Local\Temp\electron-v12-test2.log';
const out = (m) => fs.appendFileSync(LOG, m + '\n');
const { app, crashReporter } = require('electron');
crashReporter.start({ uploadToServer: false, compress: false });
process.on('exit', (code) => out('PROCESS EXIT code=' + code));
app.whenReady().then(() => {
  out('electron ready, napi=' + process.versions.napi + ' electron=' + process.versions.electron);
  try {
    const Database = require('better-sqlite3');
    out('require OK');
    const db = new Database(':memory:');
    out('Database instance OK');
    db.exec('CREATE TABLE t (a INTEGER)');
    db.prepare('INSERT INTO t VALUES (?)').run(42);
    const r = db.prepare('SELECT * FROM t').get();
    out('write/read OK: ' + JSON.stringify(r));
    db.close();
    out('ALL GOOD - no crash');
  } catch (e) {
    out('CAUGHT ERROR: ' + (e && e.stack || e));
  }
  app.exit(0);
});
