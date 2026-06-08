const fs = require("fs/promises");
const path = require("path");
const { getInstallDir } = require("./paths");
const { ensureIsoDownloaded } = require("./iso");
const { loadPartitionPlan } = require("./partition");
const { extractIsoToPartition, configureGrub } = require("./extract");
const { getDistroName } = require("./distro-sources");

let activeController = null;

function emit(onProgress, data) {
  onProgress?.({
    ...data,
    message: phaseLabel(data.phase)
  });
}

function phaseLabel(phase) {
  const labels = {
    download: "Downloading ISO from official source",
    verify: "Verifying SHA256 checksum",
    extract: "Extracting installer to Linux partition",
    grub: "Configuring GRUB bootloader",
    done: "Ready to install"
  };
  return labels[phase] || phase;
}

async function startInstall(distroId, onProgress) {
  const partitionPlan = await loadPartitionPlan();
  if (!partitionPlan) {
    throw new Error("Partition plan not found. Complete the Partition step first.");
  }

  activeController = new AbortController();

  const { isoPath } = await ensureIsoDownloaded(
    distroId,
    (data) => emit(onProgress, data),
    activeController.signal
  );

  emit(onProgress, { phase: "extract", received: 0, total: 0, percent: 0 });
  await extractIsoToPartition(isoPath, partitionPlan, (p) => emit(onProgress, p));

  emit(onProgress, { phase: "grub", received: 0, total: 0, percent: 0 });
  await configureGrub(partitionPlan, getDistroName(distroId), (p) => emit(onProgress, p));

  const manifest = {
    distroId,
    distroName: getDistroName(distroId),
    isoPath,
    partitionPlan,
    completedAt: new Date().toISOString()
  };
  await fs.writeFile(path.join(getInstallDir(), "manifest.json"), JSON.stringify(manifest, null, 2));

  emit(onProgress, { phase: "done", received: 100, total: 100, percent: 100 });
  activeController = null;
  return manifest;
}

function cancelInstall() {
  activeController?.abort();
  activeController = null;
}

async function rebootToInstall() {
  if (process.platform === "win32") {
    const { execFile } = require("child_process");
    const { promisify } = require("util");
    await promisify(execFile)("shutdown.exe", ["/r", "/t", "10", "/c", "Shift by Sentinel — restarting to install your new OS"], {
      windowsHide: true
    });
    return { ok: true, delaySeconds: 10 };
  }
  if (process.platform === "darwin") {
    const { execFile } = require("child_process");
    const { promisify } = require("util");
    await promisify(execFile)("osascript", ["-e", 'tell app "System Events" to restart'], { windowsHide: true });
    return { ok: true };
  }
  throw new Error("Reboot not supported on this platform");
}

module.exports = {
  startInstall,
  cancelInstall,
  rebootToInstall
};
