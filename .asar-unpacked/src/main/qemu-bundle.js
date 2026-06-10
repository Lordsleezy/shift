const fs = require("fs");
const path = require("path");

function getBundledQemuRoot() {
  if (process.platform !== "win32") {
    return null;
  }

  const candidates = [];

  if (process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, "qemu"));
  }

  // Packaged app fallback (some layouts nest resources differently)
  try {
    const { app } = require("electron");
    if (app?.isPackaged) {
      candidates.push(path.join(path.dirname(process.execPath), "resources", "qemu"));
    }
  } catch {
    // electron not ready yet
  }

  // Dev: run fetch-qemu-win.js once, then use staged bundle
  candidates.push(path.join(__dirname, "..", "..", "resources", "qemu-win"));

  for (const root of candidates) {
    const exe = path.join(root, "qemu-system-x86_64.exe");
    if (fs.existsSync(exe)) {
      return root;
    }
  }

  return null;
}

function getBundledQemuBinary() {
  const root = getBundledQemuRoot();
  if (!root) return null;
  return path.join(root, "qemu-system-x86_64.exe");
}

function getBundledQemuShareDir() {
  const root = getBundledQemuRoot();
  if (!root) return null;

  const nested = path.join(root, "share", "qemu");
  if (fs.existsSync(nested)) {
    return nested;
  }

  const shareRoot = path.join(root, "share");
  if (fs.existsSync(path.join(shareRoot, "bios.bin")) || fs.existsSync(path.join(shareRoot, "edk2-x86_64-code.fd"))) {
    return shareRoot;
  }

  return null;
}

module.exports = {
  getBundledQemuRoot,
  getBundledQemuBinary,
  getBundledQemuShareDir
};
