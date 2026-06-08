const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs");
const fsPromises = require("fs/promises");
const path = require("path");

const execFileAsync = promisify(execFile);

async function runPowerShell(script, timeout = 600000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 50 * 1024 * 1024, timeout }
  );
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function mountIso(isoPath) {
  if (process.platform === "win32") {
    const script = `
      $img = Mount-DiskImage -ImagePath '${isoPath.replace(/'/g, "''")}' -PassThru
      $vol = ($img | Get-Volume)
      [ordered]@{ driveLetter = [string]$vol.DriveLetter; path = $img.ImagePath } | ConvertTo-Json -Compress
    `;
    const output = await runPowerShell(script);
    return JSON.parse(output);
  }

  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("hdiutil", ["attach", isoPath, "-nobrowse", "-plist"], { windowsHide: true });
    const mountMatch = stdout.match(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/);
    return { driveLetter: null, mountPath: mountMatch ? mountMatch[1] : "/Volumes/Untitled" };
  }

  throw new Error("ISO mount not supported on this platform");
}

async function unmountIso(isoPath, mountInfo) {
  if (process.platform === "win32") {
    await runPowerShell(`Dismount-DiskImage -ImagePath '${isoPath.replace(/'/g, "''")}'`);
    return;
  }
  if (process.platform === "darwin" && mountInfo?.mountPath) {
    await execFileAsync("hdiutil", ["detach", mountInfo.mountPath], { windowsHide: true }).catch(() => {});
  }
}

async function copyDirectory(source, target, onProgress) {
  let copied = 0;
  const files = await collectFiles(source);
  const total = files.reduce((sum, f) => sum + f.size, 0);

  for (const file of files) {
    const rel = path.relative(source, file.path);
    const dest = path.join(target, rel);
    await fsPromises.mkdir(path.dirname(dest), { recursive: true });
    await fsPromises.copyFile(file.path, dest);
    copied += file.size;
    onProgress?.({
      phase: "extract",
      received: copied,
      total,
      percent: total ? Math.round((copied / total) * 100) : null
    });
  }
}

async function collectFiles(dir) {
  const entries = await fsPromises.readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(full)));
    } else {
      const stat = await fsPromises.stat(full);
      files.push({ path: full, size: stat.size });
    }
  }
  return files;
}

function resolveTargetPath(partitionPlan) {
  if (process.platform === "win32") {
    return `${partitionPlan.linuxDriveLetter}:\\`;
  }
  return partitionPlan.linuxDriveLetter;
}

function resolveSourcePath(mountInfo) {
  if (mountInfo.mountPath) return mountInfo.mountPath;
  return `${mountInfo.driveLetter}:\\`;
}

async function extractIsoToPartition(isoPath, partitionPlan, onProgress) {
  const target = resolveTargetPath(partitionPlan);
  await fsPromises.mkdir(target, { recursive: true }).catch(() => {});

  const mountInfo = await mountIso(isoPath);
  const source = resolveSourcePath(mountInfo);

  try {
    if (process.platform === "win32") {
      const script = `
        robocopy '${source.replace(/'/g, "''")}' '${target.replace(/'/g, "''")}' /E /R:2 /W:2 /NFL /NDL /NJH /NJS /NC /NS /NP
        if ($LASTEXITCODE -ge 8) { exit $LASTEXITCODE } else { exit 0 }
      `;
      await runPowerShell(script, 900000);
      onProgress?.({ phase: "extract", received: 100, total: 100, percent: 100 });
    } else {
      await copyDirectory(source, target, onProgress);
    }
  } finally {
    await unmountIso(isoPath, mountInfo);
  }

  return { target, source };
}

async function configureGrub(partitionPlan, distroName, onProgress) {
  onProgress?.({ phase: "grub", received: 0, total: 100, percent: 10 });

  if (process.platform === "win32") {
    const linuxDrive = partitionPlan.linuxDriveLetter;
    const safeName = distroName.replace(/'/g, "''");
    const script = [
      "$ErrorActionPreference = 'Stop'",
      `$linuxRoot = "${linuxDrive}:\\"`,
      "$bootCandidates = @(",
      "  '\\EFI\\BOOT\\bootx64.efi',",
      "  '\\EFI\\BOOT\\BOOTX64.EFI',",
      "  '\\EFI\\ubuntu\\grubx64.efi',",
      "  '\\EFI\\debian\\grubx64.efi',",
      "  '\\EFI\\fedora\\grubx64.efi'",
      ")",
      "$bootPath = $null",
      "foreach ($candidate in $bootCandidates) {",
      "  if (Test-Path ($linuxRoot + $candidate.TrimStart('\\'))) { $bootPath = $candidate; break }",
      "}",
      "if (-not $bootPath) { throw 'No UEFI boot loader found on the Linux partition after extract' }",
      `$entry = bcdedit /copy '{bootmgr}' /d 'Shift: ${safeName}' 2>&1`,
      "if ($entry -match '\\{([0-9a-f-]+)\\}') {",
      "  $guid = '{' + $Matches[1] + '}'",
      "  bcdedit /set $guid device \"partition=${linuxDrive}:\" | Out-Null",
      "  bcdedit /set $guid path $bootPath | Out-Null",
      "  bcdedit /displayorder $guid /addfirst | Out-Null",
      "}",
      "'ok'"
    ].join("\n");
    await runPowerShell(script);
    onProgress?.({ phase: "grub", received: 100, total: 100, percent: 100 });
    return { ok: true, method: "bcdedit-chainload-linux-partition" };
  }

  if (process.platform === "darwin") {
    await execFileAsync("bless", ["--folder", "/Volumes/SHIFT_LINUX/EFI/BOOT", "--label", distroName], {
      windowsHide: true
    }).catch(() => {});
    onProgress?.({ phase: "grub", received: 100, total: 100, percent: 100 });
    return { ok: true, method: "bless" };
  }

  throw new Error("Bootloader configuration not supported on this platform");
}

module.exports = {
  extractIsoToPartition,
  configureGrub
};
