const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { getDeviceReport, extractWindowsProductKey, saveWindowsProductKey } = require("./system");
const { getDriveLayout, applyPartitionPlan } = require("./partition");
const { startInstall, cancelInstall, rebootToInstall } = require("./install");
const { executeRevertFromWindows, rebootAfterRevert } = require("./revert");
const { loadManifestFromWindows } = require("./restore-manifest");
const { openDistroSeaDemo } = require("./demo");
const { getIsoStatus, ensureIsoDownloaded } = require("./iso");
const { initUpdater, quitAndInstall } = require("./updater");
const { buildAppMenu } = require("./menu");

let mainWindow = null;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    title: "Shift by Sentinel",
    backgroundColor: "#0a1628",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (!app.isPackaged) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await mainWindow.loadFile(path.join(app.getAppPath(), "dist", "index.html"));
  }
}

function sendProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("install:progress", data);
  }
}

let isoDownloadController = null;

function sendIsoProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("iso:progress", data);
  }
}

ipcMain.handle("device:get-report", async () => getDeviceReport());

ipcMain.handle("key:extract", async () => extractWindowsProductKey());

ipcMain.handle("key:save", async (_event, key) => saveWindowsProductKey(key));

ipcMain.handle("partition:get-layout", async () => getDriveLayout());

ipcMain.handle("partition:apply", async (_event, linuxBytes) => applyPartitionPlan(linuxBytes));

ipcMain.handle("install:start", async (_event, { distroId }) => {
  try {
    const manifest = await startInstall(distroId, sendProgress);
    return { ok: true, manifest };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("install:cancel", async () => {
  cancelInstall();
  return { ok: true };
});

ipcMain.handle("install:reboot", async () => rebootToInstall());

function sendRevertProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("revert:progress", data);
  }
}

ipcMain.handle("revert:validate", async () => {
  try {
    const { manifest, validation } = await loadManifestFromWindows();
    return { ok: validation.ok, manifest, errors: validation.errors };
  } catch (error) {
    return { ok: false, errors: [error.message || String(error)] };
  }
});

ipcMain.handle("revert:execute", async () => {
  try {
    const result = await executeRevertFromWindows(sendRevertProgress);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("revert:reboot", async () => rebootAfterRevert());

ipcMain.handle("iso:status", async (_event, { distroId }) => getIsoStatus(distroId));

ipcMain.handle("demo:open", async (_event, { distroId }) => {
  try {
    const result = await openDistroSeaDemo(distroId);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  }
});

ipcMain.handle("iso:download", async (_event, { distroId }) => {
  try {
    isoDownloadController = new AbortController();
    const result = await ensureIsoDownloaded(distroId, sendIsoProgress, isoDownloadController.signal);
    return { ok: true, result };
  } catch (error) {
    return { ok: false, error: error.message || String(error) };
  } finally {
    isoDownloadController = null;
  }
});

ipcMain.handle("iso:cancel", async () => {
  isoDownloadController?.abort();
  isoDownloadController = null;
  return { ok: true };
});

ipcMain.handle("update:quit-and-install", async () => {
  quitAndInstall();
  return { ok: true };
});

app.whenReady().then(async () => {
  buildAppMenu();
  await createWindow();
  initUpdater(() => mainWindow);

  app.on("activate", async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
