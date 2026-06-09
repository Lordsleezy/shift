const { contextBridge, ipcRenderer } = require("electron");



contextBridge.exposeInMainWorld("shiftAPI", {

  getDeviceReport: () => ipcRenderer.invoke("device:get-report"),

  extractProductKey: () => ipcRenderer.invoke("key:extract"),

  saveProductKey: (key) => ipcRenderer.invoke("key:save", key),

  getPartitionLayout: () => ipcRenderer.invoke("partition:get-layout"),

  applyPartition: (linuxBytes) => ipcRenderer.invoke("partition:apply", linuxBytes),

  startInstall: (opts) => ipcRenderer.invoke("install:start", opts),

  cancelInstall: () => ipcRenderer.invoke("install:cancel"),

  rebootToInstall: () => ipcRenderer.invoke("install:reboot"),

  validateRevertManifest: () => ipcRenderer.invoke("revert:validate"),

  executeRevert: () => ipcRenderer.invoke("revert:execute"),

  rebootAfterRevert: () => ipcRenderer.invoke("revert:reboot"),

  onRevertProgress: (callback) => {

    const listener = (_event, data) => callback(data);

    ipcRenderer.on("revert:progress", listener);

    return () => ipcRenderer.removeListener("revert:progress", listener);

  },

  onInstallProgress: (callback) => {

    const listener = (_event, data) => callback(data);

    ipcRenderer.on("install:progress", listener);

    return () => ipcRenderer.removeListener("install:progress", listener);

  },

  getIsoStatus: (distroId) => ipcRenderer.invoke("iso:status", { distroId }),

  openDistroSeaDemo: (distroId) => ipcRenderer.invoke("demo:open", { distroId }),

  downloadIso: (distroId) => ipcRenderer.invoke("iso:download", { distroId }),

  cancelIsoDownload: () => ipcRenderer.invoke("iso:cancel"),

  onIsoProgress: (callback) => {

    const listener = (_event, data) => callback(data);

    ipcRenderer.on("iso:progress", listener);

    return () => ipcRenderer.removeListener("iso:progress", listener);

  },

  onUpdateReady: (callback) => {

    const listener = (_event, data) => callback(data);

    ipcRenderer.on("update:ready", listener);

    return () => ipcRenderer.removeListener("update:ready", listener);

  },

  quitAndInstall: () => ipcRenderer.invoke("update:quit-and-install")

});

