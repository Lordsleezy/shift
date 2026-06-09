const fs = require("fs/promises");
const path = require("path");

const ASSET_SUBDIRS = ["os-logos", "screenshots"];

async function copyAssets() {
  const root = path.join(__dirname, "..");
  const distAssets = path.join(root, "dist", "assets");

  await fs.mkdir(distAssets, { recursive: true });

  for (const subdir of ASSET_SUBDIRS) {
    const source = path.join(root, "assets", subdir);
    const target = path.join(distAssets, subdir);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.cp(source, target, { recursive: true });
  }

  console.log("Copied static assets into dist/assets/os-logos and dist/assets/screenshots");
}

copyAssets().catch((error) => {
  console.error(error);
  process.exit(1);
});
