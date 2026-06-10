const { spawn } = require("child_process");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");
const {
  getBundledQemuRoot,
  getBundledQemuBinary,
  getBundledQemuShareDir
} = require("./qemu-bundle");

const execFileAsync = promisify(execFile);

const GB = 1024 * 1024 * 1024;
let demoProcess = null;

async function findQemuBinary() {
  const bundled = getBundledQemuBinary();
  if (bundled) {
    return bundled;
  }

  if (process.platform !== "win32") {
    const names = ["qemu-system-x86_64"];
    for (const name of names) {
      try {
        const { stdout } = await execFileAsync("which", [name], { windowsHide: true });
        const found = stdout.trim();
        if (found && fs.existsSync(found)) return found;
      } catch {
        // try next
      }
    }
  }

  return null;
}

function computeDemoMemory(hostRamBytes) {
  const quarter = Math.floor(hostRamBytes / 4);
  return Math.max(2 * GB, Math.min(8 * GB, quarter));
}

function buildAccelArgs() {
  if (process.platform === "win32") {
    if (os.arch() === "x64") {
      return ["-machine", "q35,accel=whpx:tcg,kernel-irqchip=off"];
    }
    return ["-machine", "q35,accel=tcg"];
  }
  if (process.platform === "darwin" && os.arch() === "x64") {
    return ["-machine", "q35,accel=hvf:tcg"];
  }
  return ["-machine", "q35,accel=tcg"];
}

function buildQemuArgs(isoPath, distroName, memoryMb, shareDir) {
  const safeTitle = `Shift Demo — ${distroName}`;
  const args = [
    ...buildAccelArgs(),
    "-m", String(memoryMb),
    "-smp", "2",
    "-name", safeTitle,
    "-cdrom", isoPath,
    "-boot", "order=d",
    "-vga", "virtio",
    "-display", process.platform === "win32" ? "default" : "gtk",
    "-audiodev", "none,id=noaudio",
    "-netdev", "user,id=net0",
    "-device", "virtio-net-pci,netdev=net0",
    "-no-reboot"
  ];

  if (shareDir) {
    args.unshift(shareDir);
    args.unshift("-L");
  }

  return args;
}

function spawnEnvForQemu(qemuPath) {
  const qemuRoot = path.dirname(qemuPath);
  const bundledRoot = getBundledQemuRoot();
  const cwd = bundledRoot || qemuRoot;
  return {
    cwd,
    env: {
      ...process.env,
      PATH: `${cwd}${path.delimiter}${process.env.PATH || ""}`
    }
  };
}

async function launchDemo(isoPath, distroName, hostRamBytes) {
  if (demoProcess) {
    throw new Error("A demo is already running. Close the QEMU window first.");
  }

  const qemuPath = await findQemuBinary();
  if (!qemuPath) {
    throw new Error(
      "QEMU could not be started. Reinstall Shift by Sentinel — the demo virtual machine is included with the app."
    );
  }

  const shareDir = getBundledQemuShareDir();
  const memoryMb = Math.floor(computeDemoMemory(hostRamBytes) / 1024 / 1024);
  const args = buildQemuArgs(isoPath, distroName, memoryMb, shareDir);
  const spawnOpts = spawnEnvForQemu(qemuPath);

  return new Promise((resolve, reject) => {
    demoProcess = spawn(qemuPath, args, {
      ...spawnOpts,
      detached: false,
      stdio: "ignore",
      windowsHide: false
    });

    demoProcess.on("error", (error) => {
      demoProcess = null;
      reject(error);
    });

    demoProcess.on("exit", (code, signal) => {
      demoProcess = null;
      resolve({ ok: true, exitCode: code, signal });
    });
  });
}

function cancelDemo() {
  if (demoProcess) {
    demoProcess.kill();
    demoProcess = null;
    return true;
  }
  return false;
}

function isDemoRunning() {
  return demoProcess !== null;
}

function isQemuAvailable() {
  return Boolean(getBundledQemuBinary());
}

module.exports = {
  findQemuBinary,
  launchDemo,
  cancelDemo,
  isDemoRunning,
  computeDemoMemory,
  isQemuAvailable,
  getBundledQemuRoot
};
