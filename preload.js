/* Narrow, explicit bridge between the sandboxed page and the main process. */
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const EVENTS = new Set(['clock:resync', 'clock:redraw', 'clock:set-paused', 'settings:changed']);

contextBridge.exposeInMainWorld('sketchClockHost', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:save', patch),
  showMenu: () => ipcRenderer.send('menu:show'),
  on: (channel, callback) => {
    if (!EVENTS.has(channel)) return;
    ipcRenderer.on(channel, (_event, payload) => callback(payload));
  },
});
