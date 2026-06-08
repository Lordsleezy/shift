const os = require("os");
const { ensureIsoDownloaded, getIsoStatus } = require("./iso");
const { launchDemo, cancelDemo, isDemoRunning, findQemuBinary } = require("./qemu");
const { getDistroName } = require("./distro-sources");

let demoDownloadController = null;

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
  const qemuPath = await findQemuBinary();
  return {
    ...iso,
    qemuInstalled: Boolean(qemuPath),
    qemuPath
  };
}

async function startDemo(distroId, onProgress) {
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
  checkDemoReady,
  startDemo,
  cancelDemoFlow,
  isDemoRunning
};
