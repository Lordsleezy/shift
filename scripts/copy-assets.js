const fs = require("fs/promises");
const path = require("path");

async function copyAssets() {
  const root = path.join(__dirname, "..");
  const source = path.join(root, "assets");
  const target = path.join(root, "dist", "assets");

  await fs.rm(target, { recursive: true, force: true });
  await fs.cp(source, target, { recursive: true });
  console.log("Copied assets to dist/assets");
}

copyAssets().catch((error) => {
  console.error(error);
  process.exit(1);
});
