const { shell } = require("electron");
const { getWebvmDemoUrl } = require("./distro-sources");

async function openWebDemo(distroId) {
  const url = getWebvmDemoUrl(distroId);
  if (!url) {
    throw new Error("Demo is not available for this operating system yet");
  }
  await shell.openExternal(url);
  return { ok: true, url };
}

module.exports = {
  openWebDemo
};
