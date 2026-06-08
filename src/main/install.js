const fs = require("fs/promises");
const path = require("path");
const { getInstallDir } = require("./paths");
const { ensureIsoDownloaded } = require("./iso");
const { loadPartitionPlan } = require("./partition");
const { extractIsoToPartition } = require("./extract");
const { getDistroName } = require("./distro-sources");
const {
  enrichPartitionResult,
  finalizeManifest,
  writeManifestCopies
} = require("./restore-manifest");
const { configureRevertBootEntries } = require("./revert-boot");
const { deployRevertScripts, registerBootTriggerTask } = require("./revert");
const { deployCompanionToLinuxPartition } = require("./companion");

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
    restore: "Writing restore manifest and Go Back to Windows",
    companion: "Installing Sentinel Revert companion",
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
  const shiftBoot = await configureRevertBootEntries(partitionPlan, getDistroName(distroId));
  emit(onProgress, { phase: "grub", received: 100, total: 100, percent: 100 });

  emit(onProgress, { phase: "restore", received: 0, total: 100, percent: 10 });
  let preSnapshot = null;
  try {
    preSnapshot = JSON.parse(await fs.readFile(path.join(getInstallDir(), "pre-restore-snapshot.json"), "utf8"));
  } catch {
    throw new Error("Pre-change restore snapshot missing. Cannot proceed without a safe revert path.");
  }

  const enrichedPlan = await enrichPartitionResult(partitionPlan, partitionPlan);
  const restoreManifest = finalizeManifest(preSnapshot, enrichedPlan, shiftBoot);
  const manifestPaths = await writeManifestCopies(restoreManifest, enrichedPlan.linuxDriveLetter);
  await deployRevertScripts(restoreManifest);
  await registerBootTriggerTask();
  emit(onProgress, { phase: "restore", received: 100, total: 100, percent: 100 });

  emit(onProgress, { phase: "companion", received: 0, total: 100, percent: 10 });
  await deployCompanionToLinuxPartition(enrichedPlan.linuxDriveLetter);
  emit(onProgress, { phase: "companion", received: 100, total: 100, percent: 100 });

  const manifest = {
    distroId,
    distroName: getDistroName(distroId),
    isoPath,
    partitionPlan: enrichedPlan,
    restoreManifest,
    restoreManifestPaths: manifestPaths,
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
