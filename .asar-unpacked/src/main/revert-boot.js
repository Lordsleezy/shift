const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

async function runPowerShell(script, timeout = 120000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout }
  );
  return `${stdout || ""}${stderr || ""}`.trim();
}

async function findEspInfo() {
  const script = `
    $ErrorActionPreference = 'Stop'
    $esp = Get-Partition | Where-Object { $_.GptType -eq '{c12a7328-f81f-11d2-ba4b-00a0c93ec93b}' -or $_.IsSystem } | Select-Object -First 1
    if (-not $esp) { throw 'Could not find EFI System Partition' }
    $vol = Get-Partition -DiskNumber $esp.DiskNumber -PartitionNumber $esp.PartitionNumber | Get-Volume -ErrorAction SilentlyContinue
    $letter = $vol.DriveLetter
    if (-not $letter) {
      $part = Get-Partition -DiskNumber $esp.DiskNumber -PartitionNumber $esp.PartitionNumber
      $part | Add-PartitionAccessPath -AssignDriveLetter -ErrorAction SilentlyContinue | Out-Null
      Start-Sleep -Seconds 1
      $letter = (Get-Partition -DiskNumber $esp.DiskNumber -PartitionNumber $esp.PartitionNumber).DriveLetter
    }
    [ordered]@{
      diskNumber = [int]$esp.DiskNumber
      partitionNumber = [int]$esp.PartitionNumber
      driveLetter = [string]$letter
    } | ConvertTo-Json -Compress
  `;
  return JSON.parse(await runPowerShell(script));
}

async function findLinuxBootEfi(linuxDriveLetter) {
  const candidates = [
    "EFI\\BOOT\\bootx64.efi",
    "EFI\\BOOT\\BOOTX64.EFI",
    "EFI\\ubuntu\\grubx64.efi",
    "EFI\\debian\\grubx64.efi"
  ];
  for (const rel of candidates) {
    const full = path.join(`${linuxDriveLetter}:`, rel);
    try {
      await fs.access(full);
      return rel;
    } catch {
      /* try next */
    }
  }
  return null;
}

function buildGrubCfg(linuxDriveLetter) {
  return `# Shift by Sentinel — Go Back to Windows boot menu
set timeout=8
set default=0

menuentry "Sentinel — Go Back to Windows" {
  insmod part_gpt
  insmod ntfs
  search --no-floppy --file /ShiftRestore/restore-manifest.json --set=root
  write /ShiftRestore/BOOT_TRIGGER_REVERT yes
  search --no-floppy --file /EFI/Microsoft/Boot/bootmgfw.efi --set=root
  chainloader /EFI/Microsoft/Boot/bootmgfw.efi
}

menuentry "Continue Linux Install" {
  insmod part_gpt
  insmod fat
  search --no-floppy --file /EFI/BOOT/bootx64.efi --set=root
  chainloader /EFI/BOOT/bootx64.efi
}
`;
}

async function deployEspGrubMenu(linuxDriveLetter) {
  const esp = await findEspInfo();
  if (!esp.driveLetter) {
    throw new Error("Could not assign drive letter to EFI System Partition");
  }

  const espRoot = `${esp.driveLetter}:\\EFI\\Shift`;
  await fs.mkdir(espRoot, { recursive: true });

  const linuxBootRel = await findLinuxBootEfi(linuxDriveLetter);
  if (linuxBootRel) {
    await fs.copyFile(
      path.join(`${linuxDriveLetter}:`, linuxBootRel),
      path.join(espRoot, "grubx64.efi")
    );
  }

  const grubCfg = buildGrubCfg(linuxDriveLetter);
  await fs.writeFile(path.join(espRoot, "grub.cfg"), grubCfg, "utf8");

  return { esp, espGrubPath: "\\EFI\\Shift\\grubx64.efi" };
}

async function configureRevertBootEntries(partitionPlan, distroName) {
  const linuxDrive = partitionPlan.linuxDriveLetter;
  const safeDistro = distroName.replace(/'/g, "''");
  const safeLinux = linuxDrive.replace(/'/g, "''");

  let espInfo;
  try {
    espInfo = await deployEspGrubMenu(linuxDrive);
  } catch {
    espInfo = null;
  }

  const espLiteral = espInfo?.esp?.driveLetter || "";
  const espGrubPath = espInfo?.espGrubPath || "\\EFI\\Shift\\grubx64.efi";

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
    `$entry = bcdedit /copy '{bootmgr}' /d 'Shift: ${safeDistro}' 2>&1`,
    "$linuxGuid = $null",
    "if ($entry -match '\\{([0-9a-f-]+)\\}') {",
    "  $linuxGuid = '{' + $Matches[1] + '}'",
    `  bcdedit /set $linuxGuid device \"partition=${safeLinux}:\" | Out-Null`,
    "  bcdedit /set $linuxGuid path $bootPath | Out-Null",
    "  bcdedit /displayorder $linuxGuid /addfirst | Out-Null",
    "}",
    "$revertGuid = $null",
    espInfo
      ? [
          `$revertEntry = bcdedit /copy '{bootmgr}' /d 'Sentinel — Go Back to Windows' 2>&1`,
          "if ($revertEntry -match '\\{([0-9a-f-]+)\\}') {",
          "  $revertGuid = '{' + $Matches[1] + '}'",
          `  bcdedit /set $revertGuid device \"partition=${espLiteral}:\" | Out-Null`,
          `  bcdedit /set $revertGuid path '${espGrubPath.replace(/\\/g, "\\\\")}' | Out-Null`,
          "  bcdedit /displayorder $revertGuid /addfirst | Out-Null",
          "}"
        ].join("\n")
      : [
          `$revertEntry = bcdedit /copy '{current}' /d 'Sentinel — Go Back to Windows' 2>&1`,
          "if ($revertEntry -match '\\{([0-9a-f-]+)\\}') {",
          "  $revertGuid = '{' + $Matches[1] + '}'",
          "  bcdedit /displayorder $revertGuid /addfirst | Out-Null",
          "}"
        ].join("\n"),
    "[ordered]@{",
    "  linuxBootGuid = $linuxGuid",
    "  revertBootGuid = $revertGuid",
    "  espDriveLetter = '" + espLiteral + "'",
    "  espGrubPath = '" + espGrubPath.replace(/\\/g, "\\\\") + "'",
    "} | ConvertTo-Json -Compress"
  ].join("\n");

  const output = await runPowerShell(script);
  return JSON.parse(output);
}

module.exports = {
  configureRevertBootEntries,
  deployEspGrubMenu
};
