const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const MANIFEST_VERSION = 1;
const MANIFEST_FILENAME = "restore-manifest.json";
const WINDOWS_RESTORE_ROOT = "C:\\ShiftRestore";
const LINUX_RESTORE_FOLDER = "ShiftRestore";

async function runPowerShell(script, timeout = 120000) {
  const { stdout, stderr } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script],
    { windowsHide: true, maxBuffer: 20 * 1024 * 1024, timeout }
  );
  return `${stdout || ""}${stderr || ""}`.trim();
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce((acc, key) => {
        acc[key] = sortKeysDeep(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function manifestChecksum(manifest) {
  const clone = { ...manifest };
  delete clone.checksum;
  delete clone.checksumAlgorithm;
  const payload = JSON.stringify(sortKeysDeep(clone));
  return crypto.createHash("sha256").update(payload).digest("hex");
}

function validateManifestMath(manifest) {
  const errors = [];
  const win = manifest.windowsPartition;
  const linux = manifest.linuxPartition;

  if (!win || !linux) {
    errors.push("Missing windowsPartition or linuxPartition records");
    return errors;
  }

  const expectedOriginal = Number(win.sizeAfterShrinkBytes) + Number(linux.sizeBytes);
  const original = Number(win.originalSizeBytes);

  if (expectedOriginal !== original) {
    errors.push(
      `Partition math mismatch: original ${original} != shrunk ${win.sizeAfterShrinkBytes} + linux ${linux.sizeBytes} (${expectedOriginal})`
    );
  }

  if (Number(linux.offsetBytes) <= Number(win.offsetBytes)) {
    errors.push("Linux partition offset must be after Windows partition");
  }

  if (Number(linux.offsetBytes) !== Number(win.offsetBytes) + Number(win.sizeAfterShrinkBytes)) {
    errors.push(
      `Linux partition offset ${linux.offsetBytes} != Windows offset ${win.offsetBytes} + shrunk size ${win.sizeAfterShrinkBytes}`
    );
  }

  return errors;
}

function validateManifest(manifest) {
  const errors = [];

  if (!manifest) errors.push("Manifest is empty");
  if (manifest?.version !== MANIFEST_VERSION) errors.push(`Unsupported manifest version: ${manifest?.version}`);
  if (!manifest?.capturedAt) errors.push("Missing capturedAt timestamp");
  if (manifest?.disk?.diskNumber == null) errors.push("Missing disk number");
  if (!Array.isArray(manifest?.partitionsBefore)) errors.push("Missing partitionsBefore snapshot");
  if (!manifest?.bcd?.raw) errors.push("Missing bcd snapshot");

  const expected = manifestChecksum(manifest);
  if (!manifest.checksum || manifest.checksum !== expected) {
    errors.push("Manifest checksum is missing or corrupt");
  }

  errors.push(...validateManifestMath(manifest));

  return { ok: errors.length === 0, errors };
}

async function capturePartitionLayout() {
  const script = `
    $ErrorActionPreference = 'Stop'
    $winPart = Get-Partition | Where-Object { $_.AccessPaths -contains 'C:\\' } | Select-Object -First 1
    if (-not $winPart) { $winPart = Get-Partition | Where-Object { $_.DriveLetter -eq 'C' } | Select-Object -First 1 }
    if (-not $winPart) { throw 'Could not find Windows (C:) partition' }
    $winVol = Get-Volume -DriveLetter C
    $disk = Get-Disk -Number $winPart.DiskNumber
    $parts = Get-Partition -DiskNumber $winPart.DiskNumber | Sort-Object Offset
    $layout = [ordered]@{
      capturedAt = (Get-Date).ToUniversalTime().ToString('o')
      disk = @{
        diskNumber = [int]$disk.Number
        sizeBytes = [int64]$disk.Size
        partitionStyle = [string]$disk.PartitionStyle
        guid = [string]$disk.Guid
      }
      windowsPartition = @{
        driveLetter = 'C'
        partitionNumber = [int]$winPart.PartitionNumber
        offsetBytes = [int64]$winPart.Offset
        originalSizeBytes = [int64]$winPart.Size
        volumeSizeBytes = [int64]$winVol.Size
        freeBytes = [int64]$winVol.SizeRemaining
        usedBytes = [int64]($winVol.Size - $winVol.SizeRemaining)
        gptType = [string]$winPart.GptType
        type = [string]$winPart.Type
      }
      partitionsBefore = @(
        $parts | ForEach-Object {
          [ordered]@{
            partitionNumber = [int]$_.PartitionNumber
            offsetBytes = [int64]$_.Offset
            sizeBytes = [int64]$_.Size
            driveLetter = if ($_.DriveLetter) { [string]$_.DriveLetter } else { $null }
            gptType = [string]$_.GptType
            type = [string]$_.Type
            isSystem = [bool]$_.IsSystem
            isBoot = [bool]$_.IsBoot
          }
        }
      )
    }
    $layout | ConvertTo-Json -Depth 6 -Compress
  `;

  const output = await runPowerShell(script);
  return JSON.parse(output);
}

async function captureBcdSnapshot() {
  const raw = await runPowerShell("bcdedit /enum all /v");
  const entries = [];
  const blocks = raw.split(/\r?\n\r?\n/);
  for (const block of blocks) {
    const idMatch = block.match(/identifier\s+(\{[^\}]+\})/i);
    if (!idMatch) continue;
    const descMatch = block.match(/description\s+(.+)/i);
    entries.push({
      id: idMatch[1].trim(),
      description: descMatch ? descMatch[1].trim() : ""
    });
  }
  return { raw, entries, capturedAt: new Date().toISOString() };
}

async function capturePreChangeSnapshot() {
  const layout = await capturePartitionLayout();
  const bcd = await captureBcdSnapshot();
  return {
    version: MANIFEST_VERSION,
    capturedAt: new Date().toISOString(),
    ...layout,
    bcd,
    linuxPartition: null,
    shiftBoot: null
  };
}

function finalizeManifest(base, partitionResult, shiftBoot) {
  const manifest = {
    ...base,
    updatedAt: new Date().toISOString(),
    windowsPartition: {
      ...base.windowsPartition,
      sizeAfterShrinkBytes: Number(partitionResult.windowsSizeAfterBytes),
      driveLetter: partitionResult.windowsDriveLetter || "C"
    },
    linuxPartition: {
      driveLetter: partitionResult.linuxDriveLetter,
      sizeBytes: Number(partitionResult.linuxBytes),
      partitionNumber: partitionResult.linuxPartitionNumber || null,
      offsetBytes: partitionResult.linuxOffsetBytes || null,
      diskNumber: base.disk.diskNumber
    },
    shiftBoot: shiftBoot || null
  };

  manifest.checksumAlgorithm = "sha256";
  manifest.checksum = manifestChecksum(manifest);

  const validation = validateManifest(manifest);
  if (!validation.ok) {
    throw new Error(`Restore manifest failed validation: ${validation.errors.join("; ")}`);
  }

  return manifest;
}

async function enrichPartitionResult(baseManifest, partitionResult) {
  const script = `
    $ErrorActionPreference = 'Stop'
    $letter = '${partitionResult.linuxDriveLetter}'
    $part = Get-Partition | Where-Object { $_.DriveLetter -eq $letter } | Select-Object -First 1
    if (-not $part) { throw 'Could not find Linux partition after creation' }
    $winPart = Get-Partition | Where-Object { $_.AccessPaths -contains 'C:\\' } | Select-Object -First 1
    if (-not $winPart) { $winPart = Get-Partition | Where-Object { $_.DriveLetter -eq 'C' } | Select-Object -First 1 }
    [ordered]@{
      linuxPartitionNumber = [int]$part.PartitionNumber
      linuxOffsetBytes = [int64]$part.Offset
      linuxSizeBytes = [int64]$part.Size
      windowsSizeAfterBytes = [int64]$winPart.Size
      windowsOffsetBytes = [int64]$winPart.Offset
    } | ConvertTo-Json -Compress
  `;

  const details = JSON.parse(await runPowerShell(script));
  return {
    ...partitionResult,
    linuxPartitionNumber: details.linuxPartitionNumber,
    linuxOffsetBytes: details.linuxOffsetBytes,
    windowsSizeAfterBytes: details.windowsSizeAfterBytes
  };
}

async function writeManifestCopies(manifest, linuxDriveLetter) {
  const json = JSON.stringify(manifest, null, 2);
  const shaSidecar = `${manifest.checksum}\n`;

  const windowsRoot = WINDOWS_RESTORE_ROOT;
  const windowsPath = path.join(windowsRoot, MANIFEST_FILENAME);

  await fs.mkdir(windowsRoot, { recursive: true });
  await fs.writeFile(windowsPath, json, "utf8");
  await fs.writeFile(path.join(windowsRoot, "restore-manifest.sha256"), shaSidecar, "utf8");

  if (linuxDriveLetter) {
    const linuxRoot = `${linuxDriveLetter}:\\${LINUX_RESTORE_FOLDER}`;
    await fs.mkdir(linuxRoot, { recursive: true });
    await fs.writeFile(path.join(linuxRoot, MANIFEST_FILENAME), json, "utf8");
    await fs.writeFile(path.join(linuxRoot, "restore-manifest.sha256"), shaSidecar, "utf8");
  }

  return {
    windowsPath,
    linuxPath: linuxDriveLetter ? `${linuxDriveLetter}:\\${LINUX_RESTORE_FOLDER}\\${MANIFEST_FILENAME}` : null
  };
}

async function loadManifestFromWindows() {
  const windowsPath = path.join(WINDOWS_RESTORE_ROOT, MANIFEST_FILENAME);
  const raw = await fs.readFile(windowsPath, "utf8");
  const manifest = JSON.parse(raw);
  return { manifest, path: windowsPath, validation: validateManifest(manifest) };
}

module.exports = {
  MANIFEST_VERSION,
  MANIFEST_FILENAME,
  WINDOWS_RESTORE_ROOT,
  LINUX_RESTORE_FOLDER,
  capturePreChangeSnapshot,
  enrichPartitionResult,
  finalizeManifest,
  writeManifestCopies,
  validateManifest,
  validateManifestMath,
  manifestChecksum,
  loadManifestFromWindows
};
