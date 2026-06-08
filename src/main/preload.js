const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("shiftAPI", {
  getDeviceReport: async () => await ipcRenderer.invoke("device:get-report")
});
