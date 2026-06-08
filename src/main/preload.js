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
  onInstallProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("install:progress", listener);
    return () => ipcRenderer.removeListener("install:progress", listener);
  },
  getDemoStatus: (distroId) => ipcRenderer.invoke("demo:status", { distroId }),
  startDemo: (distroId) => ipcRenderer.invoke("demo:start", { distroId }),
  cancelDemo: () => ipcRenderer.invoke("demo:cancel"),
  onDemoProgress: (callback) => {
    const listener = (_event, data) => callback(data);
    ipcRenderer.on("demo:progress", listener);
    return () => ipcRenderer.removeListener("demo:progress", listener);
  }
});
