const fs = require("fs/promises");
const path = require("path");

const COMPANION_FILES = [
  "sentinel-revert.sh",
  "sentinel-revert.desktop",
  "install-companion.sh",
  "README.txt"
];

async function deployCompanionToLinuxPartition(linuxDriveLetter) {
  const companionSrc = path.join(__dirname, "../../companion");
  const linuxRoot = `${linuxDriveLetter}:\\ShiftRestore\\companion`;

  await fs.mkdir(linuxRoot, { recursive: true });

  for (const file of COMPANION_FILES) {
    const src = path.join(companionSrc, file);
    try {
      await fs.copyFile(src, path.join(linuxRoot, file));
    } catch {
      if (file !== "README.txt") throw new Error(`Missing companion file: ${file}`);
    }
  }

  const readme = [
    "Sentinel — Go Back to Windows",
    "",
    "After Linux is installed, run install-companion.sh from this folder:",
    "  bash ShiftRestore/companion/install-companion.sh",
    "",
    "Or open 'Sentinel — Go Back to Windows' from your app menu once installed.",
    "",
    "The restore manifest (restore-manifest.json) in ShiftRestore/ is the source of truth.",
    "Revert never proceeds if the manifest is missing or corrupt."
  ].join("\n");

  await fs.writeFile(path.join(linuxRoot, "README.txt"), readme, "utf8");

  return { linuxCompanionPath: `${linuxRoot}` };
}

module.exports = {
  deployCompanionToLinuxPartition
};
