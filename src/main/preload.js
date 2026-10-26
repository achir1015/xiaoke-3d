// 介面可用的主程序功能（window.xk）
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (fn) => {
  const h = (_e, data) => fn(data);
  ipcRenderer.on(channel, h);
  return () => ipcRenderer.removeListener(channel, h);
};

contextBridge.exposeInMainWorld('xk', {
  desktop: true,
  info: () => ipcRenderer.invoke('app:info'),
  settings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseDir: () => ipcRenderer.invoke('dir:choose'),
  show: (file) => ipcRenderer.invoke('shell:show', file),
  external: (url) => ipcRenderer.invoke('shell:external', url),
  exportExpect: (opts) => ipcRenderer.invoke('export:expect', opts),
  exportWait: (id) => ipcRenderer.invoke('export:wait', id),
  exportCancel: (id) => ipcRenderer.invoke('export:cancel', id),
  exports: () => ipcRenderer.invoke('exports:list'),
  openFile: () => ipcRenderer.invoke('file:open'),
  textFonts: () => ipcRenderer.invoke('text:fonts'),
  textSvg: (opts) => ipcRenderer.invoke('text:svg', opts),
  bambuStatus: () => ipcRenderer.invoke('bambu:status'),
  bambuOpen: (file) => ipcRenderer.invoke('bambu:open', file),
  bambuDownload: () => ipcRenderer.invoke('bambu:download'),
  updateCheck: () => ipcRenderer.invoke('update:check'),
  updateInstall: () => ipcRenderer.invoke('update:install'),
  updatePage: () => ipcRenderer.invoke('update:page'),
  onUpdateProgress: on('update:progress'),
  onExportSaved: on('export:saved'),
  onBambuProgress: on('bambu:progress'),
});
