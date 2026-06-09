const { shell } = require("electron");
const { getDistroSeaDemoUrl } = require("./distro-sources");

async function openDistroSeaDemo(distroId) {
  const url = getDistroSeaDemoUrl(distroId);
  if (!url) {
    throw new Error("Demo is not available for this operating system yet");
  }
  await shell.openExternal(url);
  return { ok: true, url };
}

module.exports = {
  openDistroSeaDemo
};
