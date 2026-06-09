const os = require("os");

function getHostCpuArchitecture() {
  if (process.platform === "win32") {
    const native = (process.env.PROCESSOR_ARCHITEW6432 || process.env.PROCESSOR_ARCHITECTURE || "").toUpperCase();
    if (native === "ARM64") return "arm64";
    if (native === "AMD64" || native === "X64") return "x64";
    if (native === "X86") return "ia32";
  }
  return os.arch();
}

function isWindowsArm64Host() {
  return process.platform === "win32" && getHostCpuArchitecture() === "arm64";
}

module.exports = {
  getHostCpuArchitecture,
  isWindowsArm64Host
};
