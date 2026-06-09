const os = require("os");
const { ensureIsoDownloaded, getIsoStatus } = require("./iso");
const { launchDemo, cancelDemo, isDemoRunning, findQemuBinary } = require("./qemu");
const { getBundledQemuBinary } = require("./qemu-bundle");
const { getDistroName } = require("./distro-sources");

const DEMO_UNSUPPORTED_ARM64_MESSAGE =
  "Live demo requires an Intel or AMD processor. On your device you can still install directly — the installer handles everything.";

let demoDownloadController = null;

function getDemoCapability() {
  if (process.platform === "win32" && os.arch() === "arm64") {
    return {
      demoSupported: false,
      demoUnsupportedMessage: DEMO_UNSUPPORTED_ARM64_MESSAGE
    };
  }
  return { demoSupported: true, demoUnsupportedMessage: null };
}

function emit(onProgress, data) {
  onProgress?.({
    ...data,
    message: data.message || phaseMessage(data.phase)
  });
}

function phaseMessage(phase) {
  const labels = {
    download: "Downloading ISO for demo",
    verify: "Verifying ISO checksum",
    launch: "Starting virtual machine",
    running: "Demo running — close the QEMU window when finished"
  };
  return labels[phase] || phase;
}

async function checkDemoReady(distroId) {
  const iso = await getIsoStatus(distroId);
  const capability = getDemoCapability();
  const bundled = capability.demoSupported ? getBundledQemuBinary() : null;
  const qemuPath = capability.demoSupported ? bundled || (await findQemuBinary()) : null;
  return {
    ...iso,
    ...capability,
    qemuInstalled: Boolean(qemuPath),
    qemuPath,
    qemuBundled: Boolean(bundled)
  };
}

async function startDemo(distroId, onProgress) {
  const capability = getDemoCapability();
  if (!capability.demoSupported) {
    throw new Error(capability.demoUnsupportedMessage);
  }

  if (isDemoRunning()) {
    throw new Error("A demo is already running");
  }

  demoDownloadController = new AbortController();

  try {
    const { isoPath, cached } = await ensureIsoDownloaded(
      distroId,
      (data) => emit(onProgress, data),
      demoDownloadController.signal
    );

    emit(onProgress, {
      phase: "launch",
      received: 100,
      total: 100,
      percent: 100,
      cached
    });

    emit(onProgress, {
      phase: "running",
      received: 0,
      total: 0,
      percent: 100,
      message: "Demo running — close the QEMU window when finished"
    });

    const result = await launchDemo(isoPath, getDistroName(distroId), os.totalmem());
    emit(onProgress, { phase: "done", received: 100, total: 100, percent: 100, message: "Demo finished" });
    return { ok: true, isoPath, cached, ...result };
  } finally {
    demoDownloadController = null;
  }
}

function cancelDemoFlow() {
  demoDownloadController?.abort();
  demoDownloadController = null;
  cancelDemo();
}

module.exports = {
  getDemoCapability,
  checkDemoReady,
  startDemo,
  cancelDemoFlow,
  isDemoRunning
};
