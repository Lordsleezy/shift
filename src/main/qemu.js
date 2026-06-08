const { spawn } = require("child_process");
const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const os = require("os");

const execFileAsync = promisify(execFile);

const GB = 1024 * 1024 * 1024;
let demoProcess = null;

const QEMU_CANDIDATES = {
  win32: ["qemu-system-x86_64.exe", "qemu-system-x86_64"],
  darwin: ["qemu-system-x86_64"],
  linux: ["qemu-system-x86_64"]
};

const SEARCH_DIRS = {
  win32: [
    process.env.ProgramFiles && path.join(process.env.ProgramFiles, "qemu"),
    process.env["ProgramFiles(x86)"] && path.join(process.env["ProgramFiles(x86)"], "qemu"),
    "C:\\Program Files\\qemu",
    "C:\\qemu"
  ].filter(Boolean),
  darwin: ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin"],
  linux: ["/usr/bin", "/usr/local/bin"]
};

async function findQemuBinary() {
  const names = QEMU_CANDIDATES[process.platform] || QEMU_CANDIDATES.linux;

  if (process.platform === "win32") {
    for (const name of names) {
      try {
        const { stdout } = await execFileAsync("where.exe", [name], { windowsHide: true });
        const found = stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
        if (found && fs.existsSync(found)) return found;
      } catch {
        // try next
      }
    }
  } else {
    for (const name of names) {
      try {
        const { stdout } = await execFileAsync("which", [name], { windowsHide: true });
        const found = stdout.trim();
        if (found) return found;
      } catch {
        // try next
      }
    }
  }

  for (const dir of SEARCH_DIRS[process.platform] || []) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  return null;
}

function computeDemoMemory(hostRamBytes) {
  const quarter = Math.floor(hostRamBytes / 4);
  return Math.max(2 * GB, Math.min(8 * GB, quarter));
}

function buildAccelArgs() {
  if (process.platform === "win32" && os.arch() === "x64") {
    return ["-machine", "q35,accel=whpx:tcg,kernel-irqchip=off"];
  }
  if (process.platform === "darwin" && os.arch() === "x64") {
    return ["-machine", "q35,accel=hvf:tcg"];
  }
  return ["-machine", "q35,accel=tcg"];
}

function buildQemuArgs(isoPath, distroName, memoryMb) {
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

  // Live session only — no writable disk attached; ISO is read-only.
  return args;
}

async function launchDemo(isoPath, distroName, hostRamBytes) {
  if (demoProcess) {
    throw new Error("A demo is already running. Close the QEMU window first.");
  }

  const qemuPath = await findQemuBinary();
  if (!qemuPath) {
    throw new Error(
      "QEMU is not installed. Install QEMU from https://www.qemu.org/download/ " +
        "(Windows: QEMU for Windows installer) and restart Shift."
    );
  }

  const memoryMb = Math.floor(computeDemoMemory(hostRamBytes) / 1024 / 1024);
  const args = buildQemuArgs(isoPath, distroName, memoryMb);

  return new Promise((resolve, reject) => {
    demoProcess = spawn(qemuPath, args, {
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

module.exports = {
  findQemuBinary,
  launchDemo,
  cancelDemo,
  isDemoRunning,
  computeDemoMemory
};
