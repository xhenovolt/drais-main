/**
 * Renderer-to-main surface: a one-way startup timing marker, and a folder picker for
 * Settings → Media that returns a chosen directory path (no file access). The marker
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

contextBridge.exposeInMainWorld('draisDesktop', {
  pickFolder: () => ipcRenderer.invoke('drais-pick-folder'),
});
