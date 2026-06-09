const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_DELAY_MS = 5000;
let checkingManually = false;

function initUpdater(getMainWindow) {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on("error", async (error) => {
    if (!checkingManually) return;
    checkingManually = false;
    await dialog.showMessageBox({
      type: "error",
      title: "Update Check Failed",
      message: "Could not check for updates.",
      detail: error?.message || String(error)
    });
  });

  autoUpdater.on("update-not-available", async (info) => {
    if (!checkingManually) return;
    checkingManually = false;
    await dialog.showMessageBox({
      type: "info",
      title: "No Updates",
      message: "You're up to date.",
      detail: `Shift by Sentinel ${info?.version || app.getVersion()} is the latest version.`
    });
  });

  autoUpdater.on("update-available", async (info) => {
    if (!checkingManually) return;
    checkingManually = false;
    await dialog.showMessageBox({
      type: "info",
      title: "Update Available",
      message: `Version ${info?.version} is available.`,
      detail: "Downloading in the background. A banner will appear when it's ready to install."
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    const win = getMainWindow();
    if (!win || win.isDestroyed()) return;
    win.webContents.send("update:ready", {
      version: info?.version || null
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => {});
  }, CHECK_DELAY_MS);
}

async function checkForUpdatesManually() {
  if (!app.isPackaged) {
    await dialog.showMessageBox({
      type: "info",
      title: "Shift by Sentinel",
      message: "You're running a development build.",
      detail: "Automatic updates are only available in the installed app."
    });
    return;
  }

  checkingManually = true;
  try {
    await autoUpdater.checkForUpdates();
  } catch (error) {
    checkingManually = false;
    await dialog.showMessageBox({
      type: "error",
      title: "Update Check Failed",
      message: "Could not check for updates.",
      detail: error?.message || String(error)
    });
  }
}

function quitAndInstall() {
  if (!app.isPackaged) return;
  autoUpdater.quitAndInstall(false, true);
}

module.exports = {
  initUpdater,
  checkForUpdatesManually,
  quitAndInstall
};
