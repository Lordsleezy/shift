const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const {
  WINDOWS_RESTORE_ROOT,
  LINUX_RESTORE_FOLDER,
  loadManifestFromWindows,
  validateManifest
} = require("./restore-manifest");

const execFileAsync = promisify(execFile);

async function runPowerShell(script, timeout = 600000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 50 * 1024 * 1024, timeout }
  );
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function deployRevertScripts(manifest) {
  const revertPs1 = await fs.readFile(path.join(__dirname, "revert.ps1"), "utf8");
  const triggerPs1 = await fs.readFile(path.join(__dirname, "revert-trigger.ps1"), "utf8");

  await fs.mkdir(WINDOWS_RESTORE_ROOT, { recursive: true });
  await fs.writeFile(path.join(WINDOWS_RESTORE_ROOT, "revert.ps1"), revertPs1, "utf8");
  await fs.writeFile(path.join(WINDOWS_RESTORE_ROOT, "revert-trigger.ps1"), triggerPs1, "utf8");

  if (manifest.linuxPartition?.driveLetter) {
    const linuxRoot = `${manifest.linuxPartition.driveLetter}:\\${LINUX_RESTORE_FOLDER}`;
    await fs.mkdir(linuxRoot, { recursive: true });
    await fs.writeFile(path.join(linuxRoot, "revert.ps1"), revertPs1, "utf8");
  }
}

async function registerBootTriggerTask() {
  const script = `
    $action = New-ScheduledTaskAction -Execute 'PowerShell.exe' -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\\ShiftRestore\\revert-trigger.ps1'
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
    Register-ScheduledTask -TaskName 'SentinelRevertBootTrigger' -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest -Force | Out-Null
    'ok'
  `;
  await runPowerShell(script);
}

async function executeRevertFromWindows(onProgress) {
  onProgress?.({ phase: "validate", percent: 5, message: "Loading and validating restore manifest" });

  const { manifest, validation } = await loadManifestFromWindows();
  if (!validation.ok) {
    throw new Error(`Restore manifest is missing or corrupt: ${validation.errors.join("; ")}`);
  }

  onProgress?.({ phase: "validate", percent: 15, message: "Manifest verified — partition math is correct" });

  const m = manifest;
  const win = m.windowsPartition;
  const linux = m.linuxPartition;
  const shift = m.shiftBoot || {};

  const deleteLines = [
    shift.linuxBootGuid ? `bcdedit /delete ${shift.linuxBootGuid} 2>$null` : null,
    shift.revertBootGuid ? `bcdedit /delete ${shift.revertBootGuid} 2>$null` : null,
    shift.grubBootGuid ? `bcdedit /delete ${shift.grubBootGuid} 2>$null` : null
  ]
    .filter(Boolean)
    .join("\n    ");

  const revertScript = `
    $ErrorActionPreference = 'Stop'
    $manifestPath = 'C:\\ShiftRestore\\restore-manifest.json'
    if (-not (Test-Path $manifestPath)) { throw 'Restore manifest not found at C:\\ShiftRestore\\restore-manifest.json' }

    $diskNumber = ${m.disk.diskNumber}
    $linuxPartNumber = ${linux.partitionNumber}
    $originalSize = [int64]${win.originalSizeBytes}
    $winPartNumber = ${win.partitionNumber}

    $linuxPart = Get-Partition -DiskNumber $diskNumber -PartitionNumber $linuxPartNumber -ErrorAction SilentlyContinue
    if (-not $linuxPart) { throw 'Linux partition not found — revert may already be complete' }

    $winPart = Get-Partition -DiskNumber $diskNumber -PartitionNumber $winPartNumber
    $currentWinSize = [int64]$winPart.Size
    $expectedAfterDelete = [int64]$currentWinSize + [int64]$linuxPart.Size

    if ($expectedAfterDelete -ne $originalSize) {
      throw "Partition expansion math failed: current Windows $($currentWinSize) + Linux $($linuxPart.Size) = $($expectedAfterDelete), expected original $($originalSize)"
    }

    # Remove Shift boot entries before deleting Linux partition
    ${deleteLines || "# no shift boot entries recorded"}

    # Delete Linux partition and expand Windows back to original size
    Remove-Partition -DiskNumber $diskNumber -PartitionNumber $linuxPartNumber -Confirm:$false
    Start-Sleep -Seconds 2
    Resize-Partition -DiskNumber $diskNumber -PartitionNumber $winPartNumber -Size $originalSize

    # Clean up trigger file if present
    if (Test-Path 'C:\\ShiftRestore\\BOOT_TRIGGER_REVERT') { Remove-Item 'C:\\ShiftRestore\\BOOT_TRIGGER_REVERT' -Force }

    # Disable boot trigger task after successful revert
    Unregister-ScheduledTask -TaskName 'SentinelRevertBootTrigger' -Confirm:$false -ErrorAction SilentlyContinue

    'ok'
  `;

  onProgress?.({ phase: "revert", percent: 40, message: "Removing Linux partition and restoring Windows size" });
  await runPowerShell(revertScript);

  onProgress?.({ phase: "revert", percent: 90, message: "Windows partition restored to original size" });
  return { ok: true, manifest };
}

async function rebootAfterRevert() {
  await runPowerShell("shutdown.exe /r /t 15 /c \"Sentinel — Windows has been restored. Restarting now.\"");
  return { ok: true, delaySeconds: 15 };
}

module.exports = {
  deployRevertScripts,
  registerBootTriggerTask,
  executeRevertFromWindows,
  rebootAfterRevert
};
