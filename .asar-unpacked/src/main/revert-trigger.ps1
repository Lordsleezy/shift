# Runs at Windows startup. If boot menu wrote BOOT_TRIGGER_REVERT, execute full revert.
$trigger = "C:\ShiftRestore\BOOT_TRIGGER_REVERT"
$revert = "C:\ShiftRestore\revert.ps1"

if (Test-Path $trigger) {
  if (Test-Path $revert) {
    & PowerShell.exe -NoProfile -ExecutionPolicy Bypass -File $revert
  }
}
