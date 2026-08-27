/**
 * The only renderer-to-main surface is a one-way startup timing marker. It
 * carries no credentials, filesystem access, or command capability. Keeping
 * this in preload means production startup timings can be captured without
 * enabling nodeIntegration in the login renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('draisStartup', {
  mark: (stage, detail) => {
    if (typeof stage !== 'string') return;
    ipcRenderer.send('drais-startup-mark', stage.slice(0, 80), detail && typeof detail === 'object' ? detail : undefined);
  },
});
