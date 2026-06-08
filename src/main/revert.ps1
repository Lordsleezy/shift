# Sentinel — Go Back to Windows
# Validates restore-manifest.json, verifies partition math, then reverts safely.
# Never proceeds if manifest is missing or corrupt.

$ErrorActionPreference = "Stop"

function Fail($message) {
  Write-Error $message
  exit 1
}

$manifestPath = "C:\ShiftRestore\restore-manifest.json"
if (-not (Test-Path $manifestPath)) {
  Fail "Restore manifest not found. Cannot revert safely."
}

$manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json

if (-not $manifest.checksum) {
  Fail "Manifest checksum missing — aborting revert."
}

$shaPath = "C:\ShiftRestore\restore-manifest.sha256"
if (Test-Path $shaPath) {
  $sidecar = (Get-Content $shaPath -Raw).Trim()
  if ($sidecar -ne $manifest.checksum) {
    Fail "Manifest sidecar checksum mismatch — manifest may be corrupt. Aborting revert."
  }
}

$win = $manifest.windowsPartition
$linux = $manifest.linuxPartition
$expectedOriginal = [int64]$win.sizeAfterShrinkBytes + [int64]$linux.sizeBytes
$original = [int64]$win.originalSizeBytes
if ($expectedOriginal -ne $original) {
  Fail "Partition math verification failed: original $original != $($win.sizeAfterShrinkBytes) + $($linux.sizeBytes)"
}

$diskNumber = [int]$manifest.disk.diskNumber
$linuxPartNumber = [int]$linux.partitionNumber
$winPartNumber = [int]$win.partitionNumber

$linuxPart = Get-Partition -DiskNumber $diskNumber -PartitionNumber $linuxPartNumber -ErrorAction SilentlyContinue
if (-not $linuxPart) {
  Fail "Linux partition not found. Revert may already be complete."
}

$winPart = Get-Partition -DiskNumber $diskNumber -PartitionNumber $winPartNumber
$expectedAfterDelete = [int64]$winPart.Size + [int64]$linuxPart.Size
if ($expectedAfterDelete -ne $original) {
  Fail "Expansion math failed before changes: Windows $($winPart.Size) + Linux $($linuxPart.Size) = $expectedAfterDelete, expected $original"
}

if ($manifest.shiftBoot) {
  if ($manifest.shiftBoot.linuxBootGuid) {
    bcdedit /delete $manifest.shiftBoot.linuxBootGuid 2>$null
  }
  if ($manifest.shiftBoot.revertBootGuid) {
    bcdedit /delete $manifest.shiftBoot.revertBootGuid 2>$null
  }
  if ($manifest.shiftBoot.grubBootGuid) {
    bcdedit /delete $manifest.shiftBoot.grubBootGuid 2>$null
  }
}

Remove-Partition -DiskNumber $diskNumber -PartitionNumber $linuxPartNumber -Confirm:$false
Start-Sleep -Seconds 2
Resize-Partition -DiskNumber $diskNumber -PartitionNumber $winPartNumber -Size $original

if (Test-Path "C:\ShiftRestore\BOOT_TRIGGER_REVERT") {
  Remove-Item "C:\ShiftRestore\BOOT_TRIGGER_REVERT" -Force
}

Unregister-ScheduledTask -TaskName "SentinelRevertBootTrigger" -Confirm:$false -ErrorAction SilentlyContinue

Write-Host "Sentinel revert complete. Windows restored to original partition size."
shutdown.exe /r /t 15 /c "Sentinel — Windows restored. Restarting."
