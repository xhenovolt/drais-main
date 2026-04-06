'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('relay', {
  start:          ()    => ipcRenderer.invoke('relay:start'),
  stop:           ()    => ipcRenderer.invoke('relay:stop'),
  getStatus:      ()    => ipcRenderer.invoke('relay:status'),
  getConfig:      ()    => ipcRenderer.invoke('config:get'),
  saveConfig:     (cfg) => ipcRenderer.invoke('config:save', cfg),
  getAutostart:   ()    => ipcRenderer.invoke('autostart:get'),
  setAutostart:   (v)   => ipcRenderer.invoke('autostart:set', v),
  openConfigDir:  ()    => ipcRenderer.invoke('open-config-dir'),

  onStatus:  (cb) => ipcRenderer.on('status',      (_, v)    => cb(v)),
  onLog:     (cb) => ipcRenderer.on('log-line',    (_, line) => cb(line)),
  onHistory: (cb) => ipcRenderer.once('log-history', (_, h)  => cb(h)),
});
