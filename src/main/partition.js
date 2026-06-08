const { execFile } = require("child_process");
const { promisify } = require("util");
const fs = require("fs/promises");
const path = require("path");
const { getInstallDir } = require("./paths");

const execFileAsync = promisify(execFile);

const GB = 1024 * 1024 * 1024;
const MIN_WINDOWS_FREE_BYTES = 20 * GB;

async function runPowerShell(script, timeout = 120000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 10 * 1024 * 1024, timeout }
  );
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function isProcessElevated() {
  if (process.platform === "win32") {
    try {
      await execFileAsync("net", ["session"], { windowsHide: true, timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
  return process.getuid?.() === 0;
}

function validateLinuxAllocation(layout, linuxBytes) {
  if (linuxBytes < layout.minLinuxBytes) {
    throw new Error(`Linux partition must be at least ${Math.round(layout.minLinuxBytes / GB)} GB`);
  }
  if (linuxBytes > layout.maxLinuxBytes) {
    throw new Error(`Cannot allocate more than ${Math.round(layout.maxLinuxBytes / GB)} GB for Linux`);
  }

  const windowsFreeAfter = layout.windowsPartition.freeBytes - linuxBytes;
  if (windowsFreeAfter < MIN_WINDOWS_FREE_BYTES) {
    throw new Error(
      `This would leave Windows with only ${Math.round(Math.max(0, windowsFreeAfter) / GB)} GB free. ` +
        `Shift requires at least ${Math.round(MIN_WINDOWS_FREE_BYTES / GB)} GB free on Windows after shrinking.`
    );
  }
}

async function getDriveLayout() {
  const elevated = await isProcessElevated();

  if (process.platform === "win32") {
    const elevatedLiteral = elevated ? "$true" : "$false";
    const script = `
      $ErrorActionPreference = 'Stop'
      $vol = Get-Volume -DriveLetter C
      if (-not $vol) { throw 'Could not find Windows (C:) volume' }
      $part = Get-Partition | Where-Object { $_.AccessPaths -contains 'C:\\' } | Select-Object -First 1
      if (-not $part) {
        $part = Get-Partition | Where-Object { $_.DriveLetter -eq 'C' } | Select-Object -First 1
      }
      $maxShrink = $null
      $sizeMin = $null
      if ($part) {
        $supported = Get-PartitionSupportedSize -InputObject $part
        $sizeMin = [int64]$supported.SizeMin
        $maxShrink = [int64]$part.Size - $sizeMin
      } else {
        $sizeMin = [int64]($vol.Size - $vol.SizeRemaining)
        $maxShrink = [int64][Math]::Max([int64]0, [int64]$vol.SizeRemaining - [int64]${MIN_WINDOWS_FREE_BYTES})
      }
      $maxLinux = [int64][Math]::Min([int64]$maxShrink, [int64][Math]::Max([int64]0, [int64]$vol.SizeRemaining - [int64]${MIN_WINDOWS_FREE_BYTES}))
      $layout = [ordered]@{
        platform = 'win32'
        elevated = ${elevatedLiteral}
        partitionDiscovered = [bool]$part
        windowsPartition = @{
          driveLetter = 'C'
          sizeBytes = [int64]$vol.Size
          usedBytes = [int64]($vol.Size - $vol.SizeRemaining)
          freeBytes = [int64]$vol.SizeRemaining
          maxShrinkBytes = [int64]$maxShrink
          minSizeBytes = [int64]$sizeMin
        }
        diskNumber = if ($part) { [int]$part.DiskNumber } else { $null }
        recommendedLinuxBytes = [int64]([Math]::Min([Math]::Max((40 * 1024 * 1024 * 1024), $maxLinux / 2), $maxLinux))
        minLinuxBytes = [int64]((25 * 1024 * 1024 * 1024))
        maxLinuxBytes = [int64]$maxLinux
        minWindowsFreeBytes = [int64]${MIN_WINDOWS_FREE_BYTES}
      }
      $layout | ConvertTo-Json -Depth 5 -Compress
    `;

    const output = await runPowerShell(script);
    const layout = JSON.parse(output);
    layout.elevated = elevated;
    return layout;
  }

  if (process.platform === "darwin") {
    const { stdout } = await execFileAsync("diskutil", ["info", "-plist", "/"], { windowsHide: true });
    const plist = stdout;
    const sizeMatch = plist.match(/<key>TotalSize<\/key>\s*<integer>(\d+)<\/integer>/);
    const freeMatch = plist.match(/<key>FreeSpace<\/key>\s*<integer>(\d+)<\/integer>/);
    const total = sizeMatch ? Number(sizeMatch[1]) : 0;
    const free = freeMatch ? Number(freeMatch[1]) : 0;
    const maxLinux = Math.max(0, Math.min(free - MIN_WINDOWS_FREE_BYTES, free - 10 * GB));

    return {
      platform: "darwin",
      elevated,
      partitionDiscovered: true,
      windowsPartition: {
        driveLetter: "/",
        sizeBytes: total,
        usedBytes: total - free,
        freeBytes: free,
        maxShrinkBytes: maxLinux
      },
      diskNumber: null,
      recommendedLinuxBytes: Math.min(Math.max(40 * GB, Math.floor(maxLinux / 2)), maxLinux),
      minLinuxBytes: 25 * GB,
      maxLinuxBytes: maxLinux,
      minWindowsFreeBytes: MIN_WINDOWS_FREE_BYTES
    };
  }

  throw new Error("Partition management is supported on Windows and macOS only");
}

async function applyPartitionPlan(linuxBytes) {
  const elevated = await isProcessElevated();
  if (!elevated) {
    throw new Error("Administrator privileges are required to shrink the Windows partition. Restart Shift as Administrator.");
  }

  const layout = await getDriveLayout();
  validateLinuxAllocation(layout, linuxBytes);

  if (process.platform === "win32" && !layout.partitionDiscovered) {
    throw new Error(
      "Could not access disk partition metadata for C:. Close other disk tools and restart Shift as Administrator."
    );
  }

  const planPath = path.join(getInstallDir(), "partition-plan.json");
  await fs.mkdir(getInstallDir(), { recursive: true });

  if (process.platform === "win32") {
    const script = `
      $ErrorActionPreference = 'Stop'
      $linuxBytes = [int64]${linuxBytes}
      $part = Get-Partition | Where-Object { $_.AccessPaths -contains 'C:\\' } | Select-Object -First 1
      if (-not $part) { $part = Get-Partition | Where-Object { $_.DriveLetter -eq 'C' } | Select-Object -First 1 }
      if (-not $part) { throw 'Could not find Windows (C:) partition' }
      $supported = Get-PartitionSupportedSize -InputObject $part
      $newSize = [int64]$part.Size - $linuxBytes
      if ($newSize -lt $supported.SizeMin) {
        throw 'Shrink would leave Windows partition too small for your data'
      }
      # Non-destructive shrink — does NOT format C: or delete files
      Resize-Partition -InputObject $part -Size $newSize
      $newPart = New-Partition -DiskNumber $part.DiskNumber -Size $linuxBytes -AssignDriveLetter
      Start-Sleep -Seconds 2
      $letter = $newPart.DriveLetter
      if (-not $letter) {
        $letter = (Get-Partition -DiskNumber $part.DiskNumber | Sort-Object Offset -Descending | Select-Object -First 1).DriveLetter
      }
      # Format ONLY the new Linux partition — Windows (C:) is untouched
      Format-Volume -DriveLetter $letter -FileSystem FAT32 -NewFileSystemLabel 'SHIFT_LINUX' -Confirm:$false | Out-Null
      [ordered]@{
        ok = $true
        linuxDriveLetter = [string]$letter
        linuxBytes = $linuxBytes
        windowsDriveLetter = 'C'
        windowsSizeAfterBytes = [int64]$newSize
      } | ConvertTo-Json -Compress
    `;

    const output = await runPowerShell(script, 300000);
    const result = JSON.parse(output);
    await fs.writeFile(
      planPath,
      JSON.stringify({ ...result, linuxBytes, appliedAt: new Date().toISOString() }, null, 2)
    );
    return result;
  }

  if (process.platform === "darwin") {
    const shrinkGb = Math.ceil(linuxBytes / GB);
    await execFileAsync(
      "diskutil",
      ["apfs", "resizeVolume", "disk1s1", `${shrinkGb}g`, "free", "shift", "exfat"],
      { windowsHide: true, timeout: 300000 }
    ).catch(async () => {
      await execFileAsync(
        "diskutil",
        ["splitPartition", "disk0s2", "ExFAT", "SHIFT_LINUX", `${shrinkGb}g`, "APFS", "Macintosh HD"],
        { windowsHide: true, timeout: 300000 }
      );
    });

    const result = { ok: true, linuxDriveLetter: "/Volumes/SHIFT_LINUX", linuxBytes, windowsDriveLetter: "/" };
    await fs.writeFile(planPath, JSON.stringify({ ...result, appliedAt: new Date().toISOString() }, null, 2));
    return result;
  }

  throw new Error("Unsupported platform");
}

async function loadPartitionPlan() {
  try {
    const raw = await fs.readFile(path.join(getInstallDir(), "partition-plan.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

module.exports = {
  getDriveLayout,
  applyPartitionPlan,
  loadPartitionPlan,
  validateLinuxAllocation,
  MIN_WINDOWS_FREE_BYTES
};
