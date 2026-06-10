const fs = require("fs/promises");
const path = require("path");
const { getIsoPath, getIsoDir } = require("./paths");
const { downloadFile } = require("./download");
const { verifyIso } = require("./verify");
const { getDistroSource, getDistroName } = require("./distro-sources");

async function getIsoStatus(distroId) {
  const config = getDistroSource(distroId);
  if (!config || config.comingSoon) {
    return { available: false, reason: "coming_soon" };
  }
  if (config.manualDownloadOnly) {
    return { available: false, reason: "manual_download" };
  }

  const isoPath = getIsoPath(distroId, config.filename);
  const stat = await fs.stat(isoPath).catch(() => null);
  if (!stat) {
    return { available: true, downloaded: false, isoPath, filename: config.filename };
  }

  return {
    available: true,
    downloaded: true,
    isoPath,
    filename: config.filename,
    sizeBytes: stat.size
  };
}

async function ensureIsoDownloaded(distroId, onProgress, signal) {
  const config = getDistroSource(distroId);
  if (!config) {
    throw new Error(`Unknown distro: ${distroId}`);
  }
  if (config.comingSoon) {
    throw new Error(`${getDistroName(distroId)} is not available yet`);
  }
  if (config.manualDownloadOnly) {
    throw new Error(`${getDistroName(distroId)} cannot be downloaded automatically`);
  }

  await fs.mkdir(getIsoDir(), { recursive: true });
  const isoPath = getIsoPath(distroId, config.filename);
  const existing = await fs.stat(isoPath).catch(() => null);

  if (!existing) {
    onProgress?.({
      phase: "download",
      received: 0,
      total: 0,
      percent: 0,
      message: "Downloading ISO from official source"
    });
    await downloadFile(config.url, isoPath, (data) => {
      onProgress?.({ ...data, message: "Downloading ISO from official source" });
    }, signal);
  } else {
    onProgress?.({
      phase: "download",
      received: existing.size,
      total: existing.size,
      percent: 100,
      message: "Using cached ISO"
    });
  }

  if (config.sha256 || config.checksumUrl) {
    onProgress?.({
      phase: "verify",
      received: 0,
      total: 0,
      percent: 0,
      message: "Verifying SHA256 checksum"
    });
    await verifyIso(isoPath, config, (data) => {
      onProgress?.({ ...data, message: "Verifying SHA256 checksum" });
    });
  }

  return { isoPath, cached: Boolean(existing), filename: config.filename };
}

module.exports = {
  getIsoStatus,
  ensureIsoDownloaded
};
