const fs = require("fs/promises");
const path = require("path");
const { getIsoPath, getInstallDir } = require("./paths");
const { downloadFile } = require("./download");
const { verifyIso } = require("./verify");
const { loadPartitionPlan } = require("./partition");
const { extractIsoToPartition, configureGrub } = require("./extract");

const DISTRO_SOURCES = {
  zorin: {
    url: "https://mirrors.edge.kernel.org/zorinos-isos/17/Zorin-OS-17.3-Core-64-bit-r2.iso",
    filename: "Zorin-OS-17.3-Core-64-bit-r2.iso",
    sha256: "c1510d1e16ec50c884faeb4e32326ba8d2e38d2cf22698b649168011d00220f6"
  },
  mint: {
    url: "https://mirrors.kernel.org/linuxmint/stable/22.1/linuxmint-22.1-cinnamon-64bit.iso",
    filename: "linuxmint-22.1-cinnamon-64bit.iso",
    sha256: "ccf482436df954c0ad6d41123a49fde79352ca71f7a684a97d5e0a0c39d7f39f"
  },
  popos: {
    url: "https://iso.pop-os.org/22.04/amd64/intel/35/pop-os_22.04_amd64_intel_35.iso",
    filename: "pop-os_22.04_amd64_intel_35.iso",
    checksumUrl: "https://iso.pop-os.org/22.04/amd64/intel/35/SHA256SUMS"
  },
  elementary: {
    manualDownloadOnly: true,
    filename: "elementaryos-8.1-stable-amd64.20260219.iso",
    sha256: "bda93040d08c05911fb159f8150bf8f4ef2db6567ef6e2acd197cb6f395d3446",
    manualDownloadUrl: "https://elementary.io/"
  },
  ubuntu: {
    url: "https://releases.ubuntu.com/24.04.4/ubuntu-24.04.4-desktop-amd64.iso",
    filename: "ubuntu-24.04.4-desktop-amd64.iso",
    sha256: "3a4c9877b483ab46d7c3fbe165a0db275e1ae3cfe56a5657e5a47c2f99a99d1e"
  },
  nobara: {
    url: "https://nobara-images.nobaraproject.org/Nobara-41-Official-2024-12-31.iso",
    filename: "Nobara-41-Official-2024-12-31.iso"
  }
};

const DISTRO_NAMES = {
  zorin: "Zorin OS",
  mint: "Linux Mint",
  popos: "Pop!_OS",
  elementary: "elementary OS",
  ubuntu: "Ubuntu",
  nobara: "Nobara Linux"
};

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
  const isoConfig = DISTRO_SOURCES[distroId];
  if (!isoConfig) {
    throw new Error(`No download source configured for ${distroId}`);
  }
  if (isoConfig.manualDownloadOnly) {
    throw new Error(
      `${DISTRO_NAMES[distroId] || distroId} cannot be downloaded automatically. ` +
        `Please choose another distro with a direct ISO mirror.`
    );
  }

  const partitionPlan = await loadPartitionPlan();
  if (!partitionPlan) {
    throw new Error("Partition plan not found. Complete the Partition step first.");
  }

  activeController = new AbortController();
  const isoPath = getIsoPath(distroId, isoConfig.filename);

  await fs.mkdir(getInstallDir(), { recursive: true });

  const existing = await fs.stat(isoPath).catch(() => null);
  if (!existing) {
    emit(onProgress, { phase: "download", received: 0, total: 0, percent: 0 });
    await downloadFile(isoConfig.url, isoPath, (p) => emit(onProgress, p), activeController.signal);
  } else {
    emit(onProgress, { phase: "download", received: existing.size, total: existing.size, percent: 100 });
  }

  emit(onProgress, { phase: "verify", received: 0, total: 0, percent: 0 });
  if (isoConfig.sha256 || isoConfig.checksumUrl) {
    await verifyIso(isoPath, isoConfig, (p) => emit(onProgress, p));
  } else {
    emit(onProgress, { phase: "verify", received: 100, total: 100, percent: 100 });
  }

  emit(onProgress, { phase: "extract", received: 0, total: 0, percent: 0 });
  await extractIsoToPartition(isoPath, partitionPlan, (p) => emit(onProgress, p));

  emit(onProgress, { phase: "grub", received: 0, total: 0, percent: 0 });
  await configureGrub(partitionPlan, DISTRO_NAMES[distroId] || distroId, (p) => emit(onProgress, p));

  const manifest = {
    distroId,
    distroName: DISTRO_NAMES[distroId],
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
  rebootToInstall,
  DISTRO_SOURCES
};
