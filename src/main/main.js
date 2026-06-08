const { app, BrowserWindow, ipcMain } = require("electron");
const path = require("path");
const { getDeviceReport, extractWindowsProductKey, saveWindowsProductKey } = require("./system");
const { getDriveLayout, applyPartitionPlan } = require("./partition");
const { startInstall, cancelInstall, rebootToInstall } = require("./install");

const isDev = process.env.NODE_ENV === "development";
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

  if (isDev) {
    await mainWindow.loadURL("http://127.0.0.1:5173");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "../../dist/index.html"));
  }
}

function sendProgress(data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("install:progress", data);
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

app.whenReady().then(async () => {
  await createWindow();

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
