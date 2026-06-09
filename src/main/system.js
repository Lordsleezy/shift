const os = require("os");
const { getHostCpuArchitecture } = require("./host-arch");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { getSecretsDir } = require("./paths");

const execFileAsync = promisify(execFile);

async function run(command, args, timeout = 8000) {
  try {
    const result = await execFileAsync(command, args, { windowsHide: true, timeout });
    return `${result.stdout || ""}${result.stderr || ""}`.trim();
  } catch {
    return "";
  }
}

async function getStorageAvailable() {
  if (process.platform === "win32") {
    const drive = process.env.SystemDrive || "C:";
    const output = await run("wmic", ["logicaldisk", "where", `DeviceID='${drive}'`, "get", "FreeSpace", "/value"]);
    const match = output.match(/FreeSpace=(\d+)/i);
    return match ? Number(match[1]) : null;
  }

  const output = await run("df", ["-k", "/"]);
  const lines = output.split(/\r?\n/).filter(Boolean);
  const parts = lines.length > 1 ? lines[1].trim().split(/\s+/) : [];
  return parts[3] ? Number(parts[3]) * 1024 : null;
}

async function detectWindowsSMode() {
  if (process.platform !== "win32") return false;
  const output = await run("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy", "/v", "SkuPolicyRequired"]);
  return /SkuPolicyRequired\s+REG_DWORD\s+0x1/i.test(output);
}

async function detectSecureBoot() {
  if (process.platform !== "win32") return { supported: false, enabled: null };
  const output = await run("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "try { Confirm-SecureBootUEFI } catch { 'Unsupported' }"
  ]);
  if (/true/i.test(output)) return { supported: true, enabled: true };
  if (/false/i.test(output)) return { supported: true, enabled: false };
  return { supported: false, enabled: null };
}

async function extractWindowsProductKey() {
  if (process.platform !== "win32") return { found: false, key: null };
  const output = await run("wmic", ["path", "softwarelicensingservice", "get", "OA3xOriginalProductKey"]);
  const key = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(line));
  return { found: Boolean(key), key: key || null };
}

async function saveWindowsProductKey(key) {
  if (!key) throw new Error("No product key to save");
  const secretsDir = getSecretsDir();
  await fs.mkdir(secretsDir, { recursive: true });
  const filePath = path.join(secretsDir, "windows-product-key.txt");
  await fs.writeFile(
    filePath,
    [
      "Windows product key saved by Shift by Sentinel",
      "Purpose: Reactivate Windows inside a VM if needed",
      "This file is stored locally and never sent to the cloud.",
      "",
      key,
      ""
    ].join("\n"),
    { encoding: "utf8", mode: 0o600 }
  );
  return { saved: true, path: filePath };
}

async function detectGpu() {
  if (process.platform === "win32") {
    const output = await run("wmic", ["path", "win32_VideoController", "get", "Name"]);
    const name = output
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line && line !== "Name");
    return name || null;
  }
  if (process.platform === "darwin") {
    const output = await run("system_profiler", ["SPDisplaysDataType"]);
    const match = output.match(/Chipset Model:\s*(.+)/i);
    return match ? match[1].trim() : null;
  }
  return null;
}

function formatOS() {
  if (process.platform === "win32") return `Windows ${os.release()}`;
  if (process.platform === "darwin") return `macOS ${os.release()}`;
  if (process.platform === "linux") return "Linux";
  return os.type();
}

function getMacChip() {
  if (process.platform !== "darwin") return null;
  return os.arch() === "arm64" ? "Apple Silicon" : "Intel";
}

function scoreDevice(totalRamBytes, storageBytes) {
  const ramGb = totalRamBytes / 1024 / 1024 / 1024;
  const storageGb = storageBytes ? storageBytes / 1024 / 1024 / 1024 : 0;
  if (ramGb < 2 || storageGb < 16) return "low";
  if (ramGb < 4 || storageGb < 32) return "limited";
  return "ready";
}

async function getDeviceReport() {
  const totalRamBytes = os.totalmem();
  const storageAvailableBytes = await getStorageAvailable();
  const secureBoot = await detectSecureBoot();
  const sMode = await detectWindowsSMode();
  const productKey = await extractWindowsProductKey();
  const gpu = await detectGpu();
  const macChip = getMacChip();
  const readiness = scoreDevice(totalRamBytes, storageAvailableBytes);

  return {
    platform: process.platform,
    currentOS: formatOS(),
    cpu: os.cpus()[0]?.model || "Unknown processor",
    cpuCores: os.cpus().length,
    architecture: os.arch(),
    hostArchitecture: getHostCpuArchitecture(),
    ramBytes: totalRamBytes,
    storageAvailableBytes,
    readiness,
    sMode,
    secureBoot,
    productKey,
    gpu,
    macChip,
    appleSiliconWarning: macChip === "Apple Silicon"
  };
}

module.exports = {
  getDeviceReport,
  extractWindowsProductKey,
  saveWindowsProductKey
};
