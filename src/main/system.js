const os = require("os");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function run(command, args) {
  try {
    const result = await execFileAsync(command, args, { windowsHide: true, timeout: 8000 });
    return `${result.stdout || ""}${result.stderr || ""}`.trim();
  } catch (error) {
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
  const output = await run("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", "try { Confirm-SecureBootUEFI } catch { 'Unsupported' }"]);
  if (/true/i.test(output)) return { supported: true, enabled: true };
  if (/false/i.test(output)) return { supported: true, enabled: false };
  return { supported: false, enabled: null };
}

async function backupWindowsProductKey(userDataPath) {
  if (process.platform !== "win32") return { saved: false, path: null };
  const output = await run("wmic", ["path", "softwarelicensingservice", "get", "OA3xOriginalProductKey"]);
  const key = output.split(/\r?\n/).map((line) => line.trim()).find((line) => /^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(line));
  if (!key) return { saved: false, path: null };

  const filePath = path.join(userDataPath, "windows-product-key.txt");
  await fs.mkdir(userDataPath, { recursive: true });
  await fs.writeFile(filePath, `Windows product key saved by Shift by Sentinel\n\n${key}\n`, "utf8");
  return { saved: true, path: filePath };
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

async function getDeviceReport(userDataPath) {
  const totalRamBytes = os.totalmem();
  const storageAvailableBytes = await getStorageAvailable();
  const secureBoot = await detectSecureBoot();
  const sMode = await detectWindowsSMode();
  const productKey = await backupWindowsProductKey(userDataPath);
  const macChip = getMacChip();
  const readiness = scoreDevice(totalRamBytes, storageAvailableBytes);

  return {
    platform: process.platform,
    currentOS: formatOS(),
    cpu: os.cpus()[0]?.model || "Unknown processor",
    cpuCores: os.cpus().length,
    architecture: os.arch(),
    ramBytes: totalRamBytes,
    storageAvailableBytes,
    readiness,
    sMode,
    secureBoot,
    productKey,
    macChip,
    appleSiliconWarning: macChip === "Apple Silicon"
  };
}

module.exports = { getDeviceReport };
