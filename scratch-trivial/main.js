require('fs').writeFileSync('C:\Users\ashic\AppData\Local\Temp\trivial-test.log', 'HELLO\n');
const { app } = require('electron');
app.whenReady().then(() => { require('fs').appendFileSync('C:\Users\ashic\AppData\Local\Temp\trivial-test.log', 'READY\n'); app.exit(0); });
