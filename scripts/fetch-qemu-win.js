/**
 * Downloads and stages QEMU for Windows into resources/qemu-win/.
 * Run automatically before packaging; skipped if already present (set FORCE_QEMU_FETCH=1 to refresh).
 */
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const https = require("https");
const { execFileSync } = require("child_process");

const QEMU_BUILD = "20260501";
const INSTALLER_URL = `https://qemu.weilnetz.de/w64/qemu-w64-setup-${QEMU_BUILD}.exe`;
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "resources", "qemu-win");
const STAGING_DIR = path.join(ROOT, ".qemu-staging");
const MARKER = path.join(OUT_DIR, ".qemu-bundle-version");

async function pathExists(target) {
  try {
    await fsp.access(target);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = (requestUrl) => {
      https
        .get(requestUrl, (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            request(response.headers.location);
            return;
          }
          if (response.statusCode !== 200) {
            reject(new Error(`Failed to download QEMU (${response.statusCode}) from ${requestUrl}`));
            return;
          }
          const total = Number(response.headers["content-length"] || 0);
          let received = 0;
          const file = fs.createWriteStream(dest);
          response.on("data", (chunk) => {
            received += chunk.length;
            if (total > 0 && received % (10 * 1024 * 1024) < chunk.length) {
              process.stdout.write(`\rDownloading QEMU… ${Math.round((received / total) * 100)}%`);
            }
          });
          response.pipe(file);
          file.on("finish", () => {
            file.close(() => {
              if (total > 0 && received < total * 0.95) {
                reject(new Error(`Incomplete QEMU download (${received} of ${total} bytes)`));
                return;
              }
              process.stdout.write("\n");
              resolve();
            });
          });
        })
        .on("error", reject);
    };
    request(url);
  });
}

async function copyTree(source, target) {
  await fsp.mkdir(target, { recursive: true });
  const entries = await fsp.readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const src = path.join(source, entry.name);
    const dst = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyTree(src, dst);
    } else {
      await fsp.copyFile(src, dst);
    }
  }
}

async function pruneBundledQemu(dir) {
  const keepExe = new Set(["qemu-system-x86_64.exe"]);
  const entries = await fsp.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "share") {
        await fsp.rm(full, { recursive: true, force: true });
      }
      continue;
    }
    if (entry.name.endsWith(".exe") && !keepExe.has(entry.name.toLowerCase())) {
      await fsp.rm(full, { force: true });
    }
  }

  const shareRoot = path.join(dir, "share");
  if (!(await pathExists(shareRoot))) {
    throw new Error("QEMU share firmware folder missing after staging");
  }
}

function silentInstallQemu(installerPath, destDir) {
  const psDest = destDir.replace(/'/g, "''");
  const psInstaller = installerPath.replace(/'/g, "''");
  const script = `
    $ErrorActionPreference = 'Stop'
    $dest = '${psDest}'
    if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
    $proc = Start-Process -FilePath '${psInstaller}' -ArgumentList '/S', "/D=$dest" -PassThru -Wait
    if ($proc.ExitCode -ne 0) { throw "QEMU installer exited with code $($proc.ExitCode)" }
    $exe = Join-Path $dest 'qemu-system-x86_64.exe'
    if (-not (Test-Path $exe)) { throw 'qemu-system-x86_64.exe not found after install' }
  `;
  execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    stdio: "inherit",
    timeout: 600000
  });
}

async function fetchQemuWin() {
  if (process.platform !== "win32") {
    console.log("Skipping QEMU fetch — Windows bundle step (non-Windows host).");
    return;
  }

  if (
    process.env.FORCE_QEMU_FETCH !== "1" &&
    (await pathExists(path.join(OUT_DIR, "qemu-system-x86_64.exe"))) &&
    (await pathExists(MARKER))
  ) {
    const version = await fsp.readFile(MARKER, "utf8");
    if (version.trim() === QEMU_BUILD) {
      console.log(`QEMU ${QEMU_BUILD} already staged at resources/qemu-win/`);
      return;
    }
  }

  console.log(`Fetching QEMU ${QEMU_BUILD} for bundling…`);
  await fsp.mkdir(path.join(ROOT, "resources"), { recursive: true });

  const installerPath = path.join(ROOT, `.qemu-installer-${QEMU_BUILD}.exe`);
  await downloadFile(INSTALLER_URL, installerPath);

  try {
    silentInstallQemu(installerPath, STAGING_DIR);
    await fsp.rm(OUT_DIR, { recursive: true, force: true });
    await copyTree(STAGING_DIR, OUT_DIR);
    await pruneBundledQemu(OUT_DIR);
    await fsp.writeFile(MARKER, `${QEMU_BUILD}\n`, "utf8");
    console.log(`QEMU staged at ${OUT_DIR}`);
  } finally {
    await fsp.rm(installerPath, { force: true }).catch(() => {});
    await fsp.rm(STAGING_DIR, { recursive: true, force: true }).catch(() => {});
  }
}

fetchQemuWin().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
