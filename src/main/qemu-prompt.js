const fs = require("fs/promises");
const path = require("path");
const { dialog, shell } = require("electron");
const { getShiftDataDir } = require("./paths");
const { findQemuBinary } = require("./qemu");

const QEMU_DOWNLOAD_URLS = {
  win32: "https://www.qemu.org/download/#windows",
  darwin: "https://www.qemu.org/download/#macos",
  linux: "https://www.qemu.org/download/#linux"
};

async function maybeShowQemuPrompt(mainWindow) {
  const flagPath = path.join(getShiftDataDir(), "qemu-prompt-shown");

  try {
    await fs.access(flagPath);
    return { shown: false, reason: "already-prompted" };
  } catch {
    // first launch — continue
  }

  const qemuPath = await findQemuBinary();
  if (qemuPath) {
    return { shown: false, reason: "qemu-installed" };
  }

  const downloadUrl = QEMU_DOWNLOAD_URLS[process.platform] || "https://www.qemu.org/download/";
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: "info",
    title: "Try a live demo",
    message: "To try a live demo, you need QEMU installed.",
    detail:
      "QEMU opens Linux in a safe preview window on your computer — nothing is installed until you choose to continue with Shift.",
    buttons: ["Download QEMU", "Not now"],
    defaultId: 0,
    cancelId: 1,
    noLink: true
  });

  await fs.mkdir(getShiftDataDir(), { recursive: true });
  await fs.writeFile(flagPath, new Date().toISOString(), "utf8");

  if (response === 0) {
    await shell.openExternal(downloadUrl);
  }

  return { shown: true, downloaded: response === 0 };
}

module.exports = {
  maybeShowQemuPrompt,
  QEMU_DOWNLOAD_URLS
};
