// Gives the page a direct save path: window.ldSave(filename, bytes) -> the full path written. The page falls back to an
// <a download> click when this is absent (the browser build). Sandboxed preloads may only require('electron').
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('ldSave', (filename, bytes) => ipcRenderer.invoke('ld-save', String(filename), bytes));
