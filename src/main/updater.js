const { app } = require("electron");
const { autoUpdater } = require("electron-updater");

const CHECK_DELAY_MS = 5000;

function initUpdater(getMainWindow) {
  if (!app.isPackaged) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("error", () => {
    // Silent — never interrupt the user for update failures.
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

module.exports = {
  initUpdater
};
